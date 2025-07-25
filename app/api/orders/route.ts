import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Order, Position } from '@/lib/database/models'
import { z } from 'zod'

/**
 * Orders API Route
 * GET /api/orders - List user's orders
 * POST /api/orders - Create new order
 */

// Order creation schema
const createOrderSchema = z.object({
  symbol: z.string().min(1).max(10).transform(s => s.toUpperCase()),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(['DAY', 'GTC', 'IOC', 'FOK']).optional().default('DAY'),
  strategyId: z.string().optional(),
  metadata: z.object({
    source: z.enum(['MANUAL', 'AUTOMATED', 'AI_SUGGESTED']).optional(),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional()
  }).optional()
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const symbol = searchParams.get('symbol')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    const query: any = { userId: session.user.id }
    if (status) {
      query.status = status
    }
    if (symbol) {
      query.symbol = symbol.toUpperCase()
    }

    // Fetch orders with pagination
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .populate('strategyId', 'name type')
        .lean(),
      Order.countDocuments(query)
    ])

    return NextResponse.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    })

  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = createOrderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const orderData = validationResult.data

    await connectToDatabase()

    // Additional validation based on order type
    if ((orderData.type === 'LIMIT' || orderData.type === 'STOP_LIMIT') && !orderData.price) {
      return NextResponse.json(
        { success: false, error: 'Price is required for LIMIT orders' },
        { status: 400 }
      )
    }

    if ((orderData.type === 'STOP' || orderData.type === 'STOP_LIMIT') && !orderData.stopPrice) {
      return NextResponse.json(
        { success: false, error: 'Stop price is required for STOP orders' },
        { status: 400 }
      )
    }

    // Check if user has sufficient buying power (simplified check)
    if (orderData.side === 'BUY') {
      // In a real system, check account balance/margin
      const estimatedCost = orderData.quantity * (orderData.price || 0)
      if (estimatedCost > 1000000) { // Placeholder limit
        return NextResponse.json(
          { success: false, error: 'Insufficient buying power' },
          { status: 400 }
        )
      }
    }

    // Check if user has position for SELL orders
    if (orderData.side === 'SELL') {
      const position = await Position.findBySymbol(session.user.id, orderData.symbol)
      if (!position || position.quantity < orderData.quantity) {
        return NextResponse.json(
          { success: false, error: 'Insufficient position to sell' },
          { status: 400 }
        )
      }
    }

    // Create order
    const order = new Order({
      userId: session.user.id,
      ...orderData,
      status: 'PENDING',
      filledQuantity: 0
    })

    await order.save()

    // In a real system, submit to broker/exchange here
    // For now, simulate order acceptance
    order.status = 'OPEN'
    await order.save()

    return NextResponse.json({
      success: true,
      data: {
        order: order.toObject(),
        message: 'Order submitted successfully'
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create order' },
      { status: 500 }
    )
  }
}