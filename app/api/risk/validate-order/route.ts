import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position, User } from '@/lib/database/models'
import riskManager from '@/lib/risk-management'
import { z } from 'zod'

/**
 * Order Risk Validation API
 * POST /api/risk/validate-order - Validate order against risk management rules
 */

const validateOrderSchema = z.object({
  symbol: z.string().min(1).max(10),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  type: z.enum(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']).optional(),
  stopLossPrice: z.number().positive().optional(),
  takeProfitPrice: z.number().positive().optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validationResult = validateOrderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const orderData = validationResult.data

    await connectToDatabase()

    // Get user data and positions
    const [user, positions] = await Promise.all([
      User.findById(session.user.id),
      Position.findOpenPositions(session.user.id)
    ])

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const portfolioValue = Position.calculateTotalValue(positions) || 50000

    // Create order object for validation
    const order = {
      symbol: orderData.symbol,
      side: orderData.side,
      quantity: orderData.quantity,
      price: orderData.price,
      type: orderData.type || 'MARKET'
    }

    // Validate order against risk rules
    const validation = riskManager.validateOrderRisk(order, positions, portfolioValue, user)

    // Calculate additional risk metrics
    const orderValue = orderData.quantity * orderData.price
    const positionSizePercent = (orderValue / portfolioValue) * 100

    // Check for existing position
    const existingPosition = positions.find(p => p.symbol === orderData.symbol && p.status === 'OPEN')
    let combinedExposure = 0
    let combinedPercent = 0

    if (existingPosition && orderData.side === 'BUY') {
      combinedExposure = (existingPosition.marketValue || 0) + orderValue
      combinedPercent = (combinedExposure / portfolioValue) * 100
    }

    // Risk level assessment
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
    if (!validation.isValid || validation.errors.length > 0) {
      riskLevel = 'CRITICAL'
    } else if (positionSizePercent > 15 || validation.warnings.length > 2) {
      riskLevel = 'HIGH'
    } else if (positionSizePercent > 10 || validation.warnings.length > 0) {
      riskLevel = 'MEDIUM'
    }

    // Generate position sizing recommendation
    let positionSizingRecommendation = null
    if (orderData.stopLossPrice && orderData.side === 'BUY') {
      const sizing = riskManager.calculatePositionSize({
        symbol: orderData.symbol,
        entryPrice: orderData.price,
        stopLossPrice: orderData.stopLossPrice,
        portfolioValue,
        riskPerTrade: 2.0, // 2% default risk
        userRiskTolerance: user.tradingProfile?.riskTolerance || 'MEDIUM'
      })

      positionSizingRecommendation = {
        recommendedShares: sizing.recommendedShares,
        recommendedValue: sizing.recommendedValue,
        riskAmount: sizing.riskAmount,
        riskPercent: sizing.riskPercent,
        difference: orderData.quantity - sizing.recommendedShares,
        differencePercent: sizing.recommendedShares > 0 
          ? ((orderData.quantity - sizing.recommendedShares) / sizing.recommendedShares) * 100 
          : 0
      }
    }

    // Market impact analysis (simplified)
    const dailyVolumeEstimate = 1000000 // Mock daily volume
    const marketImpact = (orderValue / dailyVolumeEstimate) * 100

    // Liquidity analysis
    const liquidityAnalysis = {
      marketImpact: marketImpact,
      liquidityRisk: marketImpact > 1 ? 'HIGH' : marketImpact > 0.5 ? 'MEDIUM' : 'LOW',
      estimatedSlippage: Math.min(marketImpact * 0.1, 0.5), // Estimated slippage %
      recommendedExecutionStrategy: marketImpact > 1 
        ? 'Break into smaller orders'
        : marketImpact > 0.5 
        ? 'Use limit orders'
        : 'Market order acceptable'
    }

    // Timing analysis
    const marketHours = new Date().getHours()
    const isMarketHours = marketHours >= 9 && marketHours <= 16
    const timingAnalysis = {
      isMarketHours,
      liquidityPeriod: isMarketHours ? 'HIGH' : 'LOW',
      recommendation: !isMarketHours 
        ? 'Consider placing order during market hours for better liquidity'
        : 'Good timing for order execution'
    }

    // Final recommendations
    const recommendations = [
      ...validation.warnings,
      ...(positionSizingRecommendation?.difference && Math.abs(positionSizingRecommendation.difference) > 10
        ? [`Consider adjusting quantity to ${positionSizingRecommendation.recommendedShares} shares based on risk analysis`]
        : []),
      ...(liquidityAnalysis.liquidityRisk === 'HIGH' 
        ? ['Large order may impact market price - consider breaking into smaller orders']
        : []),
      ...(orderData.side === 'BUY' && !orderData.stopLossPrice 
        ? ['Consider setting a stop-loss order to limit downside risk']
        : []),
      ...(combinedPercent > 20 
        ? [`Combined exposure to ${orderData.symbol} would be ${combinedPercent.toFixed(1)}% - consider diversification`]
        : [])
    ]

    return NextResponse.json({
      success: true,
      data: {
        validation: {
          ...validation,
          riskLevel
        },
        orderAnalysis: {
          orderValue,
          positionSizePercent: Number(positionSizePercent.toFixed(2)),
          portfolioValue,
          existingPosition: existingPosition ? {
            value: existingPosition.marketValue,
            shares: existingPosition.quantity,
            avgCost: existingPosition.avgCost
          } : null,
          combinedExposure: combinedExposure > 0 ? {
            value: combinedExposure,
            percent: Number(combinedPercent.toFixed(2))
          } : null
        },
        positionSizingRecommendation,
        liquidityAnalysis: {
          ...liquidityAnalysis,
          marketImpact: Number(liquidityAnalysis.marketImpact.toFixed(3)),
          estimatedSlippage: Number(liquidityAnalysis.estimatedSlippage.toFixed(3))
        },
        timingAnalysis,
        recommendations,
        userProfile: {
          riskTolerance: user.tradingProfile?.riskTolerance || 'MEDIUM',
          experienceLevel: user.role === 'INSTITUTIONAL_TRADER' ? 'ADVANCED' : 'INTERMEDIATE',
          maxDailyLoss: 1000 // TODO: Add when user trading profile schema supports it
        },
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Order validation error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to validate order' },
      { status: 500 }
    )
  }
}