import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position, Trade } from '@/lib/database/models'
import riskManager from '@/lib/risk-management'

export const dynamic = 'force-dynamic'

/**
 * Portfolio Risk Analysis API
 * GET /api/risk/portfolio-analysis - Get comprehensive portfolio risk analysis
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Get user's portfolio data
    const [positions, trades] = await Promise.all([
      Position.find({ userId: session.user.id }).lean(),
      Trade.findByUser(session.user.id, {
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
      })
    ])

    const portfolioValue = Position.calculateTotalValue(positions.filter(p => p.status === 'OPEN')) || 50000

    // Calculate comprehensive risk metrics
    const riskMetrics = riskManager.calculatePortfolioRisk(positions, trades, portfolioValue)

    // Generate risk recommendations
    const recommendations = riskManager.generateRiskRecommendations(positions, trades, portfolioValue)

    // Calculate position-level risk analysis
    const openPositions = positions.filter(p => p.status === 'OPEN')
    const positionAnalysis = openPositions.map(position => {
      const positionValue = position.marketValue || 0
      const positionPercent = portfolioValue > 0 ? (positionValue / portfolioValue) * 100 : 0
      const unrealizedPnL = position.unrealizedPnL || 0
      const unrealizedPnLPercent = position.unrealizedPnLPercent || 0

      // Determine risk level
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
      if (positionPercent > 25 || unrealizedPnLPercent < -20) {
        riskLevel = 'CRITICAL'
      } else if (positionPercent > 15 || unrealizedPnLPercent < -10) {
        riskLevel = 'HIGH'
      } else if (positionPercent > 10 || unrealizedPnLPercent < -5) {
        riskLevel = 'MEDIUM'
      }

      return {
        symbol: position.symbol,
        value: positionValue,
        percentage: positionPercent,
        unrealizedPnL,
        unrealizedPnLPercent,
        riskLevel,
        daysHeld: Math.floor((Date.now() - position.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        hasStopLoss: false, // TODO: Implement when risk metrics schema exists
        stopLossDistance: null // TODO: Implement when risk metrics schema exists
      }
    })

    // Calculate sector/industry concentration
    const sectorAnalysis = openPositions.reduce((acc, position) => {
      const sector = 'Unknown' // TODO: Add sector when metadata schema exists
      const value = position.marketValue || 0
      
      if (!acc[sector]) {
        acc[sector] = { value: 0, count: 0, percentage: 0 }
      }
      
      acc[sector].value += value
      acc[sector].count += 1
      
      return acc
    }, {} as Record<string, { value: number; count: number; percentage: number }>)

    // Calculate percentages for sectors
    Object.keys(sectorAnalysis).forEach(sector => {
      sectorAnalysis[sector].percentage = portfolioValue > 0 
        ? (sectorAnalysis[sector].value / portfolioValue) * 100 
        : 0
    })

    // Risk scoring (0-100, higher is riskier)
    const riskScore = Math.min(100, Math.max(0, 
      (riskMetrics.concentrationRisk * 0.3) +
      (riskMetrics.volatility * 0.3) +
      (riskMetrics.maxDrawdown * 0.2) +
      (riskMetrics.correlationRisk * 0.2)
    ))

    // Historical performance analysis
    const performanceAnalysis = {
      totalTrades: trades.length,
      winningTrades: trades.filter(t => (t.performance?.profit || 0) > 0).length,
      losingTrades: trades.filter(t => (t.performance?.profit || 0) < 0).length,
      winRate: trades.length > 0 
        ? (trades.filter(t => (t.performance?.profit || 0) > 0).length / trades.length) * 100 
        : 0,
      averageWin: trades.filter(t => (t.performance?.profit || 0) > 0)
        .reduce((sum, t) => sum + (t.performance?.profit || 0), 0) / 
        Math.max(1, trades.filter(t => (t.performance?.profit || 0) > 0).length),
      averageLoss: Math.abs(trades.filter(t => (t.performance?.profit || 0) < 0)
        .reduce((sum, t) => sum + (t.performance?.profit || 0), 0)) / 
        Math.max(1, trades.filter(t => (t.performance?.profit || 0) < 0).length),
      largestWin: Math.max(0, ...trades.map(t => t.performance?.profit || 0)),
      largestLoss: Math.min(0, ...trades.map(t => t.performance?.profit || 0))
    }

    // Risk capacity analysis based on user profile
    const { User } = await import('@/lib/database/models')
    const user = await User.findById(session.user.id)
    const userRiskTolerance = user?.tradingProfile?.riskTolerance || 'MEDIUM'
    const experienceLevel = user?.role === 'INSTITUTIONAL_TRADER' ? 'ADVANCED' : 'INTERMEDIATE'
    
    const riskCapacityScore = {
      'LOW': 25,
      'MEDIUM': 50,
      'HIGH': 75
    }[userRiskTolerance]

    const experienceMultiplier = {
      'BEGINNER': 0.7,
      'INTERMEDIATE': 1.0,
      'ADVANCED': 1.2,
      'EXPERT': 1.4
    }[experienceLevel] || 1.0

    const adjustedRiskCapacity = riskCapacityScore * experienceMultiplier

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          portfolioValue,
          riskScore,
          riskLevel: riskScore < 30 ? 'LOW' : riskScore < 60 ? 'MEDIUM' : riskScore < 80 ? 'HIGH' : 'CRITICAL',
          positionCount: openPositions.length,
          totalRecommendations: recommendations.length,
          criticalIssues: recommendations.filter(r => r.severity === 'CRITICAL').length
        },
        riskMetrics: {
          ...riskMetrics,
          portfolioRisk: Number(riskMetrics.portfolioRisk.toFixed(2)),
          sharpeRatio: Number(riskMetrics.sharpeRatio.toFixed(3)),
          volatility: Number(riskMetrics.volatility.toFixed(2)),
          maxDrawdown: Number(riskMetrics.maxDrawdown.toFixed(2)),
          valueAtRisk: Number(riskMetrics.valueAtRisk.toFixed(2)),
          expectedShortfall: Number(riskMetrics.expectedShortfall.toFixed(2)),
          concentrationRisk: Number(riskMetrics.concentrationRisk.toFixed(2)),
          correlationRisk: Number(riskMetrics.correlationRisk.toFixed(2))
        },
        positionAnalysis: positionAnalysis.map(p => ({
          ...p,
          value: Number(p.value.toFixed(2)),
          percentage: Number(p.percentage.toFixed(2)),
          unrealizedPnL: Number(p.unrealizedPnL.toFixed(2)),
          unrealizedPnLPercent: Number(p.unrealizedPnLPercent.toFixed(2)),
          stopLossDistance: p.stopLossDistance ? Number((p.stopLossDistance as number).toFixed(2)) : null
        })),
        sectorAnalysis: Object.entries(sectorAnalysis)
          .map(([sector, data]) => ({
            sector,
            value: Number(data.value.toFixed(2)),
            percentage: Number(data.percentage.toFixed(2)),
            positionCount: data.count
          }))
          .sort((a, b) => b.percentage - a.percentage),
        recommendations,
        performanceAnalysis: {
          ...performanceAnalysis,
          winRate: Number(performanceAnalysis.winRate.toFixed(2)),
          averageWin: Number(performanceAnalysis.averageWin.toFixed(2)),
          averageLoss: Number(performanceAnalysis.averageLoss.toFixed(2)),
          largestWin: Number(performanceAnalysis.largestWin.toFixed(2)),
          largestLoss: Number(performanceAnalysis.largestLoss.toFixed(2)),
          profitFactor: performanceAnalysis.averageLoss > 0 
            ? Number((performanceAnalysis.averageWin / performanceAnalysis.averageLoss).toFixed(2))
            : 0
        },
        riskCapacity: {
          userRiskTolerance,
          experienceLevel,
          riskCapacityScore: adjustedRiskCapacity,
          isOverRisk: riskScore > adjustedRiskCapacity,
          recommendation: riskScore > adjustedRiskCapacity 
            ? 'Consider reducing portfolio risk to match risk tolerance'
            : 'Portfolio risk is within acceptable limits'
        },
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Portfolio risk analysis error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to analyze portfolio risk' },
      { status: 500 }
    )
  }
}