import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Strategy } from '@/lib/database/models'
import { z } from 'zod'

/**
 * Strategies API Route
 * GET /api/strategies - List user's strategies
 * POST /api/strategies - Create new strategy
 */

const createStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(['MOMENTUM', 'MEAN_REVERSION', 'ARBITRAGE', 'PAIRS', 'VALUE', 'GROWTH', 'CUSTOM']),
  configuration: z.object({
    entryRules: z.array(z.object({
      indicator: z.string(),
      operator: z.enum(['GREATER_THAN', 'LESS_THAN', 'EQUAL', 'CROSSES_ABOVE', 'CROSSES_BELOW']),
      value: z.number(),
      weight: z.number().optional()
    })),
    exitRules: z.array(z.object({
      indicator: z.string(),
      operator: z.enum(['GREATER_THAN', 'LESS_THAN', 'EQUAL', 'CROSSES_ABOVE', 'CROSSES_BELOW']),
      value: z.number(),
      weight: z.number().optional()
    })),
    riskManagement: z.object({
      maxPositionSize: z.number().positive(),
      maxDrawdown: z.number().min(0).max(100),
      stopLossPercent: z.number().min(0).max(100).optional(),
      takeProfitPercent: z.number().positive().optional(),
      trailingStopPercent: z.number().min(0).max(100).optional()
    }),
    marketConditions: z.object({
      requiredVolume: z.number().positive().optional(),
      requiredLiquidity: z.number().positive().optional(),
      allowedMarkets: z.array(z.string()).optional(),
      tradingHours: z.object({
        start: z.string(),
        end: z.string(),
        timezone: z.string()
      }).optional()
    }).optional()
  })
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const includePublic = searchParams.get('includePublic') === 'true'

    // Build query
    const query: any = includePublic 
      ? { $or: [{ userId: session.user.id }, { 'metadata.isPublic': true }] }
      : { userId: session.user.id }
    
    if (status) {
      query.status = status
    }
    if (type) {
      query.type = type
    }

    // Fetch strategies
    const strategies = await Strategy.find(query)
      .sort({ 'performance.totalReturn': -1 })
      .lean()

    // Get performance metrics
    const activeStrategies = strategies.filter(s => s.status === 'ACTIVE')
    const avgPerformance = Strategy.calculateAveragePerformance(activeStrategies)

    // Get top public performers if requested
    let topPerformers: any[] = []
    if (includePublic) {
      topPerformers = await Strategy.findTopPerformers(5)
    }

    return NextResponse.json({
      success: true,
      data: {
        strategies,
        metrics: {
          totalStrategies: strategies.length,
          activeStrategies: activeStrategies.length,
          averagePerformance: avgPerformance,
          topPerformers: topPerformers.map(s => ({
            id: s._id,
            name: s.name,
            type: s.type,
            winRate: s.performance.winRate,
            totalReturn: s.performance.totalReturn
          }))
        }
      }
    })

  } catch (error) {
    console.error('Error fetching strategies:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch strategies' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = createStrategySchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const strategyData = validationResult.data

    await connectToDatabase()

    // Create strategy
    const strategy = new Strategy({
      userId: session.user.id,
      ...strategyData,
      status: 'INACTIVE',
      performance: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalReturn: 0,
        lastUpdated: new Date()
      },
      metadata: {
        createdBy: session.user.name || session.user.email,
        version: 1,
        isPublic: false
      }
    })

    await strategy.save()

    return NextResponse.json({
      success: true,
      data: {
        strategy: strategy.toObject(),
        message: 'Strategy created successfully'
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create strategy' },
      { status: 500 }
    )
  }
}