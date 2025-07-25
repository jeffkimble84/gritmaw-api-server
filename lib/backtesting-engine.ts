/**
 * Backtesting Engine
 * Provides strategy validation and performance analysis against historical data
 */

import { type IStrategy, type IOrder, type ITrade } from '@/lib/database/models'

export interface BacktestData {
  timestamp: Date
  symbol: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BacktestParameters {
  strategy: IStrategy
  startDate: Date
  endDate: Date
  initialCapital: number
  symbols: string[]
  commission: number // Per trade commission
  slippage: number // Percentage slippage
  maxPositions: number
}

export interface BacktestPosition {
  symbol: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  entryDate: Date
  quantity: number
  stopLoss?: number
  takeProfit?: number
  value: number
}

export interface BacktestTrade {
  symbol: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  exitPrice: number
  entryDate: Date
  exitDate: Date
  quantity: number
  profit: number
  profitPercent: number
  commission: number
  holdingPeriod: number // Days
  reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL_EXIT' | 'END_OF_PERIOD'
}

export interface BacktestMetrics {
  totalReturn: number
  totalReturnPercent: number
  annualizedReturn: number
  sharpeRatio: number
  maxDrawdown: number
  maxDrawdownPercent: number
  volatility: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  averageWin: number
  averageLoss: number
  profitFactor: number
  largestWin: number
  largestLoss: number
  averageHoldingPeriod: number
  totalCommissions: number
  calmarRatio: number
  sortinoRatio: number
}

export interface BacktestResult {
  strategy: IStrategy
  parameters: BacktestParameters
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: Array<{
    date: Date
    equity: number
    drawdown: number
    drawdownPercent: number
  }>
  monthlyReturns: Array<{
    month: string
    return: number
    returnPercent: number
  }>
  performanceStats: {
    bestMonth: number
    worstMonth: number
    positiveMonths: number
    negativeMonths: number
    maxConsecutiveWins: number
    maxConsecutiveLosses: number
  }
}

export interface TradingSignal {
  type: 'BUY' | 'SELL' | 'HOLD'
  strength: number // 0-1
  price: number
  timestamp: Date
  reasoning: string
}

class BacktestingEngine {
  private riskFreeRate = 0.02 // 2% annual risk-free rate

  /**
   * Run complete backtest for a strategy
   */
  async runBacktest(parameters: BacktestParameters): Promise<BacktestResult> {
    // Generate mock historical data (in production, this would come from real data sources)
    const historicalData = await this.generateHistoricalData(
      parameters.symbols,
      parameters.startDate,
      parameters.endDate
    )

    // Initialize backtest state
    let currentCapital = parameters.initialCapital
    let positions: BacktestPosition[] = []
    let trades: BacktestTrade[] = []
    let equityCurve: BacktestResult['equityCurve'] = []

    // Group data by date for chronological processing
    const dataByDate = this.groupDataByDate(historicalData)
    const dates = Object.keys(dataByDate).sort()

    for (const dateStr of dates) {
      const date = new Date(dateStr)
      const dayData = dataByDate[dateStr]

      // Process existing positions
      const { closedTrades, remainingPositions, capitalFromClosedTrades } = 
        this.processExistingPositions(positions, dayData, parameters)

      trades.push(...closedTrades)
      positions = remainingPositions
      currentCapital += capitalFromClosedTrades

      // Generate trading signals for each symbol
      for (const symbolData of dayData) {
        const signal = this.generateTradingSignal(
          symbolData,
          parameters.strategy,
          historicalData.filter(d => d.symbol === symbolData.symbol && d.timestamp <= date)
        )

        // Execute new trades based on signals
        if (signal.type === 'BUY' && positions.length < parameters.maxPositions) {
          const newPosition = this.executeEntry(
            signal,
            symbolData,
            currentCapital,
            parameters
          )

          if (newPosition) {
            positions.push(newPosition)
            currentCapital -= newPosition.value
          }
        }
      }

      // Calculate current equity
      const positionValue = positions.reduce((sum, pos) => {
        const currentPrice = dayData.find(d => d.symbol === pos.symbol)?.close || pos.entryPrice
        return sum + (pos.quantity * currentPrice)
      }, 0)

      const currentEquity = currentCapital + positionValue
      const drawdown = Math.max(0, parameters.initialCapital - currentEquity)
      const drawdownPercent = (drawdown / parameters.initialCapital) * 100

      equityCurve.push({
        date,
        equity: currentEquity,
        drawdown,
        drawdownPercent
      })
    }

    // Close remaining positions at the end
    const finalClosedTrades = positions.map(pos => {
      const finalData = historicalData
        .filter(d => d.symbol === pos.symbol)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]

      return this.closePosition(pos, finalData.close, parameters.endDate, 'END_OF_PERIOD', parameters)
    })

    trades.push(...finalClosedTrades)

    // Calculate comprehensive metrics
    const metrics = this.calculateMetrics(trades, equityCurve, parameters)

    // Calculate monthly returns
    const monthlyReturns = this.calculateMonthlyReturns(equityCurve)

    // Calculate performance statistics
    const performanceStats = this.calculatePerformanceStats(trades, monthlyReturns)

    return {
      strategy: parameters.strategy,
      parameters,
      metrics,
      trades,
      equityCurve,
      monthlyReturns,
      performanceStats
    }
  }

  /**
   * Generate mock historical data for backtesting
   */
  private async generateHistoricalData(
    symbols: string[],
    startDate: Date,
    endDate: Date
  ): Promise<BacktestData[]> {
    const data: BacktestData[] = []
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    for (const symbol of symbols) {
      let currentPrice = 100 + Math.random() * 200 // Random starting price between 100-300
      
      for (let i = 0; i <= days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
        
        // Simulate price movement with trend and volatility
        const trend = 0.0002 // Slight upward trend
        const volatility = 0.02 // 2% daily volatility
        const randomChange = (Math.random() - 0.5) * 2 * volatility
        
        currentPrice *= (1 + trend + randomChange)
        
        // Generate OHLC data
        const dayVolatility = volatility * 0.5
        const high = currentPrice * (1 + Math.random() * dayVolatility)
        const low = currentPrice * (1 - Math.random() * dayVolatility)
        const open = low + Math.random() * (high - low)
        const close = currentPrice
        const volume = Math.floor(1000000 + Math.random() * 5000000)

        data.push({
          timestamp: date,
          symbol,
          open,
          high,
          low,
          close,
          volume
        })
      }
    }

    return data
  }

  /**
   * Group historical data by date
   */
  private groupDataByDate(data: BacktestData[]): Record<string, BacktestData[]> {
    return data.reduce((acc, item) => {
      const dateKey = item.timestamp.toISOString().split('T')[0]
      if (!acc[dateKey]) acc[dateKey] = []
      acc[dateKey].push(item)
      return acc
    }, {} as Record<string, BacktestData[]>)
  }

  /**
   * Generate trading signals based on strategy
   */
  private generateTradingSignal(
    currentData: BacktestData,
    strategy: IStrategy,
    historicalData: BacktestData[]
  ): TradingSignal {
    if (historicalData.length < 20) {
      return {
        type: 'HOLD',
        strength: 0,
        price: currentData.close,
        timestamp: currentData.timestamp,
        reasoning: 'Insufficient historical data'
      }
    }

    // Simple moving average crossover strategy
    const shortPeriod = 10
    const longPeriod = 20
    
    const recentData = historicalData.slice(-longPeriod)
    const shortMA = recentData.slice(-shortPeriod).reduce((sum, d) => sum + d.close, 0) / shortPeriod
    const longMA = recentData.reduce((sum, d) => sum + d.close, 0) / longPeriod
    
    const prevShortMA = recentData.slice(-shortPeriod - 1, -1).reduce((sum, d) => sum + d.close, 0) / shortPeriod
    const prevLongMA = recentData.slice(-1)[0] ? 
      recentData.slice(0, -1).reduce((sum, d) => sum + d.close, 0) / (longPeriod - 1) : longMA

    // RSI calculation for additional confirmation
    const rsi = this.calculateRSI(recentData, 14)
    
    // Determine signal
    if (shortMA > longMA && prevShortMA <= prevLongMA && rsi < 70) {
      return {
        type: 'BUY',
        strength: Math.min(1, (shortMA - longMA) / longMA + (70 - rsi) / 100),
        price: currentData.close,
        timestamp: currentData.timestamp,
        reasoning: `MA crossover bullish, RSI: ${rsi.toFixed(1)}`
      }
    } else if (shortMA < longMA && prevShortMA >= prevLongMA && rsi > 30) {
      return {
        type: 'SELL',
        strength: Math.min(1, (longMA - shortMA) / longMA + (rsi - 30) / 100),
        price: currentData.close,
        timestamp: currentData.timestamp,
        reasoning: `MA crossover bearish, RSI: ${rsi.toFixed(1)}`
      }
    }

    return {
      type: 'HOLD',
      strength: 0,
      price: currentData.close,
      timestamp: currentData.timestamp,
      reasoning: 'No clear signal'
    }
  }

  /**
   * Calculate RSI for technical analysis
   */
  private calculateRSI(data: BacktestData[], period: number): number {
    if (data.length < period + 1) return 50

    const gains = []
    const losses = []

    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close
      gains.push(Math.max(0, change))
      losses.push(Math.max(0, -change))
    }

    const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period
    const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period

    if (avgLoss === 0) return 100
    
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  /**
   * Execute entry into a new position
   */
  private executeEntry(
    signal: TradingSignal,
    data: BacktestData,
    availableCapital: number,
    parameters: BacktestParameters
  ): BacktestPosition | null {
    const positionSize = Math.min(
      availableCapital * 0.1, // 10% of capital per position
      parameters.initialCapital * 0.2 // Maximum 20% of initial capital
    )

    if (positionSize < 1000) return null // Minimum position size

    const entryPrice = data.close * (1 + parameters.slippage / 100) // Apply slippage
    const quantity = Math.floor(positionSize / entryPrice)
    const actualValue = quantity * entryPrice + parameters.commission

    if (actualValue > availableCapital) return null

    // Set stop-loss and take-profit based on strategy
    const stopLoss = entryPrice * 0.95 // 5% stop loss
    const takeProfit = entryPrice * 1.15 // 15% take profit

    return {
      symbol: data.symbol,
      side: 'LONG',
      entryPrice,
      entryDate: data.timestamp,
      quantity,
      stopLoss,
      takeProfit,
      value: actualValue
    }
  }

  /**
   * Process existing positions for stops and exits
   */
  private processExistingPositions(
    positions: BacktestPosition[],
    dayData: BacktestData[],
    parameters: BacktestParameters
  ): {
    closedTrades: BacktestTrade[]
    remainingPositions: BacktestPosition[]
    capitalFromClosedTrades: number
  } {
    const closedTrades: BacktestTrade[] = []
    const remainingPositions: BacktestPosition[] = []
    let capitalFromClosedTrades = 0

    for (const position of positions) {
      const symbolData = dayData.find(d => d.symbol === position.symbol)
      if (!symbolData) {
        remainingPositions.push(position)
        continue
      }

      let exitReason: BacktestTrade['reason'] | null = null
      let exitPrice = symbolData.close

      // Check stop-loss
      if (position.stopLoss && symbolData.low <= position.stopLoss) {
        exitReason = 'STOP_LOSS'
        exitPrice = position.stopLoss
      }
      // Check take-profit
      else if (position.takeProfit && symbolData.high >= position.takeProfit) {
        exitReason = 'TAKE_PROFIT'
        exitPrice = position.takeProfit
      }

      if (exitReason) {
        const trade = this.closePosition(position, exitPrice, symbolData.timestamp, exitReason, parameters)
        closedTrades.push(trade)
        capitalFromClosedTrades += (trade.quantity * exitPrice) - parameters.commission
      } else {
        remainingPositions.push(position)
      }
    }

    return {
      closedTrades,
      remainingPositions,
      capitalFromClosedTrades
    }
  }

  /**
   * Close a position and create a trade record
   */
  private closePosition(
    position: BacktestPosition,
    exitPrice: number,
    exitDate: Date,
    reason: BacktestTrade['reason'],
    parameters: BacktestParameters
  ): BacktestTrade {
    const adjustedExitPrice = exitPrice * (1 - parameters.slippage / 100) // Apply exit slippage
    const profit = (adjustedExitPrice - position.entryPrice) * position.quantity - (parameters.commission * 2)
    const profitPercent = (profit / (position.entryPrice * position.quantity)) * 100
    const holdingPeriod = Math.ceil((exitDate.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: adjustedExitPrice,
      entryDate: position.entryDate,
      exitDate,
      quantity: position.quantity,
      profit,
      profitPercent,
      commission: parameters.commission * 2,
      holdingPeriod,
      reason
    }
  }

  /**
   * Calculate comprehensive backtest metrics
   */
  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: BacktestResult['equityCurve'],
    parameters: BacktestParameters
  ): BacktestMetrics {
    if (trades.length === 0 || equityCurve.length === 0) {
      return this.getEmptyMetrics()
    }

    const finalEquity = equityCurve[equityCurve.length - 1].equity
    const totalReturn = finalEquity - parameters.initialCapital
    const totalReturnPercent = (totalReturn / parameters.initialCapital) * 100

    // Calculate annualized return
    const days = equityCurve.length
    const years = days / 365
    const annualizedReturn = years > 0 ? (Math.pow(finalEquity / parameters.initialCapital, 1 / years) - 1) * 100 : 0

    // Calculate returns for Sharpe ratio
    const dailyReturns = equityCurve.slice(1).map((current, index) => {
      const previous = equityCurve[index]
      return (current.equity - previous.equity) / previous.equity
    })

    const avgDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length
    const dailyRiskFreeRate = this.riskFreeRate / 365
    const excessReturn = avgDailyReturn - dailyRiskFreeRate

    const volatility = this.calculateVolatility(dailyReturns)
    const sharpeRatio = volatility > 0 ? (excessReturn / volatility) * Math.sqrt(365) : 0

    // Calculate drawdowns
    const maxDrawdown = Math.max(...equityCurve.map(e => e.drawdown))
    const maxDrawdownPercent = Math.max(...equityCurve.map(e => e.drawdownPercent))

    // Trade statistics
    const winningTrades = trades.filter(t => t.profit > 0)
    const losingTrades = trades.filter(t => t.profit < 0)
    const winRate = (winningTrades.length / trades.length) * 100

    const averageWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length 
      : 0

    const averageLoss = losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length)
      : 0

    const profitFactor = averageLoss > 0 ? averageWin / averageLoss : 0

    const largestWin = Math.max(0, ...trades.map(t => t.profit))
    const largestLoss = Math.min(0, ...trades.map(t => t.profit))

    const averageHoldingPeriod = trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.length

    const totalCommissions = trades.reduce((sum, t) => sum + t.commission, 0)

    // Advanced ratios
    const calmarRatio = maxDrawdownPercent > 0 ? annualizedReturn / maxDrawdownPercent : 0
    
    const downsideReturns = dailyReturns.filter(r => r < 0)
    const downsideVolatility = downsideReturns.length > 0 ? this.calculateVolatility(downsideReturns) : 0
    const sortinoRatio = downsideVolatility > 0 ? (excessReturn / downsideVolatility) * Math.sqrt(365) : 0

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownPercent,
      volatility: volatility * Math.sqrt(365) * 100, // Annualized volatility as percentage
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      averageWin,
      averageLoss,
      profitFactor,
      largestWin,
      largestLoss,
      averageHoldingPeriod,
      totalCommissions,
      calmarRatio,
      sortinoRatio
    }
  }

  /**
   * Calculate volatility from returns array
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1)
    
    return Math.sqrt(variance)
  }

  /**
   * Calculate monthly returns
   */
  private calculateMonthlyReturns(equityCurve: BacktestResult['equityCurve']): BacktestResult['monthlyReturns'] {
    const monthlyData: Record<string, { start: number; end: number }> = {}

    for (const point of equityCurve) {
      const monthKey = `${point.date.getFullYear()}-${String(point.date.getMonth() + 1).padStart(2, '0')}`
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { start: point.equity, end: point.equity }
      } else {
        monthlyData[monthKey].end = point.equity
      }
    }

    return Object.entries(monthlyData).map(([month, data]) => {
      const returnAmount = data.end - data.start
      const returnPercent = data.start > 0 ? (returnAmount / data.start) * 100 : 0

      return {
        month,
        return: returnAmount,
        returnPercent
      }
    })
  }

  /**
   * Calculate performance statistics
   */
  private calculatePerformanceStats(
    trades: BacktestTrade[],
    monthlyReturns: BacktestResult['monthlyReturns']
  ): BacktestResult['performanceStats'] {
    const monthlyReturnPercentages = monthlyReturns.map(m => m.returnPercent)
    
    let maxConsecutiveWins = 0
    let maxConsecutiveLosses = 0
    let currentWinStreak = 0
    let currentLossStreak = 0

    for (const trade of trades) {
      if (trade.profit > 0) {
        currentWinStreak++
        currentLossStreak = 0
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak)
      } else if (trade.profit < 0) {
        currentLossStreak++
        currentWinStreak = 0
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak)
      }
    }

    return {
      bestMonth: Math.max(0, ...monthlyReturnPercentages),
      worstMonth: Math.min(0, ...monthlyReturnPercentages),
      positiveMonths: monthlyReturnPercentages.filter(r => r > 0).length,
      negativeMonths: monthlyReturnPercentages.filter(r => r < 0).length,
      maxConsecutiveWins,
      maxConsecutiveLosses
    }
  }

  /**
   * Get empty metrics for when no trades are available
   */
  private getEmptyMetrics(): BacktestMetrics {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      annualizedReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      volatility: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      largestWin: 0,
      largestLoss: 0,
      averageHoldingPeriod: 0,
      totalCommissions: 0,
      calmarRatio: 0,
      sortinoRatio: 0
    }
  }

  /**
   * Optimize strategy parameters using walk-forward analysis
   */
  async optimizeStrategy(
    baseStrategy: IStrategy,
    parameterRanges: Record<string, { min: number; max: number; step: number }>,
    backtestParams: Omit<BacktestParameters, 'strategy'>
  ): Promise<{
    bestStrategy: IStrategy
    bestMetrics: BacktestMetrics
    optimizationResults: Array<{
      parameters: Record<string, number>
      metrics: BacktestMetrics
    }>
  }> {
    const optimizationResults = []
    let bestMetrics: BacktestMetrics | null = null
    let bestStrategy = baseStrategy

    // Generate parameter combinations
    const parameterCombinations = this.generateParameterCombinations(parameterRanges)

    for (const params of parameterCombinations) {
      // Create modified strategy with new parameters
      const testStrategy = {
        ...baseStrategy,
        parameters: [
          ...baseStrategy.parameters,
          ...Object.keys(params).map(key => ({
            name: key,
            type: 'number' as const,
            value: params[key]
          }))
        ]
      } as unknown as IStrategy

      // Run backtest
      const result = await this.runBacktest({
        ...backtestParams,
        strategy: testStrategy
      })

      optimizationResults.push({
        parameters: params,
        metrics: result.metrics
      })

      // Check if this is the best result (using Sharpe ratio as primary metric)
      if (!bestMetrics || result.metrics.sharpeRatio > bestMetrics.sharpeRatio) {
        bestMetrics = result.metrics
        bestStrategy = testStrategy
      }
    }

    return {
      bestStrategy,
      bestMetrics: bestMetrics!,
      optimizationResults
    }
  }

  /**
   * Generate all parameter combinations for optimization
   */
  private generateParameterCombinations(
    ranges: Record<string, { min: number; max: number; step: number }>
  ): Record<string, number>[] {
    const parameterNames = Object.keys(ranges)
    const combinations: Record<string, number>[] = []

    const generateCombinations = (index: number, current: Record<string, number>) => {
      if (index === parameterNames.length) {
        combinations.push({ ...current })
        return
      }

      const paramName = parameterNames[index]
      const range = ranges[paramName]

      for (let value = range.min; value <= range.max; value += range.step) {
        current[paramName] = value
        generateCombinations(index + 1, current)
      }
    }

    generateCombinations(0, {})
    return combinations
  }
}

// Export singleton instance
export const backtestingEngine = new BacktestingEngine()
export default backtestingEngine