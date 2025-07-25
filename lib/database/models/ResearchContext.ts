import { Schema, model, Document, Types } from 'mongoose';

export interface IMarketCondition {
  metric: string;
  value: number;
  percentile: number;
  trend: 'rising' | 'falling' | 'stable';
  timeframe: string;
}

export interface IContextSnapshot {
  timestamp: Date;
  marketConditions: IMarketCondition[];
  activePatterns: string[];
  globalFactors: Map<string, any>;
  anomalyFlags: string[];
}

export interface IPatternApplication {
  patternId: string;
  clusterId?: string;
  appliedAt: Date;
  confidence: number;
  parameters: Map<string, any>;
  outcome?: {
    recordedAt: Date;
    success: boolean;
    impact: number;
    notes?: string;
  };
}

export interface IContextLearning {
  dimension: string;
  observations: number;
  distribution: {
    type: string;
    parameters: Map<string, number>;
  };
  importanceScore: number;
  lastUpdated: Date;
}

export interface IResearchContext extends Document {
  contextId: string;
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  
  // Current context state
  currentState: {
    snapshot: IContextSnapshot;
    activeClusters: string[];
    confidence: Map<string, number>;
    recommendations: Array<{
      type: 'pattern' | 'cluster' | 'adjustment';
      id: string;
      reason: string;
      confidence: number;
    }>;
  };
  
  // Historical context
  history: {
    snapshots: IContextSnapshot[];
    patternApplications: IPatternApplication[];
    performanceMetrics: {
      successRate: number;
      avgImpact: number;
      learningProgress: number;
    };
  };
  
  // Learning and adaptation
  learning: {
    contextualFactors: IContextLearning[];
    patternEffectiveness: Map<string, {
      patternId: string;
      applications: number;
      successRate: number;
      avgImpact: number;
      contexts: string[];
    }>;
    adaptationRules: Array<{
      condition: string;
      action: string;
      confidence: number;
      applications: number;
    }>;
  };
  
  // Integration points
  integration: {
    connectedSystems: string[];
    dataStreams: Array<{
      source: string;
      frequency: string;
      lastReceived: Date;
      status: 'active' | 'paused' | 'error';
    }>;
    outputChannels: Array<{
      channel: string;
      format: string;
      lastSent: Date;
    }>;
  };
  
  // Metadata
  metadata: {
    environment: 'development' | 'staging' | 'production';
    version: string;
    tags: string[];
    debugMode: boolean;
    retentionPolicy: {
      historyDays: number;
      snapshotInterval: number;
    };
  };
  
  // Instance methods
  recordSnapshot(): Promise<IResearchContext>;
  applyPattern(patternId: string, confidence: number, parameters: Map<string, any>): Promise<IResearchContext>;
  recordOutcome(patternId: string, success: boolean, impact: number, notes?: string): Promise<IResearchContext>;
  updatePerformanceMetrics(): Promise<void>;
}

const ResearchContextSchema = new Schema<IResearchContext>({
  contextId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  currentState: {
    snapshot: {
      timestamp: { type: Date, required: true },
      marketConditions: [{
        metric: String,
        value: Number,
        percentile: { type: Number, min: 0, max: 100 },
        trend: {
          type: String,
          enum: ['rising', 'falling', 'stable']
        },
        timeframe: String
      }],
      activePatterns: [String],
      globalFactors: { type: Map, of: Schema.Types.Mixed },
      anomalyFlags: [String]
    },
    activeClusters: [String],
    confidence: { type: Map, of: Number },
    recommendations: [{
      type: {
        type: String,
        enum: ['pattern', 'cluster', 'adjustment']
      },
      id: String,
      reason: String,
      confidence: { type: Number, min: 0, max: 1 }
    }]
  },
  
  history: {
    snapshots: [{
      timestamp: Date,
      marketConditions: [{
        metric: String,
        value: Number,
        percentile: Number,
        trend: String,
        timeframe: String
      }],
      activePatterns: [String],
      globalFactors: { type: Map, of: Schema.Types.Mixed },
      anomalyFlags: [String]
    }],
    patternApplications: [{
      patternId: { type: String, index: true },
      clusterId: String,
      appliedAt: Date,
      confidence: Number,
      parameters: { type: Map, of: Schema.Types.Mixed },
      outcome: {
        recordedAt: Date,
        success: Boolean,
        impact: Number,
        notes: String
      }
    }],
    performanceMetrics: {
      successRate: { type: Number, min: 0, max: 1 },
      avgImpact: Number,
      learningProgress: { type: Number, min: 0, max: 1 }
    }
  },
  
  learning: {
    contextualFactors: [{
      dimension: String,
      observations: Number,
      distribution: {
        type: String,
        parameters: { type: Map, of: Number }
      },
      importanceScore: { type: Number, min: 0, max: 1 },
      lastUpdated: Date
    }],
    patternEffectiveness: {
      type: Map,
      of: {
        patternId: String,
        applications: Number,
        successRate: Number,
        avgImpact: Number,
        contexts: [String]
      }
    },
    adaptationRules: [{
      condition: String,
      action: String,
      confidence: Number,
      applications: Number
    }]
  },
  
  integration: {
    connectedSystems: [String],
    dataStreams: [{
      source: String,
      frequency: String,
      lastReceived: Date,
      status: {
        type: String,
        enum: ['active', 'paused', 'error']
      }
    }],
    outputChannels: [{
      channel: String,
      format: String,
      lastSent: Date
    }]
  },
  
  metadata: {
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'development'
    },
    version: { type: String, default: '1.0.0' },
    tags: [String],
    debugMode: { type: Boolean, default: false },
    retentionPolicy: {
      historyDays: { type: Number, default: 90 },
      snapshotInterval: { type: Number, default: 3600 } // seconds
    }
  }
}, {
  timestamps: true,
  collection: 'research_contexts'
});

// Indexes
ResearchContextSchema.index({ userId: 1, lastActivity: -1 });
ResearchContextSchema.index({ 'currentState.activeClusters': 1 });
ResearchContextSchema.index({ 'history.patternApplications.patternId': 1 });

// Instance methods
ResearchContextSchema.methods.recordSnapshot = async function() {
  // Move current snapshot to history
  if (this.currentState.snapshot) {
    this.history.snapshots.push(this.currentState.snapshot);
    
    // Enforce retention policy
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.metadata.retentionPolicy.historyDays);
    
    this.history.snapshots = this.history.snapshots.filter(
      snapshot => snapshot.timestamp > cutoffDate
    );
  }
  
  this.lastActivity = new Date();
  return this.save();
};

ResearchContextSchema.methods.applyPattern = async function(
  patternId: string,
  confidence: number,
  parameters: Map<string, any>
) {
  const application: IPatternApplication = {
    patternId,
    appliedAt: new Date(),
    confidence,
    parameters
  };
  
  this.history.patternApplications.push(application);
  this.lastActivity = new Date();
  
  // Update pattern effectiveness tracking
  const effectiveness = this.learning.patternEffectiveness.get(patternId) || {
    patternId,
    applications: 0,
    successRate: 0,
    avgImpact: 0,
    contexts: []
  };
  
  effectiveness.applications += 1;
  this.learning.patternEffectiveness.set(patternId, effectiveness);
  
  return this.save();
};

ResearchContextSchema.methods.recordOutcome = async function(
  patternId: string,
  success: boolean,
  impact: number,
  notes?: string
) {
  // Find the most recent application of this pattern
  const application = this.history.patternApplications
    .filter(app => app.patternId === patternId && !app.outcome)
    .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())[0];
  
  if (application) {
    application.outcome = {
      recordedAt: new Date(),
      success,
      impact,
      notes
    };
    
    // Update effectiveness metrics
    const effectiveness = this.learning.patternEffectiveness.get(patternId);
    if (effectiveness) {
      const prevSuccessRate = effectiveness.successRate;
      const prevAvgImpact = effectiveness.avgImpact;
      const n = effectiveness.applications;
      
      effectiveness.successRate = (prevSuccessRate * (n - 1) + (success ? 1 : 0)) / n;
      effectiveness.avgImpact = (prevAvgImpact * (n - 1) + impact) / n;
      
      this.learning.patternEffectiveness.set(patternId, effectiveness);
    }
    
    // Update overall performance metrics
    await this.updatePerformanceMetrics();
  }
  
  this.lastActivity = new Date();
  return this.save();
};

ResearchContextSchema.methods.updatePerformanceMetrics = async function() {
  const applications = this.history.patternApplications.filter(app => app.outcome);
  
  if (applications.length === 0) {
    this.history.performanceMetrics = {
      successRate: 0,
      avgImpact: 0,
      learningProgress: 0
    };
    return;
  }
  
  const successes = applications.filter(app => app.outcome.success).length;
  const totalImpact = applications.reduce((sum, app) => sum + app.outcome.impact, 0);
  
  this.history.performanceMetrics.successRate = successes / applications.length;
  this.history.performanceMetrics.avgImpact = totalImpact / applications.length;
  
  // Learning progress based on confidence improvements
  const recentApps = applications.slice(-10);
  const olderApps = applications.slice(0, -10);
  
  if (olderApps.length > 0) {
    const recentAvgConfidence = recentApps.reduce((sum, app) => sum + app.confidence, 0) / recentApps.length;
    const olderAvgConfidence = olderApps.reduce((sum, app) => sum + app.confidence, 0) / olderApps.length;
    
    this.history.performanceMetrics.learningProgress = Math.max(0, Math.min(1,
      (recentAvgConfidence - olderAvgConfidence) / olderAvgConfidence
    ));
  }
};

export const ResearchContextModel = model<IResearchContext>('ResearchContext', ResearchContextSchema);