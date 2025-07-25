import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Trade } from '@/lib/database/models'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * Trades API Route
 * GET /api/trades - List user's executed trades
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build date range
    const dateOptions: { startDate?: Date; endDate?: Date } = {}
    if (startDate) {
      dateOptions.startDate = new Date(startDate)
    }
    if (endDate) {
      dateOptions.endDate = new Date(endDate)
    }

    // Fetch trades based on filters
    let trades
    if (symbol) {
      trades = await Trade.findBySymbol(session.user.id, symbol)
    } else {
      trades = await Trade.findByUser(session.user.id, dateOptions)
    }

    // Apply pagination
    const paginatedTrades = trades.slice(offset, offset + limit)

    // Calculate aggregate statistics
    const stats = Trade.calculatePnL(trades)
    
    // Daily volume for today
    const todayVolume = await Trade.getDailyVolume(session.user.id, new Date())

    // Group trades by date for chart data
    const tradesByDate = trades.reduce((acc: any, trade) => {
      const date = trade.executedAt.toISOString().split('T')[0]
      if (!acc[date]) {
        acc[date] = {
          date,
          count: 0,
          volume: 0,
          profit: 0
        }
      }
      acc[date].count++
      acc[date].volume += trade.quantity * trade.price
      acc[date].profit += trade.performance?.profit || 0
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      data: {
        trades: paginatedTrades,
        statistics: {
          ...stats,
          totalTrades: trades.length,
          todayVolume,
          avgTradeSize: trades.length > 0 
            ? trades.reduce((sum, t) => sum + (t.quantity * t.price), 0) / trades.length 
            : 0
        },
        chartData: Object.values(tradesByDate),
        pagination: {
          total: trades.length,
          limit,
          offset,
          hasMore: offset + limit < trades.length
        }
      }
    })

  } catch (error) {
    console.error('Error fetching trades:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trades' },
      { status: 500 }
    )
  }
}