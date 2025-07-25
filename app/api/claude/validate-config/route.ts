import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import claudeService from '@/lib/claude-service'
import { z } from 'zod'

/**
 * Claude AI Configuration Validation API
 * POST /api/claude/validate-config - Validate trading configuration with AI insights
 */

const configValidationSchema = z.object({
  configuration: z.record(z.string(), z.any()), // Accept any configuration object
  configurationType: z.enum(['strategy', 'risk_management', 'trading_parameters', 'portfolio']).optional().default('strategy'),
  validationLevel: z.enum(['basic', 'comprehensive']).optional().default('comprehensive')
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = configValidationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const validationRequest = validationResult.data

    // Validate configuration using Claude AI
    const validation = await claudeService.validateConfiguration(validationRequest.configuration)

    // Add context-specific validation based on user role
    const additionalSuggestions = []
    if (session.user.role === 'RETAIL_TRADER') {
      additionalSuggestions.push('Consider starting with smaller position sizes as a retail trader')
      additionalSuggestions.push('Ensure you understand all risk parameters before going live')
    } else if (session.user.role === 'INSTITUTIONAL_TRADER') {
      additionalSuggestions.push('Review compliance requirements for institutional trading')
      additionalSuggestions.push('Consider portfolio-level risk allocation limits')
    }

    return NextResponse.json({
      success: true,
      data: {
        ...validation,
        suggestions: [
          ...(validation.suggestions || []),
          ...additionalSuggestions
        ],
        metadata: {
          validationId: `config_${Date.now()}`,
          userId: session.user.id,
          userRole: session.user.role,
          timestamp: new Date().toISOString(),
          configurationType: validationRequest.configurationType,
          validationLevel: validationRequest.validationLevel,
          aiEnabled: claudeService.isAvailable()
        }
      }
    })

  } catch (error) {
    console.error('Claude config validation error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { success: false, error: `Configuration validation failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}