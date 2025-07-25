/**
 * GRITMAW V2 - PERSONA ENGINE
 * Intelligent edge selection and configuration based on active trading personas
 * Clean architecture implementation without technical debt
 */

import { 
  TradePersona, 
  BehavioralEdge, 
  EdgeCluster, 
  MarketCondition,
  IntelligenceAlert 
} from '@/types/core';

export interface OpportunityScore {
  symbol: string;
  assetClass: string;
  marketConditions: MarketCondition[];
  volatility: number;
  volume: number;
  priceMovement: number;
  sentiment: number;
}

export interface PersonaCompatibilityResult {
  personaId: string;
  compatibilityScore: number;
  recommendedEdges: string[];
  recommendedClusters: string[];
  positionSizing: number;
  riskAdjustment: number;
}

export interface EdgeSelectionResult {
  selectedEdges: BehavioralEdge[];
  selectedClusters: EdgeCluster[];
  totalEffectivenessScore: number;
  riskAdjustedScore: number;
  implementationComplexity: number;
}

export interface PersonaConfiguration {
  activePersona: string;
  secondaryPersonas: string[];
  allocationWeights: { [personaId: string]: number };
  autoSwitch: boolean;
  switchThreshold: number;
}

interface PersonaPerformanceMetrics {
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  volatility: number;
  consecutiveLosses: number;
  lastUpdated: Date;
}

export class PersonaEngine {
  private activePersonas: Map<string, TradePersona> = new Map();
  private personaPerformance: Map<string, PersonaPerformanceMetrics> = new Map();

  /**
   * Calculate persona compatibility for a trading opportunity
   */
  calculatePersonaCompatibility(
    opportunity: OpportunityScore,
    persona: TradePersona,
    availableEdges: BehavioralEdge[]
  ): PersonaCompatibilityResult {
    
    // 1. Market condition alignment
    const conditionScore = this.calculateMarketConditionScore(
      opportunity.marketConditions, 
      persona.marketConditionPreference
    );
    
    // 2. Volatility comfort assessment
    const volatilityScore = this.calculateVolatilityScore(
      opportunity.volatility, 
      persona.volatilityComfort
    );
    
    // 3. Risk tolerance evaluation
    const riskScore = this.calculateRiskScore(
      opportunity.priceMovement, 
      persona.riskTolerance
    );
    
    // 4. Edge affinity calculation
    const edgeAffinityScore = this.calculateEdgeAffinityScore(
      availableEdges, 
      persona.behavioralEdgeAffinity
    );
    
    const compatibilityScore = (
      conditionScore * 0.3 +
      volatilityScore * 0.25 +
      riskScore * 0.25 +
      edgeAffinityScore * 0.2
    );
    
    // Select edges based on persona affinity and market conditions
    const recommendedEdges = this.selectEdgesForPersona(
      availableEdges, 
      persona, 
      opportunity.marketConditions
    );
    
    // Calculate position sizing based on persona parameters
    const positionSizing = this.calculatePersonaPositionSize(
      opportunity, 
      persona, 
      compatibilityScore
    );
    
    return {
      personaId: persona.id,
      compatibilityScore,
      recommendedEdges: recommendedEdges.map(edge => edge.id),
      recommendedClusters: [],
      positionSizing,
      riskAdjustment: compatibilityScore * persona.riskTolerance
    };
  }
  
  /**
   * Select optimal edge combination for given market conditions and persona
   */
  selectOptimalEdges(
    availableEdges: BehavioralEdge[],
    edgeClusters: EdgeCluster[],
    marketConditions: MarketCondition[],
    persona: TradePersona,
    maxEdges: number = 4
  ): EdgeSelectionResult {
    
    // Filter edges by persona compatibility
    const compatibleEdges = availableEdges.filter(edge => {
      const personaScore = edge.personaCompatibility[persona.id] || 0;
      return personaScore >= 0.5;
    });
    
    // Filter clusters by market conditions and persona
    const compatibleClusters = edgeClusters.filter(cluster => {
      const personaScore = cluster.personaCompatibility[persona.id] || 0;
      const conditionMatch = cluster.requiredMarketConditions.some(
        condition => marketConditions.includes(condition)
      );
      return personaScore >= 0.6 && conditionMatch;
    });
    
    // Score edges based on current market conditions
    const scoredEdges = compatibleEdges.map(edge => ({
      edge,
      score: this.scoreEdgeForConditions(edge, marketConditions, persona)
    })).sort((a, b) => b.score - a.score);
    
    // Remove conflicting edges
    const selectedEdges = this.removeConflictingEdges(
      scoredEdges.slice(0, maxEdges).map(item => item.edge)
    );
    
    // Select best clusters that don't conflict
    const selectedClusters = this.selectNonConflictingClusters(
      compatibleClusters,
      selectedEdges
    );
    
    // Calculate total effectiveness with synergistic effects
    const totalEffectivenessScore = this.calculateTotalEffectiveness(
      selectedEdges,
      selectedClusters,
      marketConditions
    );
    
    const implementationComplexity = selectedEdges.reduce(
      (sum, edge) => sum + edge.complexity, 0
    ) / selectedEdges.length;
    
    return {
      selectedEdges,
      selectedClusters,
      totalEffectivenessScore,
      riskAdjustedScore: totalEffectivenessScore * persona.riskTolerance,
      implementationComplexity
    };
  }
  
  /**
   * Generate intelligence alerts based on persona analysis
   */
  generatePersonaAlerts(
    persona: TradePersona,
    compatibilityResult: PersonaCompatibilityResult,
    opportunity: OpportunityScore
  ): IntelligenceAlert[] {
    const alerts: IntelligenceAlert[] = [];
    
    // Low compatibility warning
    if (compatibilityResult.compatibilityScore < 0.4) {
      alerts.push({
        id: `persona_low_compat_${Date.now()}`,
        type: 'warning',
        title: 'Low Persona Compatibility',
        message: `${opportunity.symbol} has low compatibility (${(compatibilityResult.compatibilityScore * 100).toFixed(0)}%) with ${persona.name} persona. Consider alternative approaches.`,
        confidence: 0.85,
        canOverride: true,
        createdAt: new Date().toISOString()
      });
    }
    
    // High opportunity alert
    if (compatibilityResult.compatibilityScore > 0.8) {
      alerts.push({
        id: `persona_high_compat_${Date.now()}`,
        type: 'opportunity',
        title: 'High Persona Alignment',
        message: `${opportunity.symbol} shows excellent alignment with ${persona.name} persona. Recommended position size: ${(compatibilityResult.positionSizing * 100).toFixed(1)}%`,
        confidence: 0.9,
        canOverride: false,
        createdAt: new Date().toISOString()
      });
    }
    
    // Market condition mismatch
    const conditionMismatch = opportunity.marketConditions.filter(
      condition => !persona.marketConditionPreference.includes(condition)
    );
    
    if (conditionMismatch.length > 0) {
      alerts.push({
        id: `persona_market_mismatch_${Date.now()}`,
        type: 'info',
        title: 'Market Condition Mismatch',
        message: `Current conditions (${conditionMismatch.join(', ')}) differ from ${persona.name} preferred conditions.`,
        confidence: 0.7,
        canOverride: true,
        createdAt: new Date().toISOString()
      });
    }
    
    return alerts;
  }
  
  /**
   * Manage multi-persona portfolio allocation
   */
  calculateMultiPersonaAllocation(
    opportunity: OpportunityScore,
    personaConfig: PersonaConfiguration,
    availablePersonas: TradePersona[],
    availableEdges: BehavioralEdge[]
  ): { [personaId: string]: PersonaCompatibilityResult } {
    
    const results: { [personaId: string]: PersonaCompatibilityResult } = {};
    
    // Calculate compatibility for primary persona
    const primaryPersona = availablePersonas.find(
      p => p.id === personaConfig.activePersona
    );
    
    if (primaryPersona) {
      results[primaryPersona.id] = this.calculatePersonaCompatibility(
        opportunity,
        primaryPersona,
        availableEdges
      );
    }
    
    // Calculate for secondary personas
    personaConfig.secondaryPersonas.forEach(personaId => {
      const persona = availablePersonas.find(p => p.id === personaId);
      if (persona) {
        results[personaId] = this.calculatePersonaCompatibility(
          opportunity,
          persona,
          availableEdges
        );
      }
    });
    
    return results;
  }
  
  /**
   * Adapt persona based on performance feedback
   */
  adaptPersonaFromPerformance(
    persona: TradePersona,
    recentPerformance: PersonaPerformanceMetrics
  ): TradePersona {
    
    const adaptedPersona = { ...persona };
    
    // Reduce risk tolerance after consecutive losses
    if (recentPerformance.consecutiveLosses >= 3) {
      adaptedPersona.riskTolerance = Math.max(
        0.1, 
        persona.riskTolerance * 0.8
      );
      adaptedPersona.maxPositionSize = Math.max(
        0.02,
        persona.maxPositionSize * 0.8
      );
    }
    
    // Increase confidence after strong performance
    if (recentPerformance.winRate > 0.7 && recentPerformance.avgReturn > 0.1) {
      adaptedPersona.riskTolerance = Math.min(
        1.0,
        persona.riskTolerance * 1.1
      );
      adaptedPersona.maxPositionSize = Math.min(
        0.5,
        persona.maxPositionSize * 1.1
      );
    }
    
    // Adjust volatility comfort based on realized volatility
    if (recentPerformance.volatility > persona.volatilityComfort * 1.5) {
      adaptedPersona.volatilityComfort = Math.max(
        0.1,
        persona.volatilityComfort * 0.9
      );
    }
    
    return adaptedPersona;
  }
  
  /**
   * Suggest persona switch based on market conditions
   */
  suggestPersonaSwitch(
    currentPersona: TradePersona,
    marketConditions: MarketCondition[],
    availablePersonas: TradePersona[]
  ): { suggestedPersona: TradePersona | null; reasoning: string } {
    
    // Score all personas for current conditions
    const personaScores = availablePersonas.map(persona => {
      const conditionMatch = persona.marketConditionPreference.filter(
        pref => marketConditions.includes(pref)
      ).length;
      
      const score = conditionMatch / Math.max(
        persona.marketConditionPreference.length,
        marketConditions.length
      );
      
      return { persona, score };
    });
    
    // Find best matching persona
    const bestMatch = personaScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    // Only suggest switch if significantly better
    const currentScore = personaScores.find(
      ps => ps.persona.id === currentPersona.id
    )?.score || 0;
    
    if (bestMatch.score > currentScore + 0.3 && bestMatch.persona.id !== currentPersona.id) {
      return {
        suggestedPersona: bestMatch.persona,
        reasoning: `${bestMatch.persona.name} better suited for current ${marketConditions.join(', ')} conditions (${(bestMatch.score * 100).toFixed(0)}% match vs ${(currentScore * 100).toFixed(0)}%)`
      };
    }
    
    return {
      suggestedPersona: null,
      reasoning: 'Current persona remains optimal for market conditions'
    };
  }
  
  // === PRIVATE HELPER METHODS ===
  
  private calculateMarketConditionScore(
    currentConditions: MarketCondition[],
    preferredConditions: MarketCondition[]
  ): number {
    if (preferredConditions.length === 0) return 0.5;
    
    const matches = currentConditions.filter(condition => 
      preferredConditions.includes(condition)
    ).length;
    
    return Math.min(1.0, matches / preferredConditions.length);
  }
  
  private calculateVolatilityScore(
    currentVolatility: number,
    volatilityComfort: number
  ): number {
    const normalizedVolatility = Math.min(1.0, currentVolatility / 0.5);
    const difference = Math.abs(normalizedVolatility - volatilityComfort);
    return Math.max(0, 1 - difference);
  }
  
  private calculateRiskScore(
    priceMovement: number,
    riskTolerance: number
  ): number {
    const normalizedMovement = Math.min(1.0, Math.abs(priceMovement) / 0.2);
    return normalizedMovement <= riskTolerance ? 1.0 : riskTolerance / normalizedMovement;
  }
  
  private calculateEdgeAffinityScore(
    availableEdges: BehavioralEdge[],
    edgeAffinity: { [edgeId: string]: number }
  ): number {
    const scores = availableEdges
      .map(edge => edgeAffinity[edge.id] || 0)
      .filter(score => score > 0);
    
    return scores.length > 0 
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
  }
  
  private selectEdgesForPersona(
    availableEdges: BehavioralEdge[],
    persona: TradePersona,
    marketConditions: MarketCondition[]
  ): BehavioralEdge[] {
    return availableEdges
      .filter(edge => {
        const personaScore = edge.personaCompatibility[persona.id] || 0;
        const hasEffectiveCondition = marketConditions.some(
          condition => (edge.effectiveness[condition] || 0) > 0.5
        );
        return personaScore >= 0.6 && hasEffectiveCondition;
      })
      .sort((a, b) => {
        const aScore = (a.personaCompatibility[persona.id] || 0);
        const bScore = (b.personaCompatibility[persona.id] || 0);
        return bScore - aScore;
      })
      .slice(0, 4);
  }
  
  private calculatePersonaPositionSize(
    opportunity: OpportunityScore,
    persona: TradePersona,
    compatibilityScore: number
  ): number {
    const baseSize = persona.maxPositionSize;
    const volatilityAdjustment = Math.max(0.1, 1 - opportunity.volatility);
    const confidenceAdjustment = compatibilityScore;
    
    return baseSize * volatilityAdjustment * confidenceAdjustment;
  }
  
  private scoreEdgeForConditions(
    edge: BehavioralEdge,
    marketConditions: MarketCondition[],
    persona: TradePersona
  ): number {
    const personaScore = edge.personaCompatibility[persona.id] || 0;
    const conditionScores = marketConditions.map(
      condition => edge.effectiveness[condition] || 0
    );
    const avgConditionScore = conditionScores.length > 0 
      ? conditionScores.reduce((sum, score) => sum + score, 0) / conditionScores.length
      : 0;
    
    return (personaScore * 0.6) + (avgConditionScore * 0.4);
  }
  
  private removeConflictingEdges(edges: BehavioralEdge[]): BehavioralEdge[] {
    const selected: BehavioralEdge[] = [];
    const conflictIds = new Set<string>();
    
    for (const edge of edges) {
      if (!conflictIds.has(edge.id)) {
        selected.push(edge);
        edge.conflictsWith.forEach(id => conflictIds.add(id));
      }
    }
    
    return selected;
  }
  
  private selectNonConflictingClusters(
    clusters: EdgeCluster[],
    selectedEdges: BehavioralEdge[]
  ): EdgeCluster[] {
    const edgeIds = new Set(selectedEdges.map(edge => edge.id));
    
    return clusters.filter(cluster => {
      const hasConflict = cluster.conflictingEdges.some(
        edgeId => edgeIds.has(edgeId)
      );
      const hasPrimaryEdge = edgeIds.has(cluster.primaryEdge);
      return !hasConflict && hasPrimaryEdge;
    });
  }
  
  private calculateTotalEffectiveness(
    edges: BehavioralEdge[],
    clusters: EdgeCluster[],
    marketConditions: MarketCondition[]
  ): number {
    // Base effectiveness from individual edges
    const baseEffectiveness = edges.reduce((sum, edge) => {
      const conditionScores = marketConditions.map(
        condition => edge.effectiveness[condition] || 0
      );
      const avgScore = conditionScores.length > 0 
        ? conditionScores.reduce((s, score) => s + score, 0) / conditionScores.length
        : 0;
      return sum + avgScore;
    }, 0) / edges.length;
    
    // Apply cluster synergistic multipliers
    const clusterMultiplier = clusters.reduce((product, cluster) => {
      return product * cluster.synergisticMultiplier;
    }, 1.0);
    
    return baseEffectiveness * clusterMultiplier;
  }
}

// Singleton instance for application-wide use
export const personaEngine = new PersonaEngine();