import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy } from '@/lib/database/models'

export const dynamic = 'force-dynamic'

/**
 * Backtest History API
 * GET /api/backtest/history - Get backtest history for user's strategies
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const strategyId = searchParams.get('strategyId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const skip = Math.max(parseInt(searchParams.get('skip') || '0'), 0)

    await connectToDatabase()

    let query: any = { userId: session.user.id }
    if (strategyId) {
      query._id = strategyId
      
      // Verify user owns this strategy
      const strategy = await Strategy.findById(strategyId)
      if (!strategy || strategy.userId.toString() !== session.user.id) {
        return NextResponse.json(
          { success: false, error: 'Strategy not found or access denied' },
          { status: 404 }
        )
      }
    }

    // Get strategies with backtest history
    const strategies = await Strategy.find(query)
      .select('name description backtestResults optimization createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    // Format backtest history
    const backtestHistory = []
    
    for (const strategy of strategies) {
      // Add backtest results
      if (strategy.backtestResults && strategy.backtestResults.length > 0) {
        for (const backtest of strategy.backtestResults.slice(-10)) { // Last 10 backtests per strategy
          backtestHistory.push({
            id: `${strategy._id}_${backtest.executedAt.getTime()}`,
            strategyId: strategy._id,
            strategyName: strategy.name,
            type: 'BACKTEST',
            createdAt: backtest.executedAt,
            parameters: {
              startDate: backtest.startDate,
              endDate: backtest.endDate,
              strategyParameters: backtest.parameters
            },
            metrics: {
              totalReturn: backtest.totalReturn,
              sharpeRatio: backtest.sharpeRatio,
              maxDrawdown: backtest.maxDrawdown,
              totalTrades: backtest.totalTrades,
              winRate: backtest.winRate,
              profitFactor: backtest.profitFactor
            }
          })
        }
      }

      // Optimization history not implemented in current schema
    }

    // Sort all history by creation date
    backtestHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination to combined results
    const paginatedHistory = backtestHistory.slice(skip, skip + limit)

    // Calculate summary statistics
    const backtests = backtestHistory.filter(h => h.type === 'BACKTEST')
    const optimizations = backtestHistory.filter(h => h.type === 'OPTIMIZATION')

    const summaryStats = {
      totalBacktests: backtests.length,
      totalOptimizations: optimizations.length,
      averageReturn: backtests.length > 0 
        ? backtests.reduce((sum, b) => sum + (b.metrics.totalReturnPercent || 0), 0) / backtests.length
        : 0,
      averageSharpeRatio: backtests.length > 0
        ? backtests.reduce((sum, b) => sum + (b.metrics.sharpeRatio || 0), 0) / backtests.length
        : 0,
      bestPerformingStrategy: backtests.length > 0
        ? backtests.reduce((best, current) => 
            (current.metrics.sharpeRatio || 0) > (best.metrics.sharpeRatio || 0) ? current : best
          )
        : null,
      recentActivity: backtestHistory.slice(0, 5).map(h => ({
        type: h.type,
        strategyName: h.strategyName,
        date: h.createdAt,
        result: h.type === 'BACKTEST' 
          ? `${h.metrics.totalReturnPercent?.toFixed(1)}% return`
          : `${(h.summary as any).optimizationMetric || 'parameter'} optimization`
      }))
    }

    return NextResponse.json({
      success: true,
      data: {
        history: paginatedHistory.map(h => ({
          ...h,
          metrics: h.metrics ? {
            totalReturn: h.metrics.totalReturn ? Number(h.metrics.totalReturn.toFixed(2)) : 0,
            totalReturnPercent: h.metrics.totalReturnPercent ? Number(h.metrics.totalReturnPercent.toFixed(2)) : 0,
            sharpeRatio: h.metrics.sharpeRatio ? Number(h.metrics.sharpeRatio.toFixed(3)) : 0,
            maxDrawdown: h.metrics.maxDrawdown ? Number(h.metrics.maxDrawdown.toFixed(2)) : 0,
            totalTrades: h.metrics.totalTrades || 0,
            winRate: h.metrics.winRate ? Number(h.metrics.winRate.toFixed(1)) : 0,
            volatility: h.metrics.volatility ? Number(h.metrics.volatility.toFixed(2)) : 0
          } : null
        })),
        pagination: {
          total: backtestHistory.length,
          limit,
          skip,
          hasMore: backtestHistory.length > skip + limit
        },
        summary: {
          ...summaryStats,
          averageReturn: Number(summaryStats.averageReturn.toFixed(2)),
          averageSharpeRatio: Number(summaryStats.averageSharpeRatio.toFixed(3))
        }
      }
    })

  } catch (error) {
    console.error('Backtest history error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch backtest history' },
      { status: 500 }
    )
  }
}