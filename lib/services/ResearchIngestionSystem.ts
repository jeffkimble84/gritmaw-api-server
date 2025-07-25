/**
 * GRITMAW V2 - RESEARCH INGESTION SYSTEM
 * Automated research completion, edge generation, and queue management
 * Clean architecture implementation
 */

import { ResearchCategory, BehavioralEdge as CoreBehavioralEdge } from '@/types/core';
import { claudeService, BiasHypothesis } from './ClaudeService';
import { ResearchSession, BehavioralEdge as DBBehavioralEdge } from '@/lib/database/models';

export interface ResearchReport {
  id: string;
  title: string;
  category: ResearchCategory;
  hypothesis: string;
  methodology: string;
  findings: ResearchFindings;
  confidence: number; // 0-1
  expectedReturns: number; // Annualized percentage
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
  dataQuality: number; // 0-1
  createdAt: Date;
  completedAt?: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';
}

export interface ResearchFindings {
  summary: string;
  keyInsights: string[];
  statisticalSignificance: number;
  backtestResults?: BacktestResults;
  marketConditions: string[];
  applicability: ApplicabilityScore;
  limitations: string[];
  recommendations: string[];
}

export interface BacktestResults {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgTradeDuration: number;
  marketBeatenPercentage: number;
  consistency: number; // 0-1
  robustness: number; // 0-1
}

export interface ApplicabilityScore {
  stocks: number; // 0-1
  crypto: number; // 0-1
  forex: number; // 0-1
  options: number; // 0-1
  futures: number; // 0-1
}

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-1
  issues: ValidationIssue[];
  recommendations: string[];
}

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  category: 'STATISTICAL' | 'IMPLEMENTATION' | 'RISK' | 'OPERATIONAL';
  message: string;
  suggestion?: string;
}

export interface EdgeImplementation {
  edgeId: string;
  codeGenerated: string;
  testSuite: TestSuite;
  deploymentScript: string;
  monitoringConfig: MonitoringConfig;
  rollbackPlan: string;
  estimatedImpact: ImpactEstimate;
}

export interface TestSuite {
  unitTests: Test[];
  integrationTests: Test[];
  performanceTests: Test[];
  edgeCaseTests: Test[];
  backtestValidation: BacktestResults;
}

export interface Test {
  name: string;
  type: 'UNIT' | 'INTEGRATION' | 'PERFORMANCE' | 'EDGE_CASE';
  code: string;
  expectedOutcome: any;
  timeout: number;
}

export interface MonitoringConfig {
  metrics: string[];
  alertThresholds: { [metric: string]: number };
  reportingFrequency: 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'WEEKLY';
  dashboardConfig: any;
}

export interface ImpactEstimate {
  revenueIncrease: number; // Annual $ impact
  riskReduction: number; // Risk-adjusted improvement
  implementationCost: number; // Development cost
  maintenanceCost: number; // Annual maintenance
  roi: number; // Return on investment
  paybackPeriod: number; // Months to break even
}

export class ResearchIngestionSystem {
  private activeResearch: Map<string, ResearchReport> = new Map();
  private completedResearch: ResearchReport[] = [];
  private deployedEdges: Map<string, CoreBehavioralEdge> = new Map();
  private researchQueue: BiasHypothesis[] = [];

  /**
   * Start a new research project
   */
  async startResearch(bias: BiasHypothesis, userId?: string): Promise<ResearchReport> {
    const research: ResearchReport = {
      id: `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: bias.title,
      category: bias.category,
      hypothesis: bias.description,
      methodology: 'AI-powered behavioral analysis with statistical validation',
      findings: {
        summary: '',
        keyInsights: [],
        statisticalSignificance: 0,
        marketConditions: [],
        applicability: {
          stocks: 0,
          crypto: 0,
          forex: 0,
          options: 0,
          futures: 0
        },
        limitations: [],
        recommendations: []
      },
      confidence: 0,
      expectedReturns: bias.expectedReturns,
      riskLevel: this.calculateRiskLevel(bias),
      timeframe: '30 days',
      dataQuality: bias.dataAvailability,
      createdAt: new Date(),
      status: 'PENDING'
    };

    this.activeResearch.set(research.id, research);

    // Create database record
    try {
      const session = new ResearchSession({
        sessionId: research.id,
        userId: userId,
        researchType: 'BIAS_DISCOVERY',
        hypothesis: research.hypothesis,
        status: 'PLANNING',
        parameters: {
          timeHorizon: research.timeframe,
          marketConditions: [],
          dataSources: ['market_data', 'academic_research', 'historical_patterns'],
          confidenceThreshold: 0.8
        }
      });
      
      await session.save();
    } catch (error) {
      console.error('Failed to save research session:', error);
    }

    return research;
  }

  /**
   * Complete a research project and validate findings
   */
  async completeResearch(researchId: string, findings: ResearchFindings): Promise<ValidationResult> {
    const research = this.activeResearch.get(researchId);
    if (!research) {
      throw new Error(`Research ${researchId} not found`);
    }

    // Update research with findings
    research.findings = findings;
    research.completedAt = new Date();
    research.status = 'COMPLETED';

    // Validate findings
    const validation = this.validateFindings(research);
    
    if (validation.isValid) {
      this.completedResearch.push(research);
      this.activeResearch.delete(researchId);
      
      // Update database record
      try {
        const session = await ResearchSession.findOne({ sessionId: researchId });
        if (session) {
          session.status = 'COMPLETED';
          session.completedAt = new Date();
          session.findings = {
            summary: findings.summary,
            keyInsights: findings.keyInsights,
            statisticalSignificance: findings.statisticalSignificance,
            confidenceLevel: research.confidence,
            expectedReturns: research.expectedReturns,
            riskAssessment: research.riskLevel,
            implementationComplexity: 'MEDIUM' as const
          };
          await session.save();
        }
      } catch (error) {
        console.error('Failed to update research session:', error);
      }
    }

    return validation;
  }

  /**
   * Categorize completed research into actionable edges
   */
  categorizeEdge(research: ResearchReport): 'RULE' | 'GUIDELINE' | 'ARCHIVED' {
    const { confidence, expectedReturns, findings } = research;
    
    // High confidence + high returns = Implementable Rule
    if (confidence >= 0.8 && expectedReturns >= 10 && findings.statisticalSignificance >= 0.95) {
      return 'RULE';
    }
    
    // Medium confidence or returns = Guideline for manual consideration
    if (confidence >= 0.6 && expectedReturns >= 5 && findings.statisticalSignificance >= 0.85) {
      return 'GUIDELINE';
    }
    
    // Low confidence or returns = Archive for future reference
    return 'ARCHIVED';
  }

  /**
   * Convert research into behavioral edge
   */
  async createBehavioralEdge(research: ResearchReport): Promise<CoreBehavioralEdge> {
    const edgeCategory = this.categorizeEdge(research);
    
    const edge: CoreBehavioralEdge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: research.title,
      description: research.findings.summary,
      category: 'POSITIONING', // Default, could be refined based on research
      confidence: research.confidence,
      expectedImprovement: research.expectedReturns / 100, // Convert to decimal
      implementationComplexity: this.determineComplexity(research),
      triggerConditions: this.generateTriggerConditions(research),
      actions: this.generateEdgeActions(research),
      personaCompatibility: this.calculatePersonaCompatibility(research),
      effectiveness: this.calculateMarketEffectiveness(research),
      conflictsWith: [],
      complexity: research.findings.statisticalSignificance * 10 // 0-10 scale
    };

    // Save to database
    try {
      const dbEdge = new DBBehavioralEdge({
        edgeId: edge.id,
        name: edge.name,
        type: edgeCategory,
        description: edge.description,
        hypothesis: research.hypothesis,
        academicEvidence: research.findings.recommendations,
        successRate: research.confidence,
        expectedImpact: `${research.expectedReturns}% annualized`,
        implementationGuidance: research.findings.recommendations.join('; '),
        applicabilityConditions: research.findings.marketConditions,
        researchStatus: 'TESTING'
      });
      
      await dbEdge.save();
    } catch (error) {
      console.error('Failed to save behavioral edge:', error);
    }

    this.deployedEdges.set(edge.id, edge);
    return edge;
  }

  /**
   * Update research queue when items are completed
   */
  updateQueue(completedBiasId: string): { queueSize: number; replenishmentNeeded: boolean } {
    // Remove completed bias from queue
    this.researchQueue = this.researchQueue.filter(bias => bias.id !== completedBiasId);
    
    const queueSize = this.researchQueue.length;
    const minQueueSize = 10;
    
    return {
      queueSize,
      replenishmentNeeded: queueSize < minQueueSize
    };
  }

  /**
   * Detect when queue is running low
   */
  detectLowQueue(minSize: number = 10): boolean {
    return this.researchQueue.length < minSize;
  }

  /**
   * AI-powered discovery of new bias hypotheses using Claude AI
   */
  async discoverNewBiases(): Promise<BiasHypothesis[]> {
    try {
      console.log('🤖 Using Claude AI for bias discovery...');
      
      const discoveryResult = await claudeService.discoverBiases(
        'Focus on institutional trading patterns and retail investor behavioral anomalies'
      );
      
      console.log(`✅ Claude AI discovered ${discoveryResult.biases.length} behavioral biases`);
      
      return discoveryResult.biases;
      
    } catch (error) {
      console.error('❌ Bias discovery failed:', error);
      return [];
    }
  }

  /**
   * Prioritize discovered biases based on potential and feasibility
   */
  prioritizeBiases(biases: BiasHypothesis[]): BiasHypothesis[] {
    return biases.sort((a, b) => {
      // Calculate priority score
      const scoreA = this.calculatePriorityScore(a);
      const scoreB = this.calculatePriorityScore(b);
      return scoreB - scoreA; // Descending order
    });
  }

  /**
   * Replenish research queue with new hypotheses
   */
  async replenishQueue(targetSize: number = 15): Promise<{ added: number; totalSize: number }> {
    const currentSize = this.researchQueue.length;
    const needed = Math.max(0, targetSize - currentSize);
    
    if (needed === 0) {
      return { added: 0, totalSize: currentSize };
    }

    // Discover new biases
    const newBiases = await this.discoverNewBiases();
    const prioritizedBiases = this.prioritizeBiases(newBiases);
    
    // Add top biases to queue
    const biasesToAdd = prioritizedBiases.slice(0, needed);
    this.researchQueue.push(...biasesToAdd);
    
    return {
      added: biasesToAdd.length,
      totalSize: this.researchQueue.length
    };
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueSize: number;
    activeResearch: number;
    completedResearch: number;
    deployedEdges: number;
    topBiases: BiasHypothesis[];
  } {
    return {
      queueSize: this.researchQueue.length,
      activeResearch: this.activeResearch.size,
      completedResearch: this.completedResearch.length,
      deployedEdges: this.deployedEdges.size,
      topBiases: this.researchQueue.slice(0, 5)
    };
  }

  // Private helper methods
  private validateFindings(research: ResearchReport): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    // Statistical validation
    if (research.findings.statisticalSignificance < 0.95) {
      issues.push({
        severity: 'WARNING',
        category: 'STATISTICAL',
        message: 'Statistical significance below 95%',
        suggestion: 'Consider gathering more data or refining methodology'
      });
      score -= 0.1;
    }

    // Confidence validation
    if (research.confidence < 0.7) {
      issues.push({
        severity: 'WARNING',
        category: 'STATISTICAL',
        message: 'Low confidence in findings',
        suggestion: 'Additional validation recommended before implementation'
      });
      score -= 0.15;
    }

    // Implementation feasibility
    if (!research.findings.backtestResults) {
      issues.push({
        severity: 'ERROR',
        category: 'IMPLEMENTATION',
        message: 'Missing backtest results',
        suggestion: 'Complete backtesting before proceeding'
      });
      score -= 0.3;
    }

    return {
      isValid: issues.filter(i => i.severity === 'ERROR').length === 0,
      score: Math.max(0, score),
      issues,
      recommendations: this.generateRecommendations(research, issues)
    };
  }

  private calculatePriorityScore(bias: BiasHypothesis): number {
    const weights = {
      expectedReturns: 0.3,
      marketRelevance: 0.25,
      dataAvailability: 0.2,
      uniqueness: 0.15,
      commercialPotential: 0.1
    };

    return (
      (bias.expectedReturns / 100) * weights.expectedReturns +
      bias.marketRelevance * weights.marketRelevance +
      bias.dataAvailability * weights.dataAvailability +
      bias.uniqueness * weights.uniqueness +
      bias.commercialPotential * weights.commercialPotential
    );
  }

  private calculateRiskLevel(bias: BiasHypothesis): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (bias.researchComplexity > 7 || bias.dataAvailability < 0.5) return 'HIGH';
    if (bias.researchComplexity > 4 || bias.dataAvailability < 0.7) return 'MEDIUM';
    return 'LOW';
  }

  private determineComplexity(research: ResearchReport): 'LOW' | 'MEDIUM' | 'HIGH' {
    const avgApplicability = Object.values(research.findings.applicability).reduce((a, b) => a + b, 0) / 5;
    if (avgApplicability < 0.3) return 'HIGH';
    if (avgApplicability < 0.6) return 'MEDIUM';
    return 'LOW';
  }

  private generateTriggerConditions(research: ResearchReport): any[] {
    // Generate trigger conditions based on research findings
    return research.findings.marketConditions.map(condition => ({
      type: 'MARKET_CONDITION',
      parameter: condition,
      operator: 'EQ',
      value: true,
      weight: 0.8
    }));
  }

  private generateEdgeActions(research: ResearchReport): any[] {
    // Generate actions based on research recommendations
    return [{
      type: 'ADJUST_PRICE',
      parameters: { adjustment: 0.002 }, // 0.2% price improvement
      priority: 1
    }];
  }

  private calculatePersonaCompatibility(research: ResearchReport): { [personaId: string]: number } {
    // Default compatibility scores
    return {
      'conservative': research.riskLevel === 'LOW' ? 0.8 : 0.4,
      'balanced': 0.7,
      'aggressive': research.expectedReturns > 15 ? 0.9 : 0.6
    };
  }

  private calculateMarketEffectiveness(research: ResearchReport): { [condition: string]: number } {
    const effectiveness: { [condition: string]: number } = {};
    research.findings.marketConditions.forEach(condition => {
      effectiveness[condition] = research.confidence;
    });
    return effectiveness;
  }

  private generateRecommendations(research: ResearchReport, issues: ValidationIssue[]): string[] {
    const recommendations: string[] = [];
    
    if (research.confidence < 0.8) {
      recommendations.push("Consider additional data collection to improve confidence");
    }
    
    if (research.expectedReturns < 5) {
      recommendations.push("Expected returns may not justify implementation costs");
    }

    if (issues.some(i => i.category === 'STATISTICAL')) {
      recommendations.push("Strengthen statistical validation before deployment");
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const researchIngestionSystem = new ResearchIngestionSystem();