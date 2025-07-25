import { TradingDecision, ConsistencyResult, IntelligenceAlert, TradeIntent, CapitalAllocation, CONSISTENCY_THRESHOLDS, BEHAVIORAL_RULES } from '@/types/core'

export interface DecisionInput {
  symbol?: string
  decisionType: 'POSITION_OPEN' | 'POSITION_CLOSE' | 'ALLOCATION_CHANGE'
  confidence: number
  capitalAllocation: CapitalAllocation
  position?: {
    symbol: string
    size: number
    category: 'core' | 'tactical' | 'war_chest'
    timeHorizon: string
  }
  strategyName: string
  reasoning?: string
}

/**
 * GRITMAW V2 - TRADING INTELLIGENCE CONSISTENCY CHECKER
 * 
 * Prevents XRP/MP Materials execution error patterns
 * Implements 24-hour decision consistency analysis
 * Provides non-blocking guidance and recommendations
 */
export class ConsistencyChecker {
  private static readonly LOOKBACK_HOURS = CONSISTENCY_THRESHOLDS.LOOKBACK_HOURS
  private static readonly HIGH_CONTRADICTION_THRESHOLD = CONSISTENCY_THRESHOLDS.HIGH_CONTRADICTION
  private static readonly WARNING_THRESHOLD = CONSISTENCY_THRESHOLDS.WARNING

  /**
   * Main consistency check function
   * Analyzes trade intent against recent decisions and behavioral rules
   */
  static async checkDecisionConsistency(
    decision: DecisionInput,
    userId?: string
  ): Promise<ConsistencyResult> {
    const result: ConsistencyResult = {
      contradicts: false,
      score: 0,
      details: [],
      warnings: [],
      recommendations: [],
      alerts: []
    }

    try {
      // 1. Check for recent contradictory decisions
      const contradictionCheck = await this.checkRecentContradictions(decision, userId)
      result.contradicts = contradictionCheck.contradicts
      result.score = Math.max(result.score, contradictionCheck.score)
      result.details.push(...contradictionCheck.details)

      // 2. Validate capital allocation discipline (60/25/15 rule)
      const capitalCheck = await this.validateCapitalDiscipline(decision)
      if (capitalCheck.violations.length > 0) {
        result.contradicts = true
        result.score = Math.max(result.score, 0.8)
        result.details.push(...capitalCheck.violations)
        
        // Add critical alert for capital violations
        result.alerts.push({
          id: `capital_violation_${Date.now()}`,
          type: 'critical',
          title: 'Capital Allocation Violation',
          message: capitalCheck.violations.join('. '),
          confidence: 0.95,
          canOverride: false,
          createdAt: new Date().toISOString()
        })
      }

      // 3. Check for execution error patterns (XRP/MP Materials prevention)
      const executionCheck = await this.checkExecutionPatterns(decision)
      result.warnings.push(...executionCheck.warnings)
      result.recommendations.push(...executionCheck.recommendations)
      
      if (executionCheck.alerts.length > 0) {
        result.alerts.push(...executionCheck.alerts)
      }

      // 4. Analyze behavioral rule compliance
      const behavioralCheck = await this.checkBehavioralRules(decision)
      result.alerts.push(...behavioralCheck.alerts)
      result.recommendations.push(...behavioralCheck.recommendations)

      // 5. Check catalyst alignment (if symbol provided)
      if (decision.symbol) {
        const catalystCheck = await this.checkCatalystAlignment(decision.symbol, decision.decisionType)
        result.details.push(...catalystCheck.details)
        result.recommendations.push(...catalystCheck.recommendations)
        if (catalystCheck.alerts.length > 0) {
          result.alerts.push(...catalystCheck.alerts)
        }
      }

      // 6. Generate final recommendations
      this.generateFinalRecommendations(result, decision)

    } catch (error) {
      console.error('Error in consistency check:', error)
      result.warnings.push('Consistency check incomplete due to system error')
      result.alerts.push({
        id: `system_error_${Date.now()}`,
        type: 'warning',
        title: 'Analysis Incomplete',
        message: 'Trading intelligence analysis could not be completed. Proceed with extra caution.',
        confidence: 0.5,
        canOverride: true,
        createdAt: new Date().toISOString()
      })
    }

    return result
  }

  /**
   * Check for contradictory decisions within lookback period
   * Core XRP/MP Materials prevention logic
   */
  private static async checkRecentContradictions(
    decision: DecisionInput,
    userId?: string
  ): Promise<{ contradicts: boolean; score: number; details: string[] }> {
    const cutoffTime = new Date(Date.now() - this.LOOKBACK_HOURS * 60 * 60 * 1000)
    
    try {
      // In production, this would query the TradingDecision collection
      // For V2, we'll use localStorage for demo purposes
      const recentDecisions = this.getRecentDecisionsFromStorage(userId, cutoffTime)

      // Check for opposite decisions on the same symbol
      if (decision.symbol) {
        const oppositeDecisions = recentDecisions.filter(d => 
          d.position?.symbol === decision.symbol &&
          this.isOppositeDecision(d.decisionType, decision.decisionType) &&
          new Date(d.timestamp) >= cutoffTime
        )

        if (oppositeDecisions.length > 0) {
          return {
            contradicts: true,
            score: 0.8,
            details: [
              `Found ${oppositeDecisions.length} contradictory decision(s) for ${decision.symbol} in last ${this.LOOKBACK_HOURS} hours`,
              'XRP/MP Materials Pattern: Consider 24-hour cooling period before making opposite decisions'
            ]
          }
        }
      }

      // Check for strategy flip-flopping
      const recentStrategyChanges = recentDecisions.filter(d =>
        d.strategyName !== decision.strategyName &&
        new Date(d.timestamp) >= cutoffTime
      )

      if (recentStrategyChanges.length > 2) {
        return {
          contradicts: true,
          score: 0.6,
          details: [
            `Multiple strategy changes detected in ${this.LOOKBACK_HOURS} hours`,
            'Strategy flip-flopping may indicate emotional decision-making'
          ]
        }
      }

      return {
        contradicts: false,
        score: 0.1,
        details: ['No recent contradictory decisions found']
      }

    } catch (error) {
      return {
        contradicts: false,
        score: 0,
        details: ['Unable to check recent decisions due to system error']
      }
    }
  }

  /**
   * Validate capital allocation follows 60/25/15 discipline
   */
  private static async validateCapitalDiscipline(
    decision: DecisionInput
  ): Promise<{ compliant: boolean; violations: string[] }> {
    const violations: string[] = []
    const { capitalAllocation } = decision

    if (!capitalAllocation) {
      violations.push('Capital allocation information missing')
      return { compliant: false, violations }
    }

    const { totalCapital, core, tactical, warChest } = capitalAllocation

    // Check percentage allocations (60/25/15 rule with 5% tolerance)
    const corePercent = (core.allocated / totalCapital) * 100
    const tacticalPercent = (tactical.allocated / totalCapital) * 100
    const warChestPercent = (warChest.allocated / totalCapital) * 100

    if (Math.abs(corePercent - 60) > 5) {
      violations.push(`Core allocation ${corePercent.toFixed(1)}% deviates from 60% target`)
    }
    if (Math.abs(tacticalPercent - 25) > 5) {
      violations.push(`Tactical allocation ${tacticalPercent.toFixed(1)}% deviates from 25% target`)
    }
    if (Math.abs(warChestPercent - 15) > 5) {
      violations.push(`War chest allocation ${warChestPercent.toFixed(1)}% deviates from 15% target`)
    }

    // Check for over-allocation (prevents XRP/MP error)
    if (core.used > core.allocated) {
      violations.push('Core holdings would exceed allocated capital - resize positions instead')
    }
    if (tactical.used > tactical.allocated) {
      violations.push('Tactical plays would exceed allocated capital - resize positions instead')
    }
    if (warChest.used > warChest.allocated) {
      violations.push('War chest usage would exceed allocated capital')
    }

    return {
      compliant: violations.length === 0,
      violations
    }
  }

  /**
   * Check for execution error patterns like XRP/MP Materials
   */
  private static async checkExecutionPatterns(
    decision: DecisionInput
  ): Promise<{ warnings: string[]; recommendations: string[]; alerts: IntelligenceAlert[] }> {
    const warnings: string[] = []
    const recommendations: string[] = []
    const alerts: IntelligenceAlert[] = []

    // Pattern Detection: Opening position that might require canceling existing orders
    if (decision.decisionType === 'POSITION_OPEN' && decision.position) {
      const { category } = decision.position

      // Pattern 1: Opening core position by potentially canceling tactical plays
      if (category === 'core') {
        warnings.push('Opening core position - ensure tactical plays remain intact')
        recommendations.push('Use available core allocation instead of canceling existing tactical orders')
        
        alerts.push({
          id: `core_position_warning_${Date.now()}`,
          type: 'warning',
          title: 'Core Position Alert',
          message: 'Opening core position. Verify this doesn\'t require canceling profitable tactical plays.',
          confidence: 0.8,
          canOverride: true,
          createdAt: new Date().toISOString()
        })
      }

      // Pattern 2: Opening tactical position by potentially reducing core holdings
      if (category === 'tactical') {
        warnings.push('Opening tactical position - maintain core holding stability')
        recommendations.push('Use tactical allocation bucket - avoid cannibalizing core positions')
      }

      // Pattern 3: Time horizon misalignment
      if (decision.position.timeHorizon) {
        const timeHorizon = decision.position.timeHorizon
        if ((category === 'core' && timeHorizon === 'short') ||
            (category === 'tactical' && timeHorizon === 'long')) {
          warnings.push('Time horizon misaligns with allocation category')
          recommendations.push('Ensure time horizon matches allocation bucket purpose')
          
          alerts.push({
            id: `time_horizon_mismatch_${Date.now()}`,
            type: 'warning',
            title: 'Time Horizon Mismatch',
            message: `${category} position with ${timeHorizon} time horizon may not align with allocation strategy.`,
            confidence: 0.7,
            canOverride: true,
            createdAt: new Date().toISOString()
          })
        }
      }
    }

    return { warnings, recommendations, alerts }
  }

  /**
   * Check behavioral rule compliance
   */
  private static async checkBehavioralRules(
    decision: DecisionInput
  ): Promise<{ alerts: IntelligenceAlert[]; recommendations: string[] }> {
    const alerts: IntelligenceAlert[] = []
    const recommendations: string[] = []

    // Rule 1: Five-day retracement rule
    if (decision.decisionType === 'POSITION_OPEN' && decision.symbol) {
      const hasRetracement = await this.checkFiveDayRetracement(decision.symbol)
      if (!hasRetracement) {
        alerts.push({
          id: `five_day_rule_${Date.now()}`,
          type: 'critical',
          title: '5-Day Retracement Rule Violation',
          message: `${decision.symbol} has not experienced a 5-day retracement. Your historical data shows 100% success when following this rule.`,
          confidence: 1.0,
          canOverride: true,
          createdAt: new Date().toISOString()
        })
        recommendations.push('Wait for 5-day retracement before entering new positions')
      }
    }

    // Rule 2: No sell-for-funding rule
    if (decision.decisionType === 'POSITION_CLOSE') {
      const recentBuys = this.getRecentBuys(decision.symbol)
      if (recentBuys.length > 0) {
        alerts.push({
          id: `no_sell_funding_${Date.now()}`,
          type: 'critical',
          title: 'Sell-to-Fund Pattern Detected',
          message: 'Selling after recent purchases suggests funding new positions with profitable holdings. This led to the XRP/MP Materials execution error.',
          confidence: 0.95,
          canOverride: true,
          createdAt: new Date().toISOString()
        })
        recommendations.push('Use available cash or war chest funds instead of selling profitable positions')
      }
    }

    return { alerts, recommendations }
  }

  /**
   * Check alignment with active catalysts
   */
  private static async checkCatalystAlignment(
    symbol: string,
    decisionType: string
  ): Promise<{ details: string[]; recommendations: string[]; alerts: IntelligenceAlert[] }> {
    const details: string[] = []
    const recommendations: string[] = []
    const alerts: IntelligenceAlert[] = []

    try {
      // Mock catalyst data - in production, this would query the Catalyst collection
      const activeCatalysts = await this.getActiveCatalysts(symbol)

      if (activeCatalysts.length > 0) {
        const catalyst = activeCatalysts[0]
        
        if (decisionType === 'POSITION_OPEN') {
          if (catalyst.score >= 8.0) {
            details.push(`Strong catalyst alignment: ${catalyst.description} (Score: ${catalyst.score})`)
            recommendations.push('High-scoring catalyst supports position opening')
            
            alerts.push({
              id: `catalyst_support_${Date.now()}`,
              type: 'opportunity',
              title: 'Strong Catalyst Support',
              message: `${catalyst.description} provides strong support for this position (Score: ${catalyst.score}/10)`,
              confidence: catalyst.probability,
              canOverride: true,
              createdAt: new Date().toISOString()
            })
          } else if (catalyst.score >= 6.0) {
            details.push(`Moderate catalyst alignment: ${catalyst.description} (Score: ${catalyst.score})`)
            recommendations.push('Monitor catalyst development closely')
          }
        } else if (decisionType === 'POSITION_CLOSE') {
          if (catalyst.score >= 8.0) {
            details.push(`Warning: Closing position despite strong catalyst (Score: ${catalyst.score})`)
            recommendations.push('Consider holding through catalyst event given high probability')
            
            alerts.push({
              id: `catalyst_conflict_${Date.now()}`,
              type: 'warning',
              title: 'Strong Catalyst Conflict',
              message: `Closing position despite strong upcoming catalyst: ${catalyst.description}`,
              confidence: catalyst.probability,
              canOverride: true,
              createdAt: new Date().toISOString()
            })
          }
        }
      } else {
        details.push('No active catalysts found for this symbol')
        recommendations.push('Consider catalyst research before position changes')
      }

    } catch (error) {
      details.push('Unable to check catalyst alignment')
    }

    return { details, recommendations, alerts }
  }

  /**
   * Generate final recommendations based on all checks
   */
  private static generateFinalRecommendations(
    result: ConsistencyResult,
    decision: DecisionInput
  ): void {
    // High contradiction score recommendations
    if (result.score >= this.HIGH_CONTRADICTION_THRESHOLD) {
      result.recommendations.unshift('CRITICAL: Implement 24-hour cooling period')
      result.recommendations.push('Review decision logic and market conditions before proceeding')
    }

    // Warning threshold recommendations
    if (result.score >= this.WARNING_THRESHOLD) {
      result.recommendations.push('Document override reasoning if proceeding')
      result.recommendations.push('Review behavioral patterns for systematic improvements')
    }

    // Low confidence decisions
    if (decision.confidence < 0.7) {
      result.recommendations.push('Low confidence decision - consider additional analysis')
    }

    // Position sizing recommendations
    if (decision.position && decision.position.size) {
      result.recommendations.push('Verify position size aligns with risk management rules')
    }
  }

  // Helper methods for data access (would be replaced with actual database queries)
  private static getRecentDecisionsFromStorage(userId?: string, cutoffTime?: Date): TradingDecision[] {
    // Mock implementation - in production, query MongoDB
    // Return sample data to demonstrate functionality
    const now = new Date()
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    
    return [
      {
        id: 'mock_decision_1',
        userId: userId || 'demo_user',
        decisionType: 'POSITION_OPEN',
        position: {
          symbol: 'XRP',
          size: 1000,
          category: 'tactical',
          timeHorizon: 'short'
        },
        capitalAllocation: {
          core: { allocated: 60000, used: 45000, available: 15000, positions: [] },
          tactical: { allocated: 25000, used: 18000, available: 7000, positions: [] },
          warChest: { allocated: 15000, used: 0, available: 15000, positions: [] },
          totalCapital: 100000
        },
        confidence: 0.85,
        timestamp: sixHoursAgo,
        reasoning: 'Momentum breakout pattern detected',
        consistencyCheck: {
          contradicts: false,
          score: 0.2,
          details: [],
          warnings: [],
          recommendations: [],
          alerts: []
        },
        status: 'EXECUTED',
        strategyName: 'momentum_breakout'
      }
    ]
  }

  private static isOppositeDecision(type1: string, type2: string): boolean {
    return (type1 === 'POSITION_OPEN' && type2 === 'POSITION_CLOSE') ||
           (type1 === 'POSITION_CLOSE' && type2 === 'POSITION_OPEN')
  }

  private static async checkFiveDayRetracement(symbol: string): Promise<boolean> {
    // Mock implementation - would check actual market data
    return Math.random() > 0.3 // 70% chance of having retracement
  }

  private static getRecentBuys(symbol?: string): any[] {
    // Mock implementation - return sample data for demo
    if (symbol === 'XRP' || symbol === 'SOL') {
      return [{
        symbol: symbol,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        quantity: 500
      }]
    }
    return []
  }

  private static async getActiveCatalysts(symbol: string): Promise<any[]> {
    // Mock catalyst data - comprehensive set for demo
    const mockCatalysts = [
      {
        symbol: 'SOL',
        description: 'ETF approval decision expected',
        score: 8.5,
        probability: 0.75,
        timeHorizon: '2 days'
      },
      {
        symbol: 'XRP',
        description: 'Regulatory clarity announcement pending',
        score: 7.2,
        probability: 0.65,
        timeHorizon: '1 week'
      },
      {
        symbol: 'AAPL',
        description: 'iPhone 16 launch event scheduled',
        score: 7.8,
        probability: 0.85,
        timeHorizon: '3 days'
      },
      {
        symbol: 'TSLA',
        description: 'Q4 delivery numbers release',
        score: 8.1,
        probability: 0.90,
        timeHorizon: '5 days'
      },
      {
        symbol: 'NVDA',
        description: 'AI chip announcement at CES',
        score: 9.2,
        probability: 0.80,
        timeHorizon: '1 week'
      },
      {
        symbol: 'BTC',
        description: 'Halving event approaching',
        score: 8.8,
        probability: 0.95,
        timeHorizon: '30 days'
      }
    ]
    
    return mockCatalysts.filter(c => c.symbol === symbol)
  }
}

export default ConsistencyChecker