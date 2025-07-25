import { 
  ResearchContextModel,
  ResearchPatternModel,
  type IResearchContext,
  type IResearchPattern
} from '@/lib/database/models';
import type { IPatternApplication } from '@/lib/database/models/ResearchContext';
import { PatternClusteringEngine } from './PatternClusteringEngine';
import { EventEmitter } from 'events';

interface ContextUpdate {
  marketConditions?: any[];
  activePatterns?: string[];
  globalFactors?: Map<string, any>;
  anomalyFlags?: string[];
}

interface ContextRecommendation {
  type: 'pattern' | 'cluster' | 'adjustment';
  id: string;
  reason: string;
  confidence: number;
}

export class ResearchContextService extends EventEmitter {
  private static instance: ResearchContextService;
  private clusteringEngine: PatternClusteringEngine;
  private activeContexts: Map<string, IResearchContext> = new Map();
  private snapshotInterval: number = 3600000; // 1 hour default
  private snapshotTimers: Map<string, any> = new Map();

  private constructor() {
    super();
    this.clusteringEngine = PatternClusteringEngine.getInstance();
    this.setupEventListeners();
  }

  static getInstance(): ResearchContextService {
    if (!ResearchContextService.instance) {
      ResearchContextService.instance = new ResearchContextService();
    }
    return ResearchContextService.instance;
  }

  /**
   * Create or retrieve context for a session
   */
  async getOrCreateContext(
    userId: string,
    sessionId: string
  ): Promise<IResearchContext> {
    const contextId = `${userId}-${sessionId}`;
    
    // Check cache first
    const cached = this.activeContexts.get(contextId);
    if (cached) {
      return cached;
    }

    // Check database
    let context = await ResearchContextModel.findOne({ contextId });
    
    if (!context) {
      // Create new context
      context = new ResearchContextModel({
        contextId,
        sessionId,
        userId,
        currentState: {
          snapshot: {
            timestamp: new Date(),
            marketConditions: [],
            activePatterns: [],
            globalFactors: new Map(),
            anomalyFlags: []
          },
          activeClusters: [],
          confidence: new Map(),
          recommendations: []
        },
        history: {
          snapshots: [],
          patternApplications: [],
          performanceMetrics: {
            successRate: 0,
            avgImpact: 0,
            learningProgress: 0
          }
        },
        learning: {
          contextualFactors: [],
          patternEffectiveness: new Map(),
          adaptationRules: []
        },
        integration: {
          connectedSystems: ['gritmaw-core'],
          dataStreams: [],
          outputChannels: []
        },
        metadata: {
          environment: process.env.NODE_ENV as any || 'development',
          version: '1.0.0',
          tags: [],
          debugMode: process.env.NODE_ENV === 'development',
          retentionPolicy: {
            historyDays: 90,
            snapshotInterval: this.snapshotInterval / 1000
          }
        }
      });
      
      await context.save();
      console.log(`📝 Created new research context: ${contextId}`);
    }

    // Cache and start snapshot timer
    this.activeContexts.set(contextId, context);
    this.startSnapshotTimer(contextId);

    return context;
  }

  /**
   * Update context with new information
   */
  async updateContext(
    contextId: string,
    update: ContextUpdate
  ): Promise<IResearchContext> {
    const context = await this.getContextById(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }

    // Update current state
    if (update.marketConditions) {
      context.currentState.snapshot.marketConditions = update.marketConditions;
    }
    
    if (update.activePatterns) {
      context.currentState.snapshot.activePatterns = update.activePatterns;
    }
    
    if (update.globalFactors) {
      context.currentState.snapshot.globalFactors = update.globalFactors;
    }
    
    if (update.anomalyFlags) {
      context.currentState.snapshot.anomalyFlags = update.anomalyFlags;
    }

    context.currentState.snapshot.timestamp = new Date();
    context.lastActivity = new Date();

    // Get pattern recommendations based on new context
    const recommendations = await this.generateRecommendations(context);
    context.currentState.recommendations = recommendations;

    await context.save();
    
    // Emit update event
    this.emit('contextUpdated', {
      contextId,
      timestamp: new Date(),
      recommendations
    });

    return context;
  }

  /**
   * Apply a pattern and track it
   */
  async applyPattern(
    contextId: string,
    patternId: string,
    confidence: number,
    parameters: Map<string, any>
  ): Promise<void> {
    const context = await this.getContextById(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }

    // Apply pattern and track
    await context.applyPattern(patternId, confidence, parameters);

    // Update active patterns
    if (!context.currentState.snapshot.activePatterns.includes(patternId)) {
      context.currentState.snapshot.activePatterns.push(patternId);
    }

    // Update pattern effectiveness tracking
    await this.updatePatternTracking(context, patternId);

    console.log(`✅ Applied pattern ${patternId} in context ${contextId}`);
  }

  /**
   * Record outcome of a pattern application
   */
  async recordPatternOutcome(
    contextId: string,
    patternId: string,
    success: boolean,
    impact: number,
    notes?: string
  ): Promise<void> {
    const context = await this.getContextById(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }

    // Record outcome
    await context.recordOutcome(patternId, success, impact, notes);

    // Update learning metrics
    await this.updateLearningFromOutcome(context, patternId, success, impact);

    // Check for adaptation opportunities
    await this.checkAdaptationOpportunities(context, patternId);

    console.log(`📊 Recorded outcome for pattern ${patternId}: ${success ? 'SUCCESS' : 'FAILURE'}`);
  }

  /**
   * Generate pattern recommendations based on current context
   */
  private async generateRecommendations(
    context: IResearchContext
  ): Promise<ContextRecommendation[]> {
    const recommendations: ContextRecommendation[] = [];

    // Get recommendations from clustering engine
    const patternApps = await this.clusteringEngine.recommendPatterns(
      context.currentState.snapshot
    );

    // Convert to context recommendations
    for (const app of patternApps) {
      const pattern = await ResearchPatternModel.findOne({ 
        patternId: app.patternId 
      });

      if (pattern) {
        recommendations.push({
          type: 'pattern',
          id: app.patternId,
          reason: this.generateReasoningText(pattern, context, app.confidence),
          confidence: app.confidence
        });
      }
    }

    // Apply context-specific filtering
    const filtered = await this.filterByContextHistory(recommendations, context);

    return filtered.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoningText(
    pattern: IResearchPattern,
    context: IResearchContext,
    confidence: number
  ): string {
    const marketCondition = context.currentState.snapshot.marketConditions[0];
    const historicalPerf = context.learning.patternEffectiveness.get(pattern.patternId);

    let reasoning = `Pattern "${pattern.pattern.name}" shows ${(confidence * 100).toFixed(0)}% confidence`;

    if (marketCondition) {
      reasoning += ` given ${marketCondition.metric} is ${marketCondition.trend}`;
    }

    if (historicalPerf && historicalPerf.applications > 0) {
      reasoning += ` (${(historicalPerf.successRate * 100).toFixed(0)}% historical success rate)`;
    }

    return reasoning;
  }

  /**
   * Generate suggested action text
   */
  private generateActionText(pattern: IResearchPattern): string {
    const primaryTrigger = pattern.parameters.triggers[0];
    
    if (!primaryTrigger) {
      return `Monitor for ${pattern.pattern.type} pattern conditions`;
    }

    return `Watch for ${primaryTrigger.description} to activate ${pattern.pattern.type} trade`;
  }

  /**
   * Filter recommendations based on context history
   */
  private async filterByContextHistory(
    recommendations: ContextRecommendation[],
    context: IResearchContext
  ): Promise<ContextRecommendation[]> {
    const filtered: ContextRecommendation[] = [];

    for (const rec of recommendations) {
      const effectiveness = context.learning.patternEffectiveness.get(rec.id);
      
      // Skip if pattern has poor historical performance in this context
      if (effectiveness && effectiveness.applications > 5 && effectiveness.successRate < 0.3) {
        continue;
      }

      // Boost confidence if pattern has good historical performance
      if (effectiveness && effectiveness.applications > 5 && effectiveness.successRate > 0.7) {
        rec.confidence = Math.min(rec.confidence * 1.2, 1.0);
      }

      // Check if pattern was recently applied (avoid repetition)
      const recentApplications = context.history.patternApplications
        .filter(app => app.patternId === rec.id)
        .filter(app => Date.now() - app.appliedAt.getTime() < 86400000); // 24 hours

      if (recentApplications.length > 2) {
        rec.confidence *= 0.5; // Reduce confidence for overused patterns
      }

      filtered.push(rec);
    }

    return filtered.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Update pattern tracking after application
   */
  private async updatePatternTracking(
    context: IResearchContext,
    patternId: string
  ): Promise<void> {
    const tracking = context.learning.patternEffectiveness.get(patternId) || {
      patternId,
      applications: 0,
      successRate: 0,
      avgImpact: 0,
      contexts: []
    };

    tracking.applications += 1;
    
    // Add current context key if not already tracked
    const contextKey = this.generateContextKey(context.currentState.snapshot);
    if (!tracking.contexts.includes(contextKey)) {
      tracking.contexts.push(contextKey);
    }

    context.learning.patternEffectiveness.set(patternId, tracking);
    await context.save();
  }

  /**
   * Update learning metrics from outcome
   */
  private async updateLearningFromOutcome(
    context: IResearchContext,
    patternId: string,
    success: boolean,
    impact: number
  ): Promise<void> {
    // Extract contextual factors that may have influenced outcome
    const contextFactors = this.extractContextualFactors(context, success, impact);

    // Update or create contextual factor learning
    for (const factor of contextFactors) {
      const existing = context.learning.contextualFactors.find(
        f => f.dimension === factor.dimension
      );

      if (existing) {
        existing.observations += 1;
        existing.importanceScore = this.updateImportanceScore(
          existing.importanceScore,
          factor.importance,
          existing.observations
        );
        existing.lastUpdated = new Date();
      } else {
        context.learning.contextualFactors.push({
          dimension: factor.dimension,
          observations: 1,
          distribution: {
            type: 'empirical',
            parameters: new Map([['impact', impact]])
          },
          importanceScore: factor.importance,
          lastUpdated: new Date()
        });
      }
    }

    await context.save();
  }

  /**
   * Check for opportunities to create adaptation rules
   */
  private async checkAdaptationOpportunities(
    context: IResearchContext,
    patternId: string
  ): Promise<void> {
    const effectiveness = context.learning.patternEffectiveness.get(patternId);
    
    if (!effectiveness || effectiveness.applications < 10) {
      return; // Not enough data
    }

    // Look for consistent patterns in success/failure
    const recentApps = context.history.patternApplications
      .filter(app => app.patternId === patternId && app.outcome)
      .slice(-10);

    if (recentApps.length < 5) return;

    // Analyze conditions when pattern succeeds vs fails
    const successConditions = recentApps
      .filter(app => app.outcome!.success)
      .map(app => this.extractConditions(app));

    const failureConditions = recentApps
      .filter(app => !app.outcome!.success)
      .map(app => this.extractConditions(app));

    // Find discriminating conditions
    const discriminators = this.findDiscriminatingConditions(
      successConditions,
      failureConditions
    );

    // Create adaptation rules
    for (const discriminator of discriminators) {
      const rule = {
        condition: discriminator.condition,
        action: discriminator.action,
        confidence: discriminator.confidence,
        applications: 0
      };

      // Check if rule already exists
      const exists = context.learning.adaptationRules.some(
        r => r.condition === rule.condition
      );

      if (!exists) {
        context.learning.adaptationRules.push(rule);
        console.log(`🎯 Created new adaptation rule: ${rule.condition} → ${rule.action}`);
      }
    }

    await context.save();
  }

  /**
   * Helper methods
   */
  private setupEventListeners(): void {
    // Listen for pattern ingestion events
    this.clusteringEngine.on('patternIngested', async (event) => {
      // Update all active contexts with new pattern availability
      for (const [contextId, context] of Array.from(this.activeContexts)) {
        const recommendations = await this.generateRecommendations(context);
        context.currentState.recommendations = recommendations;
        await context.save();
      }
    });
  }

  private async getContextById(contextId: string): Promise<IResearchContext | null> {
    // Check cache first
    const cached = this.activeContexts.get(contextId);
    if (cached) return cached;

    // Load from database
    const context = await ResearchContextModel.findOne({ contextId });
    if (context) {
      this.activeContexts.set(contextId, context);
      this.startSnapshotTimer(contextId);
    }

    return context;
  }

  private startSnapshotTimer(contextId: string): void {
    // Clear existing timer
    const existingTimer = this.snapshotTimers.get(contextId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Start new timer
    const timer = setInterval(async () => {
      const context = this.activeContexts.get(contextId);
      if (context) {
        await context.recordSnapshot();
        console.log(`📸 Recorded snapshot for context ${contextId}`);
      }
    }, this.snapshotInterval);

    this.snapshotTimers.set(contextId, timer);
  }

  private generateContextKey(snapshot: any): string {
    const conditions = snapshot.marketConditions
      .map((c: any) => `${c.metric}:${c.trend}`)
      .join(',');
    
    return `market:${conditions}`;
  }

  private extractContextualFactors(
    context: IResearchContext,
    success: boolean,
    impact: number
  ): Array<{ dimension: string; importance: number }> {
    const factors: Array<{ dimension: string; importance: number }> = [];

    // Market conditions
    for (const condition of context.currentState.snapshot.marketConditions) {
      factors.push({
        dimension: `market_${condition.metric}`,
        importance: success ? Math.abs(impact) : -Math.abs(impact)
      });
    }

    // Active patterns interaction
    if (context.currentState.snapshot.activePatterns.length > 1) {
      factors.push({
        dimension: 'multi_pattern_active',
        importance: success ? 0.1 : -0.1
      });
    }

    // Anomaly flags
    if (context.currentState.snapshot.anomalyFlags.length > 0) {
      factors.push({
        dimension: 'anomaly_present',
        importance: success ? -0.2 : 0.2 // Anomalies usually bad
      });
    }

    return factors;
  }

  private updateImportanceScore(
    current: number,
    newValue: number,
    observations: number
  ): number {
    // Exponential moving average
    const alpha = Math.min(0.3, 2 / (observations + 1));
    return current * (1 - alpha) + newValue * alpha;
  }

  private extractConditions(application: IPatternApplication): Map<string, any> {
    const conditions = new Map<string, any>();
    
    // Extract from parameters
    for (const [key, value] of Array.from(application.parameters)) {
      conditions.set(key, value);
    }

    // Add outcome info
    if (application.outcome) {
      conditions.set('_success', application.outcome.success);
      conditions.set('_impact', application.outcome.impact);
    }

    return conditions;
  }

  private findDiscriminatingConditions(
    successConditions: Map<string, any>[],
    failureConditions: Map<string, any>[]
  ): Array<{ condition: string; action: string; confidence: number }> {
    const discriminators: Array<{ condition: string; action: string; confidence: number }> = [];

    // Simple discriminator finding - look for conditions present in success but not failure
    const successKeys = new Set<string>();
    const failureKeys = new Set<string>();

    for (const conditions of successConditions) {
      for (const [key, value] of Array.from(conditions)) {
        if (!key.startsWith('_')) {
          successKeys.add(`${key}=${value}`);
        }
      }
    }

    for (const conditions of failureConditions) {
      for (const [key, value] of Array.from(conditions)) {
        if (!key.startsWith('_')) {
          failureKeys.add(`${key}=${value}`);
        }
      }
    }

    // Find conditions unique to success
    for (const condition of Array.from(successKeys)) {
      if (!failureKeys.has(condition)) {
        discriminators.push({
          condition,
          action: 'boost_confidence',
          confidence: 0.8
        });
      }
    }

    // Find conditions unique to failure
    for (const condition of Array.from(failureKeys)) {
      if (!successKeys.has(condition)) {
        discriminators.push({
          condition,
          action: 'reduce_confidence',
          confidence: 0.8
        });
      }
    }

    return discriminators.slice(0, 3); // Top 3 discriminators
  }

  /**
   * Clean up inactive contexts
   */
  async cleanupInactiveContexts(): Promise<void> {
    const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours

    for (const [contextId, context] of Array.from(this.activeContexts)) {
      if (Date.now() - context.lastActivity.getTime() > inactiveThreshold) {
        // Stop snapshot timer
        const timer = this.snapshotTimers.get(contextId);
        if (timer) {
          clearInterval(timer);
          this.snapshotTimers.delete(contextId);
        }

        // Remove from cache
        this.activeContexts.delete(contextId);
        
        console.log(`🧹 Cleaned up inactive context: ${contextId}`);
      }
    }
  }
}