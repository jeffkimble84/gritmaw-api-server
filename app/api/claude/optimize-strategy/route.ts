import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy, Trade } from '@/lib/database/models'
import claudeService from '@/lib/claude-service'
import { z } from 'zod'

/**
 * Claude AI Strategy Optimization API
 * POST /api/claude/optimize-strategy - Optimize trading strategy with AI
 */

const strategyOptimizationSchema = z.object({
  strategyId: z.string(),
  optimizationGoals: z.array(z.enum(['return', 'risk', 'sharpe', 'drawdown'])).min(1),
  lookbackPeriod: z.number().min(30).max(365).optional().default(90)
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only allow institutional and admin users to access AI features
    if (!['INSTITUTIONAL_TRADER', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { success: false, error: 'Strategy optimization requires institutional access' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = strategyOptimizationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const optimizationRequest = validationResult.data

    // Check if Claude AI is available
    if (!claudeService.isAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Claude AI service is not available' },
        { status: 503 }
      )
    }

    await connectToDatabase()

    // Fetch strategy and verify ownership
    const strategy = await Strategy.findOne({
      _id: optimizationRequest.strategyId,
      userId: session.user.id
    })

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: 'Strategy not found' },
        { status: 404 }
      )
    }

    // Fetch performance data for the strategy
    const lookbackDate = new Date()
    lookbackDate.setDate(lookbackDate.getDate() - optimizationRequest.lookbackPeriod)

    const performanceData = await Trade.find({
      strategyId: optimizationRequest.strategyId,
      executedAt: { $gte: lookbackDate }
    }).sort({ executedAt: -1 }).lean()

    if (performanceData.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Insufficient performance data for optimization (minimum 10 trades required)' },
        { status: 400 }
      )
    }

    // Mock market conditions (in production, this would come from real market data)
    const marketConditions = {
      volatility: 'MEDIUM',
      trend: 'SIDEWAYS',
      volume: 'NORMAL',
      sector_performance: 'MIXED'
    }

    // Optimize strategy using Claude AI
    const optimization = await claudeService.optimizeStrategy({
      strategyId: optimizationRequest.strategyId,
      performanceData,
      marketConditions,
      optimizationGoals: optimizationRequest.optimizationGoals
    })

    // TODO: Store optimization result when aiInsights schema is implemented
    // strategy.aiInsights = { confidence, suggestedImprovements, lastAnalyzed }
    // await strategy.save()

    return NextResponse.json({
      success: true,
      data: {
        ...optimization,
        strategy: {
          id: strategy._id,
          name: strategy.name,
          type: strategy.type,
          currentPerformance: strategy.performance
        },
        metadata: {
          optimizationId: `opt_${Date.now()}`,
          userId: session.user.id,
          timestamp: new Date().toISOString(),
          lookbackPeriod: optimizationRequest.lookbackPeriod,
          tradesAnalyzed: performanceData.length,
          goals: optimizationRequest.optimizationGoals
        }
      }
    })

  } catch (error) {
    console.error('Claude strategy optimization error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { success: false, error: `Strategy optimization failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}