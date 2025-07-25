import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy, Trade, Order } from '@/lib/database/models'
import { z } from 'zod'

/**
 * Single Strategy API Route
 * GET /api/strategies/[strategyId] - Get strategy details
 * PATCH /api/strategies/[strategyId] - Update strategy
 * DELETE /api/strategies/[strategyId] - Delete strategy
 */

const updateStrategySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TESTING', 'ARCHIVED']).optional(),
  configuration: z.object({
    entryRules: z.array(z.any()).optional(),
    exitRules: z.array(z.any()).optional(),
    riskManagement: z.any().optional(),
    marketConditions: z.any().optional()
  }).optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: { strategyId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const strategy = await Strategy.findById(params.strategyId).lean()

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      )
    }

    // Check ownership
    if (strategy.userId.toString() !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Get related trades and orders if owner
    let trades: any[] = []
    let orders: any[] = []
    if (strategy.userId.toString() === session.user.id) {
      trades = await Trade.find({ strategyId: params.strategyId })
        .sort({ executedAt: -1 })
        .limit(50)
        .lean()
      
      orders = await Order.find({ strategyId: params.strategyId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    }

    return NextResponse.json({
      success: true,
      data: {
        strategy,
        trades,
        orders,
        isOwner: strategy.userId.toString() === session.user.id
      }
    })

  } catch (error) {
    console.error('Error fetching strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch strategy' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { strategyId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = updateStrategySchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    await connectToDatabase()

    const strategy = await Strategy.findOne({
      _id: params.strategyId,
      userId: session.user.id
    })

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      )
    }

    // Update fields
    if (updateData.name) strategy.name = updateData.name
    if (updateData.description !== undefined) strategy.description = updateData.description
    if (updateData.status) strategy.status = updateData.status
    // TODO: Add parameter updates when request schema supports it

    // Increment version
    if (!strategy.metadata) strategy.metadata = {}
    strategy.metadata.version = (strategy.metadata.version || 1) + 1

    await strategy.save()

    return NextResponse.json({
      success: true,
      data: {
        strategy,
        message: 'Strategy updated successfully'
      }
    })

  } catch (error) {
    console.error('Error updating strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update strategy' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { strategyId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const strategy = await Strategy.findOne({
      _id: params.strategyId,
      userId: session.user.id
    })

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      )
    }

    // Check if strategy has active orders
    const activeOrders = await Order.findActiveOrders(session.user.id)
    const hasActiveOrders = activeOrders.some(o => o.metadata?.strategyId === params.strategyId)

    if (hasActiveOrders) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete strategy with active orders' },
        { status: 400 }
      )
    }

    // Archive instead of delete
    strategy.status = 'ARCHIVED'
    await strategy.save()

    return NextResponse.json({
      success: true,
      data: {
        message: 'Strategy archived successfully'
      }
    })

  } catch (error) {
    console.error('Error deleting strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete strategy' },
      { status: 500 }
    )
  }
}