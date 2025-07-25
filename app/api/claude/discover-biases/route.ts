import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import claudeService from '@/lib/claude-service'

/**
 * Claude AI Bias Discovery API
 * POST /api/claude/discover-biases - Discover behavioral trading biases
 */

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if Claude AI is available
    if (!claudeService.isAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Claude AI service is not available' },
        { status: 503 }
      )
    }

    // Discover behavioral biases for the user
    const biasAnalysis = await claudeService.discoverBiases()

    return NextResponse.json({
      success: true,
      data: {
        ...biasAnalysis,
        metadata: {
          analysisId: `bias_${Date.now()}`,
          userId: session.user.id,
          timestamp: new Date().toISOString(),
          analysisScope: 'last_90_days'
        }
      }
    })

  } catch (error) {
    console.error('Claude bias discovery error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { success: false, error: `Bias discovery failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}