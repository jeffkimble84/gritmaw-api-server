import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position } from '@/lib/database/models'
import claudeService from '@/lib/claude-service'
import { z } from 'zod'

/**
 * Claude AI Risk Assessment API
 * POST /api/claude/assess-risk - Get AI-powered portfolio risk assessment
 */

const riskAssessmentSchema = z.object({
  includePositions: z.boolean().optional().default(true),
  assessmentType: z.enum(['portfolio', 'position', 'strategy']).optional().default('portfolio'),
  symbol: z.string().optional(), // For position-specific assessment
  strategyId: z.string().optional() // For strategy-specific assessment
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = riskAssessmentSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const assessmentRequest = validationResult.data

    // Check if Claude AI is available
    if (!claudeService.isAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Claude AI service is not available' },
        { status: 503 }
      )
    }

    await connectToDatabase()

    // Gather portfolio data based on assessment type
    let portfolio: any[] = []
    let marketData: any = {}
    let riskMetrics: any = {}

    if (assessmentRequest.assessmentType === 'portfolio' || assessmentRequest.includePositions) {
      // Get all open positions
      const positions = await Position.findOpenPositions(session.user.id)
      
      portfolio = positions.map(p => ({
        symbol: p.symbol,
        quantity: p.quantity,
        averageCost: p.avgCost,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPercent: p.unrealizedPnLPercent,
        category: p.category,
        allocation: p.allocation
      }))

      // Calculate portfolio metrics
      const portfolioMetrics = Position.calculatePortfolioMetrics(positions)
      riskMetrics = {
        totalValue: portfolioMetrics.totalValue,
        totalPnL: portfolioMetrics.totalPnL,
        totalPnLPercent: portfolioMetrics.totalPnLPercent,
        positionCount: positions.length,
        concentration: positions.length > 0 
          ? Math.max(...positions.map(p => ((p.marketValue || 0) / portfolioMetrics.totalValue) * 100))
          : 0
      }
    }

    if (assessmentRequest.symbol) {
      // Position-specific assessment
      const position = await Position.findBySymbol(session.user.id, assessmentRequest.symbol)
      if (position) {
        portfolio = [position]
      }
    }

    // Mock market data (in production, this would come from real market data feeds)
    marketData = {
      marketVolatility: 'MEDIUM',
      sectorTrends: {
        technology: 'BULLISH',
        finance: 'NEUTRAL',
        healthcare: 'BEARISH'
      },
      economicIndicators: {
        inflation: 'RISING',
        interestRates: 'STABLE',
        gdpGrowth: 'MODERATE'
      },
      timestamp: new Date().toISOString()
    }

    // Assess risk using Claude AI
    const riskAssessment = await claudeService.assessRisk({
      portfolio,
      marketData,
      riskMetrics
    })

    return NextResponse.json({
      success: true,
      data: {
        ...riskAssessment,
        portfolio: {
          positionCount: portfolio.length,
          totalValue: riskMetrics.totalValue || 0,
          concentration: riskMetrics.concentration || 0
        },
        metadata: {
          assessmentId: `risk_${Date.now()}`,
          userId: session.user.id,
          timestamp: new Date().toISOString(),
          assessmentType: assessmentRequest.assessmentType,
          scope: assessmentRequest.symbol || 'full_portfolio'
        }
      }
    })

  } catch (error) {
    console.error('Claude risk assessment error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { success: false, error: `Risk assessment failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}