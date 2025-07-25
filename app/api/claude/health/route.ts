import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import claudeService from '@/lib/claude-service'

export const dynamic = 'force-dynamic'

/**
 * Claude AI Health Check API
 * GET /api/claude/health - Check Claude AI service status
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get health status from Claude service
    const healthStatus = await claudeService.getHealthStatus()

    return NextResponse.json({
      success: true,
      data: {
        ...healthStatus,
        isAvailable: claudeService.isAvailable(),
        timestamp: new Date().toISOString(),
        version: 'v2.0.0'
      }
    })

  } catch (error) {
    console.error('Claude health check error:', error)
    return NextResponse.json({
      success: false,
      data: {
        status: 'error',
        message: 'Health check failed',
        isAvailable: false,
        timestamp: new Date().toISOString()
      }
    }, { status: 500 })
  }
}