import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy, type IStrategy } from '@/lib/database/models'
import backtestingEngine from '@/lib/backtesting-engine'
import { z } from 'zod'

/**
 * Backtesting API
 * POST /api/backtest/run - Run backtest for a strategy
 */

const backtestSchema = z.object({
  strategyId: z.string().optional(),
  strategy: z.object({
    name: z.string(),
    description: z.string(),
    configuration: z.record(z.string(), z.any()),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional()
  }).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  initialCapital: z.number().positive().max(10000000),
  symbols: z.array(z.string()).min(1).max(20),
  commission: z.number().min(0).max(100).optional(),
  slippage: z.number().min(0).max(5).optional(),
  maxPositions: z.number().int().min(1).max(50).optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = backtestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const {
      strategyId,
      strategy: providedStrategy,
      startDate,
      endDate,
      initialCapital,
      symbols,
      commission = 5, // $5 default commission
      slippage = 0.1, // 0.1% default slippage
      maxPositions = 10
    } = validationResult.data

    await connectToDatabase()

    // Get strategy from database or use provided strategy
    let strategy: IStrategy
    if (strategyId) {
      const dbStrategy = await Strategy.findById(strategyId)
      if (!dbStrategy) {
        return NextResponse.json(
          { success: false, error: 'Strategy not found' },
          { status: 404 }
        )
      }
      
      // Check if user owns this strategy
      if (dbStrategy.userId.toString() !== session.user.id) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        )
      }
      
      strategy = dbStrategy
    } else if (providedStrategy) {
      // Create a temporary strategy object for backtesting
      strategy = {
        ...providedStrategy,
        userId: session.user.id as any,
        type: 'CUSTOM' as const,
        status: 'TESTING' as const,
        performance: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalReturn: 0,
          lastUpdated: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as IStrategy
    } else {
      return NextResponse.json(
        { success: false, error: 'Strategy required' },
        { status: 400 }
      )
    }

    // Validate date range
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    if (start >= end) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before end date' },
        { status: 400 }
      )
    }

    const daysDifference = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDifference > 1095) { // 3 years maximum
      return NextResponse.json(
        { success: false, error: 'Maximum backtest period is 3 years' },
        { status: 400 }
      )
    }

    if (daysDifference < 30) { // 30 days minimum
      return NextResponse.json(
        { success: false, error: 'Minimum backtest period is 30 days' },
        { status: 400 }
      )
    }

    // Run backtest
    const backtestResult = await backtestingEngine.runBacktest({
      strategy,
      startDate: start,
      endDate: end,
      initialCapital,
      symbols,
      commission,
      slippage,
      maxPositions
    })

    // Store backtest result in database (optional - for future reference)
    if (strategyId) {
      await Strategy.findByIdAndUpdate(strategyId, {
        $push: {
          backtestResults: {
            createdAt: new Date(),
            parameters: backtestResult.parameters,
            metrics: backtestResult.metrics,
            summary: {
              totalReturn: backtestResult.metrics.totalReturn,
              totalReturnPercent: backtestResult.metrics.totalReturnPercent,
              sharpeRatio: backtestResult.metrics.sharpeRatio,
              maxDrawdown: backtestResult.metrics.maxDrawdownPercent,
              totalTrades: backtestResult.metrics.totalTrades,
              winRate: backtestResult.metrics.winRate
            }
          }
        }
      })
    }

    // Format response (reduce data size by limiting equity curve points)
    const maxEquityPoints = 1000
    const equityCurveStep = Math.max(1, Math.floor(backtestResult.equityCurve.length / maxEquityPoints))
    const sampledEquityCurve = backtestResult.equityCurve.filter((_, index) => index % equityCurveStep === 0)

    return NextResponse.json({
      success: true,
      data: {
        ...backtestResult,
        equityCurve: sampledEquityCurve,
        // Limit trades to most recent 500 for performance
        trades: backtestResult.trades
          .sort((a, b) => b.exitDate.getTime() - a.exitDate.getTime())
          .slice(0, 500),
        metrics: {
          ...backtestResult.metrics,
          // Round metrics for display
          totalReturn: Number(backtestResult.metrics.totalReturn.toFixed(2)),
          totalReturnPercent: Number(backtestResult.metrics.totalReturnPercent.toFixed(2)),
          annualizedReturn: Number(backtestResult.metrics.annualizedReturn.toFixed(2)),
          sharpeRatio: Number(backtestResult.metrics.sharpeRatio.toFixed(3)),
          maxDrawdown: Number(backtestResult.metrics.maxDrawdown.toFixed(2)),
          maxDrawdownPercent: Number(backtestResult.metrics.maxDrawdownPercent.toFixed(2)),
          volatility: Number(backtestResult.metrics.volatility.toFixed(2)),
          winRate: Number(backtestResult.metrics.winRate.toFixed(1)),
          averageWin: Number(backtestResult.metrics.averageWin.toFixed(2)),
          averageLoss: Number(backtestResult.metrics.averageLoss.toFixed(2)),
          profitFactor: Number(backtestResult.metrics.profitFactor.toFixed(2)),
          largestWin: Number(backtestResult.metrics.largestWin.toFixed(2)),
          largestLoss: Number(backtestResult.metrics.largestLoss.toFixed(2)),
          averageHoldingPeriod: Number(backtestResult.metrics.averageHoldingPeriod.toFixed(1)),
          totalCommissions: Number(backtestResult.metrics.totalCommissions.toFixed(2)),
          calmarRatio: Number(backtestResult.metrics.calmarRatio.toFixed(3)),
          sortinoRatio: Number(backtestResult.metrics.sortinoRatio.toFixed(3))
        },
        monthlyReturns: backtestResult.monthlyReturns.map(mr => ({
          ...mr,
          return: Number(mr.return.toFixed(2)),
          returnPercent: Number(mr.returnPercent.toFixed(2))
        })),
        performanceStats: {
          ...backtestResult.performanceStats,
          bestMonth: Number(backtestResult.performanceStats.bestMonth.toFixed(2)),
          worstMonth: Number(backtestResult.performanceStats.worstMonth.toFixed(2))
        }
      }
    })

  } catch (error) {
    console.error('Backtest error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to run backtest' },
      { status: 500 }
    )
  }
}