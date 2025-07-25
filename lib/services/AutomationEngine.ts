/**
 * GRITMAW V2 - AUTOMATION ENGINE
 * Smart queue replenishment, automated triggers, and system optimization
 * Clean architecture implementation
 */

import { researchIngestionSystem } from './ResearchIngestionSystem';
import { SystemSettings } from '@/lib/database/models';
import { AutomationTrigger } from '@/types/core';

export interface AutomationEvent {
  id: string;
  triggerId: string;
  timestamp: Date;
  type: 'TRIGGER_FIRED' | 'ACTION_EXECUTED' | 'ACTION_FAILED' | 'CONDITION_MET';
  details: any;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  executionTime?: number; // milliseconds
  error?: string;
}

export interface QueueMetrics {
  currentSize: number;
  targetSize: number;
  minSize: number;
  utilizationRate: number; // Queue depletion rate per day
  avgResearchDuration: number; // Days to complete research
  priorityDistribution: { [priority: string]: number };
  categoryDistribution: { [category: string]: number };
  successRate: number;
  lastReplenishment: Date | null;
}

export interface SmartThreshold {
  metric: string;
  dynamicValue: number;
  baseValue: number;
  adjustmentFactor: number;
  learningRate: number;
  confidence: number; // 0-1
  lastAdjustment: Date;
  performanceHistory: number[];
}

export class AutomationEngine {
  private triggers: Map<string, AutomationTrigger> = new Map();
  private events: AutomationEvent[] = [];
  private smartThresholds: Map<string, SmartThreshold> = new Map();
  private isRunning: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;
  private systemSettings: any = null;

  constructor() {
    this.initializeDefaultTriggers();
    this.initializeSmartThresholds();
  }

  /**
   * Start the automation engine
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Load system settings
    try {
      const settings = await SystemSettings.findOne({ category: 'RESEARCH', isActive: true }).sort({ version: -1 });
      if (settings) {
        this.systemSettings = settings.researchConfig;
      }
    } catch (error) {
      console.error('Failed to load system settings:', error);
    }
    
    // Start monitoring loop - check every minute
    this.monitoringInterval = setInterval(() => {
      this.processActiveTriggers();
    }, 60000); // 1 minute

    console.log('🤖 Automation Engine started with smart queue management');
  }

  /**
   * Stop the automation engine
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    console.log('🤖 Automation Engine stopped');
  }

  /**
   * Process all active triggers
   */
  private async processActiveTriggers(): Promise<void> {
    for (const [triggerId, trigger] of Array.from(this.triggers.entries())) {
      if (!trigger.enabled) continue;

      try {
        const shouldTrigger = await this.evaluateTriggerCondition(trigger);
        
        if (shouldTrigger) {
          await this.executeTriggerAction(trigger);
          
          // Update trigger statistics
          trigger.lastTriggered = new Date();
          trigger.triggerCount++;
          
          // Log event
          this.logEvent({
            id: `event_${Date.now()}`,
            triggerId,
            timestamp: new Date(),
            type: 'TRIGGER_FIRED',
            details: { triggerName: trigger.name },
            status: 'SUCCESS'
          });
        }
      } catch (error) {
        // Log failed trigger
        this.logEvent({
          id: `event_${Date.now()}`,
          triggerId,
          timestamp: new Date(),
          type: 'ACTION_FAILED',
          details: { triggerName: trigger.name, error: error },
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Update smart thresholds based on performance
    this.updateSmartThresholds();
  }

  /**
   * Evaluate if a trigger condition is met
   */
  private async evaluateTriggerCondition(trigger: AutomationTrigger): Promise<boolean> {
    const { condition } = trigger;

    switch (condition.type) {
      case 'THRESHOLD':
        return this.evaluateThresholdCondition(trigger);
        
      case 'SCHEDULE':
        return this.evaluateScheduleCondition(trigger);
        
      case 'EVENT':
        return this.evaluateEventCondition(trigger);
        
      case 'COMBINATION':
        return this.evaluateCombinationCondition(trigger);
        
      default:
        return false;
    }
  }

  /**
   * Execute trigger action
   */
  private async executeTriggerAction(trigger: AutomationTrigger): Promise<void> {
    const startTime = Date.now();
    
    try {
      switch (trigger.action.type) {
        case 'REPLENISH_QUEUE':
          await this.executeQueueReplenishment(trigger.action.parameters);
          break;
          
        case 'DEPLOY_EDGE':
          await this.executeEdgeDeployment(trigger.action.parameters);
          break;
          
        case 'SEND_ALERT':
          await this.executeSendAlert(trigger.action.parameters);
          break;
          
        case 'RUN_ANALYSIS':
          await this.executeRunAnalysis(trigger.action.parameters);
          break;
          
        default:
          console.warn(`Unknown action type: ${trigger.action.type}`);
      }

      const executionTime = Date.now() - startTime;
      
      // Log successful execution
      this.logEvent({
        id: `event_${Date.now()}`,
        triggerId: trigger.id,
        timestamp: new Date(),
        type: 'ACTION_EXECUTED',
        details: { 
          actionType: trigger.action.type,
          parameters: trigger.action.parameters
        },
        status: 'SUCCESS',
        executionTime
      });

      // Update success rate
      trigger.successRate = this.calculateSuccessRate(trigger.id);
      
    } catch (error) {
      throw error; // Re-throw for caller to handle logging
    }
  }

  /**
   * Smart queue replenishment with adaptive sizing
   */
  private async executeQueueReplenishment(parameters: any): Promise<void> {
    const currentMetrics = await this.getQueueMetrics();
    
    // Calculate smart target size based on velocity and market conditions
    const smartTargetSize = this.calculateSmartTargetSize(currentMetrics);
    
    console.log(`🔄 Smart queue replenishment triggered`);
    console.log(`Current size: ${currentMetrics.currentSize}, Smart target: ${smartTargetSize}`);
    
    if (currentMetrics.currentSize >= smartTargetSize) {
      console.log(`Queue already at optimal size, skipping replenishment`);
      return;
    }

    // Execute replenishment with smart targeting
    const result = await researchIngestionSystem.replenishQueue(smartTargetSize);
    
    console.log(`✅ Queue replenished: +${result.added} biases, total: ${result.totalSize}`);
    
    // Update smart thresholds based on success
    this.updateThresholdBasedOnOutcome('queue_replenishment', true, result.totalSize);
  }

  /**
   * Calculate smart target size based on current conditions
   */
  private calculateSmartTargetSize(metrics: QueueMetrics): number {
    const baseTarget = this.systemSettings?.targetQueueSize || 15;
    const velocity = this.systemSettings?.researchVelocity || 2;
    const utilizationRate = metrics.utilizationRate;
    
    // Adjust target based on velocity and utilization
    let smartTarget = baseTarget;
    
    // If utilization is high, increase target buffer
    if (utilizationRate > 1.5) {
      smartTarget = Math.ceil(baseTarget * 1.3);
    } else if (utilizationRate < 0.5) {
      smartTarget = Math.floor(baseTarget * 0.8);
    }
    
    // Consider research velocity (higher velocity = larger buffer needed)
    const velocityMultiplier = 1 + (velocity - 2) * 0.1; // Base velocity is 2
    smartTarget = Math.ceil(smartTarget * velocityMultiplier);
    
    // Apply smart threshold adjustments
    const smartThreshold = this.smartThresholds.get('queue_target_size');
    if (smartThreshold && smartThreshold.confidence > 0.7) {
      smartTarget = Math.ceil(smartTarget * smartThreshold.adjustmentFactor);
    }
    
    // Ensure reasonable bounds
    const minSize = this.systemSettings?.minQueueSize || 10;
    return Math.max(minSize + 5, Math.min(smartTarget, 50));
  }

  /**
   * Get current queue metrics
   */
  private async getQueueMetrics(): Promise<QueueMetrics> {
    const queueStatus = researchIngestionSystem.getQueueStatus();
    
    return {
      currentSize: queueStatus.queueSize,
      targetSize: this.systemSettings?.targetQueueSize || 15,
      minSize: this.systemSettings?.minQueueSize || 10,
      utilizationRate: 1.2, // Biases consumed per day (placeholder)
      avgResearchDuration: 7, // Average days to complete (placeholder)
      priorityDistribution: this.calculatePriorityDistribution(queueStatus.topBiases),
      categoryDistribution: this.calculateCategoryDistribution(queueStatus.topBiases),
      successRate: 0.85, // Placeholder
      lastReplenishment: new Date()
    };
  }

  /**
   * Initialize default automation triggers
   */
  private initializeDefaultTriggers(): void {
    // Queue Size Trigger
    this.triggers.set('queue_low_trigger', {
      id: 'queue_low_trigger',
      name: 'Research Queue Low Size Alert',
      type: 'QUEUE_SIZE',
      condition: {
        type: 'THRESHOLD',
        parameters: { metric: 'queue_size', operator: 'LT', value: 10 },
        evaluationFrequency: 60 // Check every hour
      },
      action: {
        type: 'REPLENISH_QUEUE',
        parameters: { method: 'smart', urgency: 'high' },
        priority: 'HIGH'
      },
      enabled: true,
      triggerCount: 0,
      successRate: 1.0
    });

    // Time-based replenishment (weekly)
    this.triggers.set('weekly_queue_review', {
      id: 'weekly_queue_review',
      name: 'Weekly Queue Health Check',
      type: 'TIME_BASED',
      condition: {
        type: 'SCHEDULE',
        parameters: { 
          frequency: 'weekly', 
          dayOfWeek: 1, // Monday
          hour: 9, // 9 AM
          timeZone: 'UTC'
        },
        evaluationFrequency: 1440 // Check daily
      },
      action: {
        type: 'RUN_ANALYSIS',
        parameters: { 
          analysisType: 'queue_health_assessment',
          generateReport: true,
          autoReplenish: true
        },
        priority: 'MEDIUM'
      },
      enabled: true,
      triggerCount: 0,
      successRate: 1.0
    });

    // Performance-based edge deployment
    this.triggers.set('edge_auto_deploy', {
      id: 'edge_auto_deploy',
      name: 'Auto-Deploy High Confidence Edges',
      type: 'PERFORMANCE_BASED',
      condition: {
        type: 'THRESHOLD',
        parameters: { 
          metric: 'edge_confidence', 
          operator: 'GT', 
          value: 0.9,
          additionalCondition: 'backtest_complete'
        },
        evaluationFrequency: 30 // Check every 30 minutes
      },
      action: {
        type: 'DEPLOY_EDGE',
        parameters: { 
          deploymentMode: 'automatic',
          rollbackEnabled: true,
          monitoringPeriod: 72 // hours
        },
        priority: 'CRITICAL'
      },
      enabled: false, // Disabled by default for safety
      triggerCount: 0,
      successRate: 1.0
    });
  }

  /**
   * Initialize smart thresholds with learning capabilities
   */
  private initializeSmartThresholds(): void {
    this.smartThresholds.set('queue_target_size', {
      metric: 'queue_target_size',
      dynamicValue: 15,
      baseValue: 15,
      adjustmentFactor: 1.0,
      learningRate: 0.1,
      confidence: 0.5,
      lastAdjustment: new Date(),
      performanceHistory: []
    });

    this.smartThresholds.set('queue_replenishment_urgency', {
      metric: 'queue_replenishment_urgency',
      dynamicValue: 10,
      baseValue: 10,
      adjustmentFactor: 1.0,
      learningRate: 0.05,
      confidence: 0.5,
      lastAdjustment: new Date(),
      performanceHistory: []
    });
  }

  /**
   * Update smart thresholds based on performance feedback
   */
  private updateSmartThresholds(): void {
    for (const [key, threshold] of Array.from(this.smartThresholds.entries())) {
      // Only update if we have enough performance data
      if (threshold.performanceHistory.length < 5) continue;

      // Calculate performance trend
      const recentPerformance = threshold.performanceHistory.slice(-10);
      const avgPerformance = recentPerformance.reduce((a, b) => a + b, 0) / recentPerformance.length;
      
      // Adjust threshold based on performance
      if (avgPerformance > 0.8) {
        // Good performance, can be more aggressive
        threshold.adjustmentFactor = Math.min(1.3, threshold.adjustmentFactor + threshold.learningRate);
        threshold.confidence = Math.min(1.0, threshold.confidence + 0.05);
      } else if (avgPerformance < 0.6) {
        // Poor performance, be more conservative
        threshold.adjustmentFactor = Math.max(0.7, threshold.adjustmentFactor - threshold.learningRate);
        threshold.confidence = Math.max(0.3, threshold.confidence - 0.05);
      }

      threshold.dynamicValue = threshold.baseValue * threshold.adjustmentFactor;
      threshold.lastAdjustment = new Date();
    }
  }

  // Condition evaluation methods
  private async evaluateThresholdCondition(trigger: AutomationTrigger): Promise<boolean> {
    const { parameters } = trigger.condition;
    const { metric, operator, value } = parameters;

    let currentValue: number;
    
    switch (metric) {
      case 'queue_size':
        const queueStatus = researchIngestionSystem.getQueueStatus();
        currentValue = queueStatus.queueSize;
        break;
      case 'edge_confidence':
        currentValue = 0.85; // Placeholder - would get from actual edge
        break;
      default:
        return false;
    }

    switch (operator) {
      case 'GT': return currentValue > value;
      case 'LT': return currentValue < value;
      case 'EQ': return currentValue === value;
      case 'GTE': return currentValue >= value;
      case 'LTE': return currentValue <= value;
      default: return false;
    }
  }

  private evaluateScheduleCondition(trigger: AutomationTrigger): boolean {
    const { parameters } = trigger.condition;
    const now = new Date();
    
    switch (parameters.frequency) {
      case 'daily':
        return now.getHours() === parameters.hour;
      case 'weekly':
        return now.getDay() === parameters.dayOfWeek && now.getHours() === parameters.hour;
      case 'monthly':
        return now.getDate() === parameters.dayOfMonth && now.getHours() === parameters.hour;
      default:
        return false;
    }
  }

  private evaluateEventCondition(trigger: AutomationTrigger): boolean {
    // Placeholder for event-based conditions
    return false;
  }

  private evaluateCombinationCondition(trigger: AutomationTrigger): boolean {
    // Placeholder for combination conditions
    return false;
  }

  // Action execution methods
  private async executeEdgeDeployment(parameters: any): Promise<void> {
    console.log('🚀 Executing edge auto-deployment...');
    // Implementation would deploy validated edges
  }

  private async executeSendAlert(parameters: any): Promise<void> {
    console.log('📧 Sending automation alert...');
    // Implementation would send notifications
  }

  private async executeRunAnalysis(parameters: any): Promise<void> {
    console.log('📊 Running automated analysis...');
    
    if (parameters.autoReplenish) {
      const metrics = await this.getQueueMetrics();
      if (metrics.currentSize < metrics.minSize) {
        await this.executeQueueReplenishment({ method: 'smart' });
      }
    }
  }

  // Utility methods
  private calculateSuccessRate(triggerId: string): number {
    const triggerEvents = this.events.filter(e => e.triggerId === triggerId);
    if (triggerEvents.length === 0) return 1.0;
    
    const successCount = triggerEvents.filter(e => e.status === 'SUCCESS').length;
    return successCount / triggerEvents.length;
  }

  private updateThresholdBasedOnOutcome(metric: string, success: boolean, value: number): void {
    const threshold = this.smartThresholds.get(metric);
    if (!threshold) return;

    threshold.performanceHistory.push(success ? 1 : 0);
    
    // Keep only recent history
    if (threshold.performanceHistory.length > 50) {
      threshold.performanceHistory = threshold.performanceHistory.slice(-30);
    }
  }

  private logEvent(event: AutomationEvent): void {
    this.events.push(event);
    
    // Keep only recent events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  private calculatePriorityDistribution(biases: any[]): { [priority: string]: number } {
    const distribution: { [priority: string]: number } = {
      'ULTRA_HIGH': 0,
      'HIGH': 0,
      'MEDIUM': 0,
      'LOW': 0
    };
    
    biases.forEach(bias => {
      if (bias.priority && distribution[bias.priority] !== undefined) {
        distribution[bias.priority]++;
      }
    });
    
    return distribution;
  }

  private calculateCategoryDistribution(biases: any[]): { [category: string]: number } {
    const distribution: { [category: string]: number } = {};
    
    biases.forEach(bias => {
      if (bias.category) {
        distribution[bias.category] = (distribution[bias.category] || 0) + 1;
      }
    });
    
    return distribution;
  }

  // Public API methods
  public getActiveTriggersStatus(): { [triggerId: string]: any } {
    const status: { [triggerId: string]: any } = {};
    
    for (const [id, trigger] of Array.from(this.triggers.entries())) {
      status[id] = {
        name: trigger.name,
        enabled: trigger.enabled,
        triggerCount: trigger.triggerCount,
        successRate: trigger.successRate,
        lastTriggered: trigger.lastTriggered
      };
    }
    
    return status;
  }

  public getRecentEvents(limit: number = 50): AutomationEvent[] {
    return this.events.slice(-limit).reverse();
  }

  public getSmartThresholdStatus(): { [metric: string]: any } {
    const status: { [metric: string]: any } = {};
    
    for (const [metric, threshold] of Array.from(this.smartThresholds.entries())) {
      status[metric] = {
        currentValue: threshold.dynamicValue,
        baseValue: threshold.baseValue,
        adjustmentFactor: threshold.adjustmentFactor,
        confidence: threshold.confidence,
        performanceScore: threshold.performanceHistory.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, threshold.performanceHistory.length)
      };
    }
    
    return status;
  }

  /**
   * Enable or disable a specific trigger
   */
  public setTriggerEnabled(triggerId: string, enabled: boolean): boolean {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.enabled = enabled;
      console.log(`Trigger ${triggerId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Update trigger parameters
   */
  public updateTriggerParameters(triggerId: string, parameters: any): boolean {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.condition.parameters = { ...trigger.condition.parameters, ...parameters };
      console.log(`Trigger ${triggerId} parameters updated`);
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const automationEngine = new AutomationEngine();