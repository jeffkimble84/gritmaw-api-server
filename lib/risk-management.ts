/**
 * Risk Management Module
 * Provides position sizing, stop-loss logic, and portfolio risk calculations
 */

import { type IPosition, type IOrder, type ITrade, type IUser } from '@/lib/database/models'

export interface RiskParameters {
  maxPortfolioRisk: number // Maximum portfolio risk percentage (e.g., 2%)
  maxPositionSize: number // Maximum position size as percentage of portfolio
  maxCorrelatedExposure: number // Maximum exposure to correlated assets
  stopLossPercent: number // Default stop-loss percentage
  takeProfitPercent?: number // Default take-profit percentage
  maxDrawdown: number // Maximum allowed drawdown
  maxDailyLoss: number // Maximum daily loss limit
  riskFreeRate: number // Risk-free rate for calculations
}

export interface PositionSizingInput {
  symbol: string
  entryPrice: number
  stopLossPrice: number
  portfolioValue: number
  riskPerTrade: number // As percentage of portfolio
  userRiskTolerance: 'LOW' | 'MEDIUM' | 'HIGH'
  volatility?: number // Annualized volatility
  correlation?: number // Correlation with existing positions
}

export interface PositionSizingResult {
  recommendedShares: number
  recommendedValue: number
  riskAmount: number
  riskPercent: number
  positionSizePercent: number
  stopLossDistance: number
  warnings: string[]
  adjustments: string[]
}

export interface RiskMetrics {
  portfolioRisk: number
  sharpeRatio: number
  volatility: number
  beta: number
  maxDrawdown: number
  valueAtRisk: number // 95% VaR
  expectedShortfall: number // Conditional VaR
  concentrationRisk: number
  correlationRisk: number
}

export interface StopLossRecommendation {
  symbol: string
  currentPrice: number
  suggestedStopLoss: number
  stopLossPercent: number
  riskAmount: number
  reason: string
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

class RiskManager {
  private defaultParameters: RiskParameters = {
    maxPortfolioRisk: 2.0, // 2% max portfolio risk per trade
    maxPositionSize: 20.0, // 20% max position size
    maxCorrelatedExposure: 40.0, // 40% max correlated exposure
    stopLossPercent: 5.0, // 5% default stop loss
    takeProfitPercent: 15.0, // 15% default take profit
    maxDrawdown: 20.0, // 20% max drawdown
    maxDailyLoss: 5.0, // 5% max daily loss
    riskFreeRate: 0.02 // 2% risk-free rate
  }

  /**
   * Calculate optimal position size based on risk parameters
   */
  calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
    const {
      entryPrice,
      stopLossPrice,
      portfolioValue,
      riskPerTrade,
      userRiskTolerance,
      volatility = 0.2,
      correlation = 0
    } = input

    const warnings: string[] = []
    const adjustments: string[] = []

    // Calculate stop-loss distance
    const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice * 100

    // Adjust risk per trade based on user tolerance
    let adjustedRiskPerTrade = riskPerTrade
    const toleranceMultipliers = {
      'LOW': 0.5,
      'MEDIUM': 1.0,
      'HIGH': 1.5
    }
    adjustedRiskPerTrade *= toleranceMultipliers[userRiskTolerance]

    // Calculate base position size using risk-based formula
    const riskAmount = portfolioValue * (adjustedRiskPerTrade / 100)
    const priceRisk = Math.abs(entryPrice - stopLossPrice)
    const baseShares = Math.floor(riskAmount / priceRisk)
    const baseValue = baseShares * entryPrice

    // Apply volatility adjustment
    const volatilityAdjustment = Math.max(0.5, Math.min(1.5, 1 / volatility))
    const adjustedShares = Math.floor(baseShares * volatilityAdjustment)
    const adjustedValue = adjustedShares * entryPrice

    // Check position size limits
    const positionSizePercent = (adjustedValue / portfolioValue) * 100
    let finalShares = adjustedShares
    let finalValue = adjustedValue

    if (positionSizePercent > this.defaultParameters.maxPositionSize) {
      finalShares = Math.floor(portfolioValue * (this.defaultParameters.maxPositionSize / 100) / entryPrice)
      finalValue = finalShares * entryPrice
      warnings.push(`Position size reduced to ${this.defaultParameters.maxPositionSize}% limit`)
      adjustments.push('Consider reducing position size or increasing stop-loss distance')
    }

    // Correlation adjustment
    if (correlation > 0.7) {
      finalShares = Math.floor(finalShares * 0.7) // Reduce by 30% for high correlation
      finalValue = finalShares * entryPrice
      warnings.push('Position size reduced due to high correlation with existing holdings')
      adjustments.push('Consider diversifying into uncorrelated assets')
    }

    // Final risk calculations
    const finalRiskAmount = finalShares * priceRisk
    const finalRiskPercent = (finalRiskAmount / portfolioValue) * 100
    const finalPositionPercent = (finalValue / portfolioValue) * 100

    // Generate warnings and recommendations
    if (stopLossDistance > 10) {
      warnings.push('Stop-loss distance is high (>10%), consider tighter risk management')
    }

    if (finalRiskPercent > this.defaultParameters.maxPortfolioRisk) {
      warnings.push(`Risk per trade (${finalRiskPercent.toFixed(2)}%) exceeds recommended limit`)
    }

    if (volatility > 0.4) {
      warnings.push('High volatility asset - consider smaller position size')
      adjustments.push('Monitor position closely and consider trailing stops')
    }

    return {
      recommendedShares: Math.max(0, finalShares),
      recommendedValue: finalValue,
      riskAmount: finalRiskAmount,
      riskPercent: finalRiskPercent,
      positionSizePercent: finalPositionPercent,
      stopLossDistance,
      warnings,
      adjustments
    }
  }

  /**
   * Calculate dynamic stop-loss recommendations for existing positions
   */
  calculateStopLossRecommendations(
    positions: IPosition[],
    currentPrices: Record<string, number>,
    marketVolatility: Record<string, number> = {}
  ): StopLossRecommendation[] {
    return positions
      .filter(position => position.status === 'OPEN' && position.quantity > 0)
      .map(position => {
        const currentPrice = currentPrices[position.symbol] || position.currentPrice || position.avgCost
        const volatility = marketVolatility[position.symbol] || 0.2
        
        // Calculate unrealized P&L percentage
        const pnlPercent = ((currentPrice - position.avgCost) / position.avgCost) * 100
        
        // Determine stop-loss strategy based on position performance
        let suggestedStopLoss: number
        let reason: string
        let urgency: StopLossRecommendation['urgency'] = 'LOW'

        if (pnlPercent > 20) {
          // Profitable position - use trailing stop
          suggestedStopLoss = currentPrice * (1 - Math.max(0.05, volatility * 0.5))
          reason = 'Trailing stop to protect profits'
          urgency = 'LOW'
        } else if (pnlPercent > 0) {
          // Small profit - breakeven stop
          suggestedStopLoss = position.avgCost * 1.01 // 1% above breakeven
          reason = 'Breakeven stop to protect against losses'
          urgency = 'MEDIUM'
        } else if (pnlPercent > -5) {
          // Small loss - tight stop
          suggestedStopLoss = position.avgCost * (1 - Math.min(0.08, volatility))
          reason = 'Tight stop-loss to limit further losses'
          urgency = 'MEDIUM'
        } else if (pnlPercent > -15) {
          // Moderate loss - consider exit
          suggestedStopLoss = currentPrice * (1 - 0.03)
          reason = 'Consider immediate exit - position showing significant loss'
          urgency = 'HIGH'
        } else {
          // Large loss - urgent exit
          suggestedStopLoss = currentPrice * (1 - 0.01)
          reason = 'Urgent exit recommended - major loss protection'
          urgency = 'CRITICAL'
        }

        // Ensure stop-loss is below current price for long positions
        suggestedStopLoss = Math.min(suggestedStopLoss, currentPrice * 0.99)

        const stopLossPercent = ((currentPrice - suggestedStopLoss) / currentPrice) * 100
        const riskAmount = position.quantity * (currentPrice - suggestedStopLoss)

        return {
          symbol: position.symbol,
          currentPrice,
          suggestedStopLoss,
          stopLossPercent,
          riskAmount,
          reason,
          urgency
        }
      })
      .sort((a, b) => {
        const urgencyOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 }
        return urgencyOrder[b.urgency] - urgencyOrder[a.urgency]
      })
  }

  /**
   * Calculate comprehensive portfolio risk metrics
   */
  calculatePortfolioRisk(
    positions: IPosition[],
    trades: ITrade[],
    portfolioValue: number
  ): RiskMetrics {
    // Calculate portfolio volatility
    const returns = this.calculatePortfolioReturns(trades)
    const volatility = this.calculateVolatility(returns)
    
    // Calculate Sharpe ratio
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length || 0
    const excessReturn = avgReturn - (this.defaultParameters.riskFreeRate / 252) // Daily risk-free rate
    const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0

    // Calculate Value at Risk (95% confidence)
    const sortedReturns = returns.sort((a, b) => a - b)
    const varIndex = Math.floor(returns.length * 0.05)
    const valueAtRisk = sortedReturns[varIndex] || 0

    // Calculate Expected Shortfall (Conditional VaR)
    const tailReturns = sortedReturns.slice(0, varIndex)
    const expectedShortfall = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length || 0

    // Calculate concentration risk
    const totalValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0)
    const concentrationRisk = totalValue > 0 
      ? Math.max(...positions.map(p => ((p.marketValue || 0) / totalValue) * 100))
      : 0

    // Calculate maximum drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades)

    // Estimate beta (simplified - in production would use market correlation)
    const beta = 1.0 // Default market beta

    return {
      portfolioRisk: volatility * 100,
      sharpeRatio,
      volatility: volatility * Math.sqrt(252) * 100, // Annualized
      beta,
      maxDrawdown,
      valueAtRisk: Math.abs(valueAtRisk) * portfolioValue,
      expectedShortfall: Math.abs(expectedShortfall) * portfolioValue,
      concentrationRisk,
      correlationRisk: this.calculateCorrelationRisk(positions)
    }
  }

  /**
   * Validate order against risk limits
   */
  validateOrderRisk(
    order: Partial<IOrder>,
    positions: IPosition[],
    portfolioValue: number,
    user: IUser
  ): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = []
    const errors: string[] = []

    if (!order.symbol || !order.quantity || !order.price) {
      errors.push('Missing required order details')
      return { isValid: false, warnings, errors }
    }

    const orderValue = order.quantity * order.price
    const positionSizePercent = (orderValue / portfolioValue) * 100

    // Check position size limits
    if (positionSizePercent > this.defaultParameters.maxPositionSize) {
      errors.push(`Position size (${positionSizePercent.toFixed(1)}%) exceeds limit (${this.defaultParameters.maxPositionSize}%)`)
    }

    // Check existing position concentration
    const existingPosition = positions.find(p => p.symbol === order.symbol && p.status === 'OPEN')
    if (existingPosition && order.side === 'BUY') {
      const totalValue = (existingPosition.marketValue || 0) + orderValue
      const totalPercent = (totalValue / portfolioValue) * 100
      
      if (totalPercent > this.defaultParameters.maxPositionSize) {
        errors.push(`Combined position size would exceed ${this.defaultParameters.maxPositionSize}% limit`)
      } else if (totalPercent > this.defaultParameters.maxPositionSize * 0.8) {
        warnings.push(`Combined position approaching size limit (${totalPercent.toFixed(1)}%)`)
      }
    }

    // Check portfolio risk based on user risk tolerance
    const maxRiskByTolerance = {
      'LOW': 15000,
      'MEDIUM': 50000,
      'HIGH': 100000
    }

    const userRiskTolerance = user.tradingProfile?.riskTolerance || 'MEDIUM'
    const maxRisk = maxRiskByTolerance[userRiskTolerance]

    if (orderValue > maxRisk) {
      warnings.push(`Order value exceeds risk tolerance for ${userRiskTolerance} risk profile`)
    }

    // Check if stop-loss is set for significant positions
    if (orderValue > portfolioValue * 0.05 && order.side === 'BUY' && order.type === 'MARKET') {
      warnings.push('Consider setting stop-loss for large market orders')
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    }
  }

  /**
   * Generate risk management recommendations
   */
  generateRiskRecommendations(
    positions: IPosition[],
    trades: ITrade[],
    portfolioValue: number
  ): Array<{
    type: 'POSITION_SIZE' | 'STOP_LOSS' | 'DIVERSIFICATION' | 'CORRELATION' | 'VOLATILITY'
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    title: string
    description: string
    action: string
    impact: string
  }> {
    const recommendations = []
    const riskMetrics = this.calculatePortfolioRisk(positions, trades, portfolioValue)

    // Position size recommendations
    const largePositions = positions.filter(p => 
      p.status === 'OPEN' && (p.marketValue || 0) / portfolioValue > 0.15
    )

    if (largePositions.length > 0) {
      recommendations.push({
        type: 'POSITION_SIZE' as const,
        severity: largePositions.some(p => (p.marketValue || 0) / portfolioValue > 0.25) ? 'HIGH' as const : 'MEDIUM' as const,
        title: 'Large Position Concentration',
        description: `${largePositions.length} position(s) exceed 15% of portfolio value`,
        action: 'Consider reducing position sizes or rebalancing portfolio',
        impact: 'Reduces concentration risk and improves diversification'
      })
    }

    // Stop-loss recommendations
    const positionsAtRisk = positions.filter(p => 
      p.status === 'OPEN' && (p.unrealizedPnLPercent || 0) < -10
    )

    if (positionsAtRisk.length > 0) {
      recommendations.push({
        type: 'STOP_LOSS' as const,
        severity: positionsAtRisk.some(p => (p.unrealizedPnLPercent || 0) < -20) ? 'CRITICAL' as const : 'HIGH' as const,
        title: 'Positions Exceeding Loss Limits',
        description: `${positionsAtRisk.length} position(s) showing significant losses`,
        action: 'Review and update stop-loss orders immediately',
        impact: 'Prevents further losses and preserves capital'
      })
    }

    // Diversification recommendations
    if (positions.length < 5 && portfolioValue > 50000) {
      recommendations.push({
        type: 'DIVERSIFICATION' as const,
        severity: 'MEDIUM' as const,
        title: 'Limited Diversification',
        description: 'Portfolio contains fewer than 5 positions',
        action: 'Consider adding positions in different sectors or asset classes',
        impact: 'Reduces overall portfolio risk through diversification'
      })
    }

    // Volatility recommendations
    if (riskMetrics.volatility > 30) {
      recommendations.push({
        type: 'VOLATILITY' as const,
        severity: 'HIGH' as const,
        title: 'High Portfolio Volatility',
        description: `Portfolio volatility is ${riskMetrics.volatility.toFixed(1)}% (>30%)`,
        action: 'Consider adding stable assets or reducing position sizes',
        impact: 'Reduces daily price swings and drawdown risk'
      })
    }

    return recommendations.sort((a, b) => {
      const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 }
      return severityOrder[b.severity] - severityOrder[a.severity]
    })
  }

  // Private helper methods

  private calculatePortfolioReturns(trades: ITrade[]): number[] {
    // Group trades by day and calculate daily returns
    const dailyTrades = trades.reduce((acc, trade) => {
      const date = trade.executedAt.toISOString().split('T')[0]
      if (!acc[date]) acc[date] = []
      acc[date].push(trade)
      return acc
    }, {} as Record<string, ITrade[]>)

    return Object.values(dailyTrades).map(dayTrades => {
      return dayTrades.reduce((sum, trade) => {
        return sum + (trade.performance?.profit || 0)
      }, 0)
    })
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1)
    
    return Math.sqrt(variance)
  }

  private calculateMaxDrawdown(trades: ITrade[]): number {
    let maxDrawdown = 0
    let peak = 0
    let runningTotal = 0

    trades.forEach(trade => {
      runningTotal += trade.performance?.profit || 0
      if (runningTotal > peak) {
        peak = runningTotal
      }
      const drawdown = (peak - runningTotal) / peak * 100
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    })

    return maxDrawdown
  }

  private calculateCorrelationRisk(positions: IPosition[]): number {
    // Simplified correlation risk - in production would use actual correlation matrix
    const sectorCount = new Set(positions.map(p => 'UNKNOWN')).size // TODO: Add sector when metadata exists
    const positionCount = positions.length
    
    return positionCount > 0 ? Math.max(0, 100 - (sectorCount / positionCount * 100)) : 0
  }

  /**
   * Update risk parameters (for admin/advanced users)
   */
  updateRiskParameters(params: Partial<RiskParameters>): void {
    this.defaultParameters = { ...this.defaultParameters, ...params }
  }

  /**
   * Get current risk parameters
   */
  getRiskParameters(): RiskParameters {
    return { ...this.defaultParameters }
  }
}

// Export singleton instance
export const riskManager = new RiskManager()
export default riskManager