import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position, Trade, Order } from '@/lib/database/models'

export const dynamic = 'force-dynamic'

/**
 * Portfolio Summary API Route
 * GET /api/portfolio/summary - Get comprehensive portfolio overview
 * 
 * Returns real data from database
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Get user's positions from database
    const positions = await Position.findOpenPositions(session.user.id)
    
    // If no positions exist, return empty portfolio
    if (positions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          overview: {
            totalValue: 0,
            totalCost: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            dayPnL: 0,
            dayPnLPercent: 0,
            positionCount: 0,
            activeOrderCount: 0
          },
          positions: [],
          performance: {
            last30Days: { realized: 0, fees: 0, net: 0 },
            today: { realized: 0, fees: 0, net: 0 },
            dailyPnL: [],
            winRate: 0
          },
          riskMetrics: {
            positionsAtRisk: 0,
            maxPositionSize: 0,
            largestPosition: null,
            portfolioVolatility: 0
          },
          activity: {
            tradesLast30Days: 0,
            avgDailyTrades: 0,
            pendingOrders: 0,
            openOrders: 0
          }
        }
      })
    }

    // Calculate portfolio metrics using Position model method
    const portfolioMetrics = Position.calculatePortfolioMetrics(positions)

    // Format positions for frontend
    const formattedPositions = positions.map(position => ({
      symbol: position.symbol,
      name: position.name,
      value: position.marketValue,
      percentage: (position.marketValue / portfolioMetrics.totalValue) * 100,
      pnl: position.gainLoss,
      pnlPercent: position.gainLossPercent,
      quantity: position.quantity,
      avgCost: position.avgCost,
      currentPrice: position.currentPrice,
      category: position.category,
      allocation: position.allocation
    }))

    // Get recent trades for performance calculation
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const recentTrades = await Trade.findByUser(session.user.id, {
      startDate: thirtyDaysAgo
    })

    // Calculate trade performance
    const tradePnL = Trade.calculatePnL(recentTrades)

    // Get today's trades
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayTrades = await Trade.findByUser(session.user.id, {
      startDate: today,
      endDate: tomorrow
    })

    const todayPnL = Trade.calculatePnL(todayTrades)

    // Generate daily P&L for last 7 days
    const dailyPnL = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const nextDay = new Date(date)
      nextDay.setDate(nextDay.getDate() + 1)
      
      const dayTrades = await Trade.findByUser(session.user.id, {
        startDate: date,
        endDate: nextDay
      })
      
      const dayPnLData = Trade.calculatePnL(dayTrades)
      
      dailyPnL.push({
        date: date.toISOString().split('T')[0],
        pnl: dayPnLData.net,
        trades: dayTrades.length
      })
    }

    // Get active orders count
    const activeOrders = await Order.findActiveOrders(session.user.id)

    // Calculate win rate
    const winRate = await Trade.getWinRate(session.user.id, thirtyDaysAgo)

    // Calculate day P&L percentage
    const dayPnLPercent = portfolioMetrics.totalValue > 0 
      ? (todayPnL.net / portfolioMetrics.totalValue) * 100 
      : 0

    // Find largest position
    const largestPosition = formattedPositions.reduce((max, position) => 
      position.value > (max?.value || 0) ? position : max
    , formattedPositions[0] || null)

    // Calculate positions at risk (positions with negative P&L > 5%)
    const positionsAtRisk = formattedPositions.filter(p => p.pnlPercent < -5).length

    // Estimate portfolio volatility based on position spread
    const avgReturn = formattedPositions.reduce((sum, p) => sum + p.pnlPercent, 0) / formattedPositions.length
    const variance = formattedPositions.reduce((sum, p) => sum + Math.pow(p.pnlPercent - avgReturn, 2), 0) / formattedPositions.length
    const portfolioVolatility = Math.sqrt(variance) / 100 // Convert to decimal

    const portfolioData = {
      overview: {
        totalValue: Number(portfolioMetrics.totalValue.toFixed(2)),
        totalCost: Number(portfolioMetrics.totalCost.toFixed(2)),
        totalPnL: Number(portfolioMetrics.totalGainLoss.toFixed(2)),
        totalPnLPercent: Number(portfolioMetrics.totalGainLossPercent.toFixed(2)),
        dayPnL: Number(todayPnL.net.toFixed(2)),
        dayPnLPercent: Number(dayPnLPercent.toFixed(2)),
        positionCount: positions.length,
        activeOrderCount: activeOrders.length
      },
      positions: formattedPositions.map(p => ({
        ...p,
        value: Number(p.value.toFixed(2)),
        percentage: Number(p.percentage.toFixed(1)),
        pnl: Number(p.pnl.toFixed(2)),
        pnlPercent: Number(p.pnlPercent.toFixed(2)),
        avgCost: Number(p.avgCost.toFixed(2)),
        currentPrice: Number(p.currentPrice.toFixed(2)),
        allocation: Number(p.allocation.toFixed(1))
      })),
      performance: {
        last30Days: {
          realized: Number(tradePnL.realized.toFixed(2)),
          fees: Number(tradePnL.fees.toFixed(2)),
          net: Number(tradePnL.net.toFixed(2))
        },
        today: {
          realized: Number(todayPnL.realized.toFixed(2)),
          fees: Number(todayPnL.fees.toFixed(2)),
          net: Number(todayPnL.net.toFixed(2))
        },
        dailyPnL: dailyPnL.map(d => ({
          ...d,
          pnl: Number(d.pnl.toFixed(2))
        })),
        winRate: Number(winRate.toFixed(1))
      },
      riskMetrics: {
        positionsAtRisk,
        maxPositionSize: largestPosition ? Number(largestPosition.value.toFixed(2)) : 0,
        largestPosition,
        portfolioVolatility: Number(portfolioVolatility.toFixed(3))
      },
      activity: {
        tradesLast30Days: recentTrades.length,
        avgDailyTrades: Number((recentTrades.length / 30).toFixed(1)),
        pendingOrders: activeOrders.filter(o => o.status === 'PENDING').length,
        openOrders: activeOrders.filter(o => o.status === 'OPEN').length
      }
    }

    return NextResponse.json({
      success: true,
      data: portfolioData
    })

  } catch (error) {
    console.error('Error fetching portfolio summary:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch portfolio summary' },
      { status: 500 }
    )
  }
}