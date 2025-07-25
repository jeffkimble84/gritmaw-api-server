import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position, Trade } from '@/lib/database/models'

/**
 * Single Position API Route
 * GET /api/positions/[symbol] - Get position details with trades
 * PATCH /api/positions/[symbol] - Update position (stop loss, take profit)
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const position = await Position.findOne({
      userId: session.user.id,
      symbol: params.symbol.toUpperCase(),
      status: 'OPEN'
    }).populate('trades')

    if (!position) {
      return NextResponse.json(
        { success: false, error: 'Position not found' },
        { status: 404 }
      )
    }

    // Get recent trades for this position
    const recentTrades = await Trade.find({
      userId: session.user.id,
      symbol: params.symbol.toUpperCase()
    })
      .sort({ executedAt: -1 })
      .limit(20)
      .lean()

    // Calculate trade statistics
    const tradeStats = Trade.calculatePnL(recentTrades)

    return NextResponse.json({
      success: true,
      data: {
        position,
        trades: recentTrades,
        statistics: {
          ...tradeStats,
          tradeCount: recentTrades.length,
          avgTradeSize: recentTrades.reduce((sum, t) => sum + t.quantity, 0) / recentTrades.length
        }
      }
    })

  } catch (error) {
    console.error('Error fetching position:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch position' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { stopLoss, takeProfit } = body

    await connectToDatabase()

    const position = await Position.findOne({
      userId: session.user.id,
      symbol: params.symbol.toUpperCase(),
      status: 'OPEN'
    })

    if (!position) {
      return NextResponse.json(
        { success: false, error: 'Position not found' },
        { status: 404 }
      )
    }

    // TODO: Add risk metrics when schema supports it
    // Store risk info in notes for now
    if (stopLoss !== undefined || takeProfit !== undefined) {
      const riskInfo = []
      if (stopLoss !== undefined) riskInfo.push(`Stop Loss: ${stopLoss}`)
      if (takeProfit !== undefined) riskInfo.push(`Take Profit: ${takeProfit}`)
      position.notes = position.notes ? `${position.notes}; ${riskInfo.join(', ')}` : riskInfo.join(', ')
    }

    await position.save()

    return NextResponse.json({
      success: true,
      data: {
        position,
        message: 'Position risk parameters updated successfully'
      }
    })

  } catch (error) {
    console.error('Error updating position:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update position' },
      { status: 500 }
    )
  }
}