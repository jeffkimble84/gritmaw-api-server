import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy } from '@/lib/database/models'
import backtestingEngine from '@/lib/backtesting-engine'
import { z } from 'zod'

/**
 * Strategy Optimization API
 * POST /api/backtest/optimize - Optimize strategy parameters
 */

const optimizeSchema = z.object({
  strategyId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  initialCapital: z.number().positive().max(10000000),
  symbols: z.array(z.string()).min(1).max(10), // Limit for optimization
  commission: z.number().min(0).max(100).optional(),
  slippage: z.number().min(0).max(5).optional(),
  maxPositions: z.number().int().min(1).max(20).optional(),
  parameterRanges: z.record(z.string(), z.object({
    min: z.number(),
    max: z.number(),
    step: z.number().positive()
  })).transform((ranges) => {
    // Ensure all fields are required for type safety
    const processedRanges: Record<string, { min: number; max: number; step: number }> = {};
    Object.entries(ranges).forEach(([key, range]) => {
      processedRanges[key] = {
        min: range.min,
        max: range.max,
        step: range.step
      };
    });
    return processedRanges;
  }),
  optimizationMetric: z.enum(['sharpeRatio', 'totalReturn', 'profitFactor', 'calmarRatio']).optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = optimizeSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const {
      strategyId,
      startDate,
      endDate,
      initialCapital,
      symbols,
      commission = 5,
      slippage = 0.1,
      maxPositions = 10,
      parameterRanges,
      optimizationMetric = 'sharpeRatio'
    } = validationResult.data

    await connectToDatabase()

    // Get strategy from database
    const strategy = await Strategy.findById(strategyId)
    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      )
    }
    
    // Check if user owns this strategy
    if (strategy.userId.toString() !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Validate optimization parameters
    const totalCombinations = Object.values(parameterRanges).reduce((total, range) => {
      const steps = Math.floor((range.max - range.min) / range.step) + 1
      return total * steps
    }, 1)

    if (totalCombinations > 100) {
      return NextResponse.json(
        { success: false, error: 'Too many parameter combinations. Maximum 100 combinations allowed.' },
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
    if (daysDifference > 730) { // 2 years maximum for optimization
      return NextResponse.json(
        { success: false, error: 'Maximum optimization period is 2 years' },
        { status: 400 }
      )
    }

    if (daysDifference < 60) { // 60 days minimum for meaningful optimization
      return NextResponse.json(
        { success: false, error: 'Minimum optimization period is 60 days' },
        { status: 400 }
      )
    }

    // Run optimization
    const optimizationResult = await backtestingEngine.optimizeStrategy(
      strategy,
      parameterRanges,
      {
        startDate: start,
        endDate: end,
        initialCapital,
        symbols,
        commission,
        slippage,
        maxPositions
      }
    )

    // Sort results by chosen metric
    const sortedResults = optimizationResult.optimizationResults.sort((a, b) => {
      const aValue = a.metrics[optimizationMetric]
      const bValue = b.metrics[optimizationMetric]
      return bValue - aValue // Descending order (higher is better)
    })

    // Take top 20 results for response
    const topResults = sortedResults.slice(0, 20).map(result => ({
      parameters: result.parameters,
      metrics: {
        totalReturn: Number(result.metrics.totalReturn.toFixed(2)),
        totalReturnPercent: Number(result.metrics.totalReturnPercent.toFixed(2)),
        annualizedReturn: Number(result.metrics.annualizedReturn.toFixed(2)),
        sharpeRatio: Number(result.metrics.sharpeRatio.toFixed(3)),
        maxDrawdownPercent: Number(result.metrics.maxDrawdownPercent.toFixed(2)),
        volatility: Number(result.metrics.volatility.toFixed(2)),
        totalTrades: result.metrics.totalTrades,
        winRate: Number(result.metrics.winRate.toFixed(1)),
        profitFactor: Number(result.metrics.profitFactor.toFixed(2)),
        calmarRatio: Number(result.metrics.calmarRatio.toFixed(3)),
        sortinoRatio: Number(result.metrics.sortinoRatio.toFixed(3))
      }
    }))

    // TODO: Update strategy with best parameters when optimization schema is implemented
    // const bestParameters = optimizationResult.bestStrategy.configuration
    // await Strategy.findByIdAndUpdate(strategyId, { ... optimization not in schema ... })

    // Performance comparison with current strategy parameters
    const currentMetrics = sortedResults.find(r => 
      JSON.stringify(r.parameters) === JSON.stringify(strategy.parameters)
    )

    const improvement = currentMetrics ? {
      [optimizationMetric]: optimizationResult.bestMetrics[optimizationMetric] - currentMetrics.metrics[optimizationMetric],
      improvementPercent: currentMetrics.metrics[optimizationMetric] > 0 
        ? ((optimizationResult.bestMetrics[optimizationMetric] - currentMetrics.metrics[optimizationMetric]) / currentMetrics.metrics[optimizationMetric]) * 100
        : 0
    } : null

    return NextResponse.json({
      success: true,
      data: {
        totalCombinationsTested: sortedResults.length,
        optimizationMetric,
        bestParameters: optimizationResult.bestStrategy.parameters,
        bestMetrics: {
          totalReturn: Number(optimizationResult.bestMetrics.totalReturn.toFixed(2)),
          totalReturnPercent: Number(optimizationResult.bestMetrics.totalReturnPercent.toFixed(2)),
          annualizedReturn: Number(optimizationResult.bestMetrics.annualizedReturn.toFixed(2)),
          sharpeRatio: Number(optimizationResult.bestMetrics.sharpeRatio.toFixed(3)),
          maxDrawdownPercent: Number(optimizationResult.bestMetrics.maxDrawdownPercent.toFixed(2)),
          volatility: Number(optimizationResult.bestMetrics.volatility.toFixed(2)),
          totalTrades: optimizationResult.bestMetrics.totalTrades,
          winRate: Number(optimizationResult.bestMetrics.winRate.toFixed(1)),
          profitFactor: Number(optimizationResult.bestMetrics.profitFactor.toFixed(2)),
          calmarRatio: Number(optimizationResult.bestMetrics.calmarRatio.toFixed(3)),
          sortinoRatio: Number(optimizationResult.bestMetrics.sortinoRatio.toFixed(3))
        },
        topResults,
        improvement,
        recommendations: [
          topResults.length > 1 
            ? `Found ${topResults.length} parameter combinations with better performance`
            : 'Current parameters appear to be optimal',
          improvement && improvement.improvementPercent > 10
            ? `Potential ${improvement.improvementPercent.toFixed(1)}% improvement in ${optimizationMetric}`
            : 'Marginal improvement opportunities identified',
          optimizationResult.bestMetrics.maxDrawdownPercent > 20
            ? 'Consider adding risk management constraints to reduce drawdown'
            : 'Drawdown levels are within acceptable range',
          optimizationResult.bestMetrics.totalTrades < 10
            ? 'Low number of trades - consider longer backtest period or different parameters'
            : 'Sufficient trade sample size for reliable results'
        ],
        parameterSensitivity: calculateParameterSensitivity(sortedResults, optimizationMetric),
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Strategy optimization error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to optimize strategy' },
      { status: 500 }
    )
  }
}

/**
 * Calculate parameter sensitivity analysis
 */
function calculateParameterSensitivity(
  results: Array<{ parameters: Record<string, number>; metrics: any }>,
  metric: string
): Record<string, { correlation: number; importance: string }> {
  const sensitivity: Record<string, { correlation: number; importance: string }> = {}
  
  if (results.length < 5) return sensitivity

  const parameterNames = Object.keys(results[0].parameters)
  
  for (const paramName of parameterNames) {
    // Calculate correlation between parameter values and metric
    const paramValues = results.map(r => r.parameters[paramName])
    const metricValues = results.map(r => r.metrics[metric])
    
    const correlation = calculateCorrelation(paramValues, metricValues)
    
    let importance: string
    if (Math.abs(correlation) > 0.7) {
      importance = 'HIGH'
    } else if (Math.abs(correlation) > 0.4) {
      importance = 'MEDIUM'
    } else {
      importance = 'LOW'
    }
    
    sensitivity[paramName] = {
      correlation: Number(correlation.toFixed(3)),
      importance
    }
  }
  
  return sensitivity
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0)
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0)
  
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  return denominator === 0 ? 0 : numerator / denominator
}