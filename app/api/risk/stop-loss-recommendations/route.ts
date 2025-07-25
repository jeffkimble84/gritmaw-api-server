import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position } from '@/lib/database/models'
import riskManager from '@/lib/risk-management'

export const dynamic = 'force-dynamic'

/**
 * Stop-Loss Recommendations API
 * GET /api/risk/stop-loss-recommendations - Get stop-loss recommendations for positions
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Get user's open positions
    const positions = await Position.findOpenPositions(session.user.id)

    if (positions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          recommendations: [],
          summary: {
            totalPositions: 0,
            positionsAtRisk: 0,
            recommendedActions: 0
          }
        }
      })
    }

    // Mock current prices (in production, this would come from real market data)
    const currentPrices: Record<string, number> = {}
    const marketVolatility: Record<string, number> = {}

    positions.forEach(position => {
      // Simulate some price movement
      const basePrice = position.avgCost
      const randomChange = (Math.random() - 0.5) * 0.1 // ±5% random change
      currentPrices[position.symbol] = basePrice * (1 + randomChange)
      
      // Mock volatility data
      marketVolatility[position.symbol] = 0.15 + Math.random() * 0.25 // 15-40% volatility
    })

    // Calculate stop-loss recommendations
    const recommendations = riskManager.calculateStopLossRecommendations(
      positions,
      currentPrices,
      marketVolatility
    )

    // Calculate summary statistics
    const summary = {
      totalPositions: positions.length,
      positionsAtRisk: recommendations.filter(r => r.urgency === 'HIGH' || r.urgency === 'CRITICAL').length,
      recommendedActions: recommendations.filter(r => r.urgency !== 'LOW').length,
      totalRiskAmount: recommendations.reduce((sum, r) => sum + r.riskAmount, 0),
      criticalPositions: recommendations.filter(r => r.urgency === 'CRITICAL').length,
      averageStopDistance: recommendations.reduce((sum, r) => sum + r.stopLossPercent, 0) / recommendations.length
    }

    // Add market context
    const marketContext = {
      marketVolatility: Object.values(marketVolatility).reduce((sum, v) => sum + v, 0) / Object.values(marketVolatility).length,
      averagePriceChange: positions.map(p => {
        const currentPrice = currentPrices[p.symbol]
        return ((currentPrice - p.avgCost) / p.avgCost) * 100
      }).reduce((sum, change) => sum + change, 0) / positions.length
    }

    return NextResponse.json({
      success: true,
      data: {
        recommendations: recommendations.map(rec => ({
          ...rec,
          currentPrice: Number(rec.currentPrice.toFixed(2)),
          suggestedStopLoss: Number(rec.suggestedStopLoss.toFixed(2)),
          stopLossPercent: Number(rec.stopLossPercent.toFixed(2)),
          riskAmount: Number(rec.riskAmount.toFixed(2))
        })),
        summary: {
          ...summary,
          totalRiskAmount: Number(summary.totalRiskAmount.toFixed(2)),
          averageStopDistance: Number(summary.averageStopDistance.toFixed(2))
        },
        marketContext: {
          marketVolatility: Number((marketContext.marketVolatility * 100).toFixed(1)),
          averagePriceChange: Number(marketContext.averagePriceChange.toFixed(2))
        },
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Stop-loss recommendations error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to calculate stop-loss recommendations' },
      { status: 500 }
    )
  }
}