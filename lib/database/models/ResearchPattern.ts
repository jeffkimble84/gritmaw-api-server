import { Schema, model, Document, Types } from 'mongoose';

// Flexible interfaces that avoid hardcoded values
export interface IStatisticalTest {
  testName: string;
  statistic: number;
  pValue?: number;
  confidenceInterval?: [number, number];
  effectSize?: number;
  sampleSize?: number;
  metadata: Record<string, any>;
}

export interface IResearchSource {
  citation: string;
  authors: string[];
  year: number;
  journal?: string;
  doi?: string;
  keyFindings: string[];
  sampleSize?: number;
  methodology?: string;
  limitations?: string[];
  metadata: Record<string, any>;
}

export interface ITriggerCondition {
  id: string;
  name: string;
  description: string;
  // Flexible condition definition - no hardcoded logic
  condition: {
    type: 'threshold' | 'pattern' | 'composite' | 'custom';
    parameters: Record<string, any>;
  };
  confidence: number;
  observations: number;
  lastUpdated: Date;
}

export interface IThresholdRange {
  dimension: string;
  description: string;
  // Statistical distribution instead of hardcoded values
  distribution: {
    type: 'normal' | 'lognormal' | 'uniform' | 'exponential' | 'custom';
    parameters: Record<string, number>;
    percentiles?: Map<number, number>;
  };
  confidence: number;
  sampleSize: number;
  timeDecay?: {
    halfLife: number;
    lastObserved: Date;
  };
  contextualFactors?: string[];
}

export interface IContextualFactor {
  name: string;
  description: string;
  impact: 'amplifies' | 'dampens' | 'modifies' | 'gates';
  magnitude?: {
    distribution: string;
    parameters: Record<string, number>;
  };
  evidence: string[];
  confidence: number;
}

export interface IPerformanceObservation {
  observationId: string;
  timestamp: Date;
  context: Record<string, any>;
  predicted: Record<string, any>;
  actual: Record<string, any>;
  accuracy: number;
  contributingFactors?: string[];
  anomalyScore?: number;
}

export interface IParameterAdaptation {
  timestamp: Date;
  parameterPath: string;
  oldValue: any;
  newValue: any;
  reason: string;
  performanceImprovement?: number;
  confidenceChange?: number;
}

export interface IPatternCluster {
  clusterId: string;
  centroid?: number[];
  memberPatterns: string[];
  clusterType: 'behavioral' | 'statistical' | 'temporal' | 'mixed';
  stability: number;
  lastUpdated: Date;
}

export interface IResearchPattern extends Document {
  // Core identification
  patternId: string;
  discoveredAt: Date;
  lastUpdated: Date;
  version: number;
  
  // Pattern definition - flexible structure
  pattern: {
    name: string;
    type: string;
    hypothesis: string;
    confidence: number;
    // Flexible dimensions as key-value pairs
    dimensions: Map<string, {
      description: string;
      dataType: 'continuous' | 'discrete' | 'categorical' | 'temporal';
      observedRange?: any;
      unit?: string;
    }>;
  };
  
  // Academic validation
  evidence: {
    sources: IResearchSource[];
    statisticalTests: IStatisticalTest[];
    totalSampleSize?: number;
    crossValidation: {
      markets: string[];
      timeframes: string[];
      assetClasses: string[];
      performanceByContext: Map<string, number>;
    };
    metaAnalysis?: {
      consistencyScore: number;
      heterogeneity: number;
      publicationBias?: number;
    };
  };
  
  // Dynamic learned parameters
  parameters: {
    triggers: ITriggerCondition[];
    thresholds: IThresholdRange[];
    contextualFactors: IContextualFactor[];
    learningRate: number;
    adaptationStrategy: 'bayesian' | 'gradient' | 'reinforcement' | 'hybrid';
  };
  
  // Performance tracking
  performance: {
    observations: IPerformanceObservation[];
    aggregateMetrics: {
      successRate: number;
      avgAccuracy: number;
      volatility: number;
      sharpeRatio?: number;
      informationRatio?: number;
    };
    learningCurve: Array<{
      timestamp: Date;
      metricName: string;
      value: number;
    }>;
    adaptations: IParameterAdaptation[];
  };
  
  // Relationships and clustering
  relationships: {
    parentPattern?: string;
    childPatterns: string[];
    correlatedPatterns: Array<{
      patternId: string;
      correlation: number;
      lag?: number;
    }>;
    conflictingPatterns: Array<{
      patternId: string;
      conflictType: string;
      resolution?: string;
    }>;
    clusters: IPatternCluster[];
  };
  
  // Implementation details
  implementation: {
    dataRequirements: string[];
    computationalComplexity: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n²)' | 'custom';
    realTimeFeasible: boolean;
    latencyEstimate?: number;
    integrationPoints: string[];
    dependencies: string[];
  };
  
  // Metadata
  metadata: {
    tags: string[];
    researchSessionId?: string;
    ingestionMethod: 'manual' | 'automated' | 'hybrid';
    qualityScore: number;
    reviewStatus: 'pending' | 'reviewed' | 'approved' | 'rejected';
    reviewNotes?: string[];
    expirationDate?: Date;
  };
}

// Mongoose schema with flexible structure
const ResearchPatternSchema = new Schema<IResearchPattern>({
  patternId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  discoveredAt: { 
    type: Date, 
    required: true, 
    default: Date.now 
  },
  lastUpdated: { 
    type: Date, 
    required: true, 
    default: Date.now 
  },
  version: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  
  pattern: {
    name: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    hypothesis: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    dimensions: {
      type: Map,
      of: {
        description: String,
        dataType: {
          type: String,
          enum: ['continuous', 'discrete', 'categorical', 'temporal']
        },
        observedRange: Schema.Types.Mixed,
        unit: String
      }
    }
  },
  
  evidence: {
    sources: [{
      citation: { type: String, required: true },
      authors: [String],
      year: { type: Number, required: true },
      journal: String,
      doi: String,
      keyFindings: [String],
      sampleSize: Number,
      methodology: String,
      limitations: [String],
      metadata: { type: Map, of: Schema.Types.Mixed }
    }],
    statisticalTests: [{
      testName: { type: String, required: true },
      statistic: { type: Number, required: true },
      pValue: Number,
      confidenceInterval: [Number],
      effectSize: Number,
      sampleSize: Number,
      metadata: { type: Map, of: Schema.Types.Mixed }
    }],
    totalSampleSize: Number,
    crossValidation: {
      markets: [String],
      timeframes: [String],
      assetClasses: [String],
      performanceByContext: { type: Map, of: Number }
    },
    metaAnalysis: {
      consistencyScore: Number,
      heterogeneity: Number,
      publicationBias: Number
    }
  },
  
  parameters: {
    triggers: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      description: String,
      condition: {
        type: { 
          type: String, 
          enum: ['threshold', 'pattern', 'composite', 'custom'] 
        },
        parameters: { type: Map, of: Schema.Types.Mixed }
      },
      confidence: { type: Number, min: 0, max: 1 },
      observations: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now }
    }],
    thresholds: [{
      dimension: { type: String, required: true },
      description: String,
      distribution: {
        type: { type: String, required: true },
        parameters: { type: Map, of: Number },
        percentiles: { type: Map, of: Number }
      },
      confidence: { type: Number, min: 0, max: 1 },
      sampleSize: Number,
      timeDecay: {
        halfLife: Number,
        lastObserved: Date
      },
      contextualFactors: [String]
    }],
    contextualFactors: [{
      name: { type: String, required: true },
      description: String,
      impact: { 
        type: String, 
        enum: ['amplifies', 'dampens', 'modifies', 'gates'] 
      },
      magnitude: {
        distribution: String,
        parameters: { type: Map, of: Number }
      },
      evidence: [String],
      confidence: { type: Number, min: 0, max: 1 }
    }],
    learningRate: { type: Number, default: 0.01 },
    adaptationStrategy: {
      type: String,
      enum: ['bayesian', 'gradient', 'reinforcement', 'hybrid'],
      default: 'bayesian'
    }
  },
  
  performance: {
    observations: [{
      observationId: { type: String, required: true },
      timestamp: { type: Date, required: true },
      context: { type: Map, of: Schema.Types.Mixed },
      predicted: { type: Map, of: Schema.Types.Mixed },
      actual: { type: Map, of: Schema.Types.Mixed },
      accuracy: { type: Number, min: 0, max: 1 },
      contributingFactors: [String],
      anomalyScore: Number
    }],
    aggregateMetrics: {
      successRate: { type: Number, min: 0, max: 1 },
      avgAccuracy: { type: Number, min: 0, max: 1 },
      volatility: { type: Number, min: 0 },
      sharpeRatio: Number,
      informationRatio: Number
    },
    learningCurve: [{
      timestamp: Date,
      metricName: String,
      value: Number
    }],
    adaptations: [{
      timestamp: Date,
      parameterPath: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      reason: String,
      performanceImprovement: Number,
      confidenceChange: Number
    }]
  },
  
  relationships: {
    parentPattern: { type: String, index: true },
    childPatterns: [{ type: String, index: true }],
    correlatedPatterns: [{
      patternId: String,
      correlation: { type: Number, min: -1, max: 1 },
      lag: Number
    }],
    conflictingPatterns: [{
      patternId: String,
      conflictType: String,
      resolution: String
    }],
    clusters: [{
      clusterId: { type: String, index: true },
      centroid: [Number],
      memberPatterns: [String],
      clusterType: {
        type: String,
        enum: ['behavioral', 'statistical', 'temporal', 'mixed']
      },
      stability: { type: Number, min: 0, max: 1 },
      lastUpdated: Date
    }]
  },
  
  implementation: {
    dataRequirements: [String],
    computationalComplexity: {
      type: String,
      enum: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'custom']
    },
    realTimeFeasible: { type: Boolean, required: true },
    latencyEstimate: Number,
    integrationPoints: [String],
    dependencies: [String]
  },
  
  metadata: {
    tags: [{ type: String, index: true }],
    researchSessionId: { type: String, index: true },
    ingestionMethod: {
      type: String,
      enum: ['manual', 'automated', 'hybrid']
    },
    qualityScore: { type: Number, min: 0, max: 1 },
    reviewStatus: {
      type: String,
      enum: ['pending', 'reviewed', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewNotes: [String],
    expirationDate: Date
  }
}, {
  timestamps: true,
  collection: 'research_patterns'
});

// Indexes for efficient querying
ResearchPatternSchema.index({ 'pattern.type': 1, 'pattern.confidence': -1 });
ResearchPatternSchema.index({ 'metadata.tags': 1, 'metadata.reviewStatus': 1 });
ResearchPatternSchema.index({ 'relationships.clusters.clusterId': 1 });
ResearchPatternSchema.index({ 'evidence.crossValidation.assetClasses': 1 });
ResearchPatternSchema.index({ 'parameters.triggers.name': 1 });
ResearchPatternSchema.index({ lastUpdated: -1 });

// Instance methods
ResearchPatternSchema.methods.addObservation = async function(observation: IPerformanceObservation) {
  this.performance.observations.push(observation);
  await this.updateAggregateMetrics();
  this.lastUpdated = new Date();
  return this.save();
};

ResearchPatternSchema.methods.updateAggregateMetrics = async function() {
  const observations = this.performance.observations;
  if (observations.length === 0) return;
  
  const accuracies = observations.map((obs: IPerformanceObservation) => obs.accuracy);
  this.performance.aggregateMetrics.avgAccuracy = 
    accuracies.reduce((a: number, b: number) => a + b, 0) / accuracies.length;
  
  // Calculate success rate (accuracy > 0.5)
  this.performance.aggregateMetrics.successRate = 
    accuracies.filter((acc: number) => acc > 0.5).length / accuracies.length;
  
  // Calculate volatility (standard deviation)
  const mean = this.performance.aggregateMetrics.avgAccuracy;
  const variance = accuracies.reduce((sum: number, acc: number) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
  this.performance.aggregateMetrics.volatility = Math.sqrt(variance);
};

ResearchPatternSchema.methods.adaptParameters = async function(adaptation: IParameterAdaptation) {
  this.parameters.adaptations.push(adaptation);
  this.version += 1;
  this.lastUpdated = new Date();
  return this.save();
};

export const ResearchPatternModel = model<IResearchPattern>('ResearchPattern', ResearchPatternSchema);