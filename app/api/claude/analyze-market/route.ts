import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import claudeService from '@/lib/claude-service'
import { z } from 'zod'

/**
 * Claude AI Market Analysis API
 * POST /api/claude/analyze-market - Get AI-powered market analysis
 */

const marketAnalysisSchema = z.object({
  symbols: z.array(z.string().min(1).max(10)).min(1).max(10),
  timeframe: z.enum(['1D', '1W', '1M', '3M', '1Y']),
  analysisType: z.enum(['technical', 'fundamental', 'sentiment', 'comprehensive']),
  includeUserProfile: z.boolean().optional().default(false)
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
        { success: false, error: 'AI analysis requires institutional access' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = marketAnalysisSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const analysisRequest = validationResult.data

    // Check if Claude AI is available
    if (!claudeService.isAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Claude AI service is not available' },
        { status: 503 }
      )
    }

    // Add user profile if requested
    let userProfile
    if (analysisRequest.includeUserProfile) {
      const { getUserWithProfile, formatUserProfile } = await import('@/lib/auth-utils')
      const { user } = await getUserWithProfile()
      if (user) {
        const profile = formatUserProfile(user, session)
        userProfile = {
          riskTolerance: profile?.riskTolerance || 'MEDIUM',
          experienceLevel: profile?.experienceLevel || 'INTERMEDIATE',
          tradingStyle: profile?.preferredStrategies?.length > 0 
            ? profile?.preferredStrategies[0] || 'BALANCED'
            : 'BALANCED'
        }
      }
    }

    // Perform market analysis
    const analysis = await claudeService.analyzeMarket({
      symbols: analysisRequest.symbols || ['SPY'], // Provide default if not specified
      timeframe: analysisRequest.timeframe || '1D',
      analysisType: analysisRequest.analysisType || 'comprehensive',
      context: userProfile ? `User profile: ${JSON.stringify(userProfile)}` : undefined
    })

    return NextResponse.json({
      success: true,
      data: {
        ...analysis,
        metadata: {
          requestId: `analysis_${Date.now()}`,
          userId: session.user.id,
          timestamp: new Date().toISOString(),
          analysisType: analysisRequest.analysisType,
          symbols: analysisRequest.symbols,
          timeframe: analysisRequest.timeframe
        }
      }
    })

  } catch (error) {
    console.error('Claude market analysis error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { success: false, error: `Market analysis failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}