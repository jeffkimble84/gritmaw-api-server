import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy } from '@/lib/database/models'
import backtestingEngine from '@/lib/backtesting-engine'
import { z } from 'zod'

/**
 * Strategy Backtest API Route
 * POST /api/strategies/[strategyId]/backtest - Run backtest on strategy
 */

const backtestSchema = z.object({
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  initialCapital: z.number().positive(),
  symbol: z.string().optional(),
  symbols: z.array(z.string()).optional()
})

export async function POST(
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
    const validationResult = backtestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const backtestParams = validationResult.data

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

    // Run actual backtest using backtesting engine
    const backtestResult = await backtestingEngine.runBacktest({
      strategy,
      startDate: backtestParams.startDate,
      endDate: backtestParams.endDate,
      initialCapital: backtestParams.initialCapital,
      symbols: backtestParams.symbols || [backtestParams.symbol || 'SPY'],
      commission: 5, // Default commission
      slippage: 0.1, // Default slippage
      maxPositions: 10 // Default max positions
    })

    // Format backtest result for storage
    const formattedResult = {
      startDate: backtestParams.startDate,
      endDate: backtestParams.endDate,
      totalReturn: backtestResult.metrics.totalReturn,
      sharpeRatio: backtestResult.metrics.sharpeRatio,
      maxDrawdown: backtestResult.metrics.maxDrawdownPercent,
      winRate: backtestResult.metrics.winRate,
      totalTrades: backtestResult.metrics.totalTrades,
      profitFactor: backtestResult.metrics.profitFactor,
      parameters: strategy.parameters,
      executedAt: new Date()
    }

    // Add backtest result to strategy
    await strategy.addBacktestResult(formattedResult)

    // Use real backtest trades and equity curve from engine
    const trades = backtestResult.trades.map((trade, i) => ({
      tradeNumber: i + 1,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      profit: trade.profit,
      profitPercent: trade.profitPercent,
      holdingPeriod: trade.holdingPeriod,
      executedAt: trade.exitDate
    }))

    // Use real equity curve from engine
    const equityCurve = backtestResult.equityCurve.map(point => ({
      date: point.date,
      value: point.equity,
      drawdown: point.drawdown
    }))

    return NextResponse.json({
      success: true,
      data: {
        summary: formattedResult,
        trades,
        equityCurve,
        metrics: {
          totalReturn: Number(backtestResult.metrics.totalReturn.toFixed(2)),
          totalReturnPercent: Number(backtestResult.metrics.totalReturnPercent.toFixed(2)),
          annualizedReturn: Number(backtestResult.metrics.annualizedReturn.toFixed(2)),
          sharpeRatio: Number(backtestResult.metrics.sharpeRatio.toFixed(3)),
          maxDrawdown: Number(backtestResult.metrics.maxDrawdown.toFixed(2)),
          maxDrawdownPercent: Number(backtestResult.metrics.maxDrawdownPercent.toFixed(2)),
          volatility: Number(backtestResult.metrics.volatility.toFixed(2)),
          winRate: Number(backtestResult.metrics.winRate.toFixed(1)),
          avgWin: Number(backtestResult.metrics.averageWin.toFixed(2)),
          avgLoss: Number(backtestResult.metrics.averageLoss.toFixed(2)),
          profitFactor: Number(backtestResult.metrics.profitFactor.toFixed(2)),
          largestWin: Number(backtestResult.metrics.largestWin.toFixed(2)),
          largestLoss: Number(backtestResult.metrics.largestLoss.toFixed(2)),
          totalTrades: backtestResult.metrics.totalTrades,
          winningTrades: backtestResult.metrics.winningTrades,
          losingTrades: backtestResult.metrics.losingTrades,
          totalCommissions: Number(backtestResult.metrics.totalCommissions.toFixed(2)),
          calmarRatio: Number(backtestResult.metrics.calmarRatio.toFixed(3)),
          sortinoRatio: Number(backtestResult.metrics.sortinoRatio.toFixed(3))
        },
        message: 'Backtest completed successfully using real backtesting engine'
      }
    })

  } catch (error) {
    console.error('Error running backtest:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to run backtest' },
      { status: 500 }
    )
  }
}

function calculateMaxConsecutive(trades: any[], wins: boolean): number {
  let max = 0
  let current = 0
  
  trades.forEach(trade => {
    if ((wins && trade.profit > 0) || (!wins && trade.profit < 0)) {
      current++
      max = Math.max(max, current)
    } else {
      current = 0
    }
  })
  
  return max
}