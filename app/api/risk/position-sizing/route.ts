import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position } from '@/lib/database/models'
import riskManager from '@/lib/risk-management'
import { z } from 'zod'

/**
 * Position Sizing API
 * POST /api/risk/position-sizing - Calculate optimal position size
 */

const positionSizingSchema = z.object({
  symbol: z.string().min(1).max(10),
  entryPrice: z.number().positive(),
  stopLossPrice: z.number().positive(),
  riskPerTrade: z.number().min(0.1).max(10), // 0.1% to 10% risk per trade
  volatility: z.number().min(0.01).max(2).optional(),
  correlation: z.number().min(-1).max(1).optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = positionSizingSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const input = validationResult.data

    await connectToDatabase()

    // Get user's current positions to calculate portfolio value
    const positions = await Position.findOpenPositions(session.user.id)
    const portfolioValue = Position.calculateTotalValue(positions) || 50000 // Default fallback

    // Get user risk tolerance from database
    const { User } = await import('@/lib/database/models')
    const user = await User.findById(session.user.id)
    const userRiskTolerance = user?.tradingProfile?.riskTolerance || 'MEDIUM'

    // Calculate correlation with existing positions (simplified)
    let correlation = input.correlation || 0
    if (!input.correlation) {
      const existingPosition = positions.find(p => p.symbol === input.symbol)
      if (existingPosition) {
        correlation = 0.3 // Assume some correlation with existing position
      }
    }

    // Calculate optimal position size
    const sizing = riskManager.calculatePositionSize({
      symbol: input.symbol,
      entryPrice: input.entryPrice,
      stopLossPrice: input.stopLossPrice,
      portfolioValue,
      riskPerTrade: input.riskPerTrade,
      userRiskTolerance,
      volatility: input.volatility,
      correlation
    })

    // Add additional context
    const response = {
      ...sizing,
      portfolioValue,
      userRiskTolerance,
      input: {
        symbol: input.symbol,
        entryPrice: input.entryPrice,
        stopLossPrice: input.stopLossPrice,
        riskPerTrade: input.riskPerTrade
      },
      recommendations: [
        sizing.recommendedShares > 0 
          ? `Buy ${sizing.recommendedShares} shares of ${input.symbol}`
          : 'Position size too small or risky - consider different entry/stop prices',
        `Total position value: $${sizing.recommendedValue.toLocaleString()}`,
        `Risk amount: $${sizing.riskAmount.toLocaleString()} (${sizing.riskPercent.toFixed(2)}% of portfolio)`,
        ...sizing.adjustments
      ]
    }

    return NextResponse.json({
      success: true,
      data: response
    })

  } catch (error) {
    console.error('Position sizing calculation error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to calculate position sizing' },
      { status: 500 }
    )
  }
}