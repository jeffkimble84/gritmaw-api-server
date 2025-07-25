import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectToDatabase } from '@/lib/database'
import { Position } from '@/lib/database/models'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * Positions API Route
 * GET /api/positions - List user's positions
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'OPEN'
    const symbol = searchParams.get('symbol')

    // Build query
    const query: any = { userId: session.user.id }
    if (status) {
      query.status = status
    }
    if (symbol) {
      query.symbol = symbol.toUpperCase()
    }

    // Fetch positions
    const positions = await Position.find(query)
      .populate('strategyId', 'name type')
      .sort({ marketValue: -1 })
      .lean()

    // Calculate portfolio metrics
    const openPositions = positions.filter(p => p.status === 'OPEN')
    const portfolioMetrics = Position.calculatePortfolioMetrics(openPositions)

    // Calculate additional metrics
    const topGainers = openPositions
      .filter(p => (p.gainLossPercent || 0) > 0)
      .sort((a, b) => (b.gainLossPercent || 0) - (a.gainLossPercent || 0))
      .slice(0, 5)

    const topLosers = openPositions
      .filter(p => (p.gainLossPercent || 0) < 0)
      .sort((a, b) => (a.gainLossPercent || 0) - (b.gainLossPercent || 0))
      .slice(0, 5)

    return NextResponse.json({
      success: true,
      data: {
        positions,
        metrics: {
          ...portfolioMetrics,
          positionCount: openPositions.length,
          topGainers: topGainers.map(p => ({
            symbol: p.symbol,
            pnlPercent: p.gainLossPercent,
            pnl: p.gainLoss
          })),
          topLosers: topLosers.map(p => ({
            symbol: p.symbol,
            pnlPercent: p.gainLossPercent,
            pnl: p.gainLoss
          }))
        }
      }
    })

  } catch (error) {
    console.error('Error fetching positions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}