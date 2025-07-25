import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Order } from '@/lib/database/models'
import { z } from 'zod'

/**
 * Single Order API Route
 * GET /api/orders/[orderId] - Get order details
 * PATCH /api/orders/[orderId] - Update order (cancel)
 * DELETE /api/orders/[orderId] - Cancel order
 */

const updateOrderSchema = z.object({
  action: z.enum(['CANCEL', 'MODIFY']),
  price: z.number().positive().optional(),
  quantity: z.number().positive().optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const order = await Order.findOne({
      _id: params.orderId,
      userId: session.user.id
    }).populate('strategyId', 'name type')

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { order }
    })

  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = updateOrderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    await connectToDatabase()

    const order = await Order.findOne({
      _id: params.orderId,
      userId: session.user.id
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check if order can be modified
    if (!order.isActive()) {
      return NextResponse.json(
        { success: false, error: 'Order cannot be modified in current status' },
        { status: 400 }
      )
    }

    if (updateData.action === 'CANCEL') {
      order.status = 'CANCELLED'
      // Set cancellation details in notes
      order.notes = 'User cancelled'
    } else if (updateData.action === 'MODIFY') {
      // Only allow modification of LIMIT orders
      if (order.type !== 'LIMIT') {
        return NextResponse.json(
          { success: false, error: 'Only LIMIT orders can be modified' },
          { status: 400 }
        )
      }

      if (updateData.price) {
        order.price = updateData.price
      }
      if (updateData.quantity) {
        // Ensure new quantity is not less than filled quantity
        if (updateData.quantity < order.filledQuantity) {
          return NextResponse.json(
            { success: false, error: 'Cannot reduce quantity below filled amount' },
            { status: 400 }
          )
        }
        order.quantity = updateData.quantity
      }
    }

    await order.save()

    return NextResponse.json({
      success: true,
      data: {
        order,
        message: updateData.action === 'CANCEL' 
          ? 'Order cancelled successfully' 
          : 'Order modified successfully'
      }
    })

  } catch (error) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update order' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  // Delegate to PATCH with cancel action
  return PATCH(
    new NextRequest(request.url, {
      method: 'PATCH',
      headers: request.headers,
      body: JSON.stringify({ action: 'CANCEL' })
    }),
    { params }
  )
}