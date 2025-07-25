import mongoose, { Schema, Document } from 'mongoose';

export interface IResearchSession extends Document {
  sessionId: string;
  userId?: string;
  researchType: 'BIAS_DISCOVERY' | 'MARKET_ANALYSIS' | 'EDGE_VALIDATION' | 'CONFIGURATION_OPTIMIZATION';
  hypothesis: string;
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';
  
  // Research parameters
  parameters: {
    symbol?: string;
    timeHorizon: string;
    marketConditions: string[];
    dataSources: string[];
    confidenceThreshold: number;
  };
  
  // Progress tracking
  progress: {
    currentPhase: string;
    phasesCompleted: string[];
    totalPhases: number;
    completionPercentage: number;
  };
  
  // Results
  findings?: {
    summary: string;
    keyInsights: string[];
    statisticalSignificance: number;
    confidenceLevel: number;
    expectedReturns: number;
    riskAssessment: string;
    implementationComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Metadata
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletion: Date;
  lastActivity: Date;
  
  // Claude AI interaction tracking
  aiInteractions: Array<{
    timestamp: Date;
    requestType: string;
    tokensUsed: number;
    responseQuality: number; // 0-1
    insightsGenerated: number;
  }>;
}

const ResearchSessionSchema = new Schema<IResearchSession>({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    default: () => `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  userId: String,
  researchType: {
    type: String,
    enum: ['BIAS_DISCOVERY', 'MARKET_ANALYSIS', 'EDGE_VALIDATION', 'CONFIGURATION_OPTIMIZATION'],
    required: true
  },
  hypothesis: {
    type: String,
    required: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ARCHIVED'],
    default: 'PLANNING',
    required: true
  },
  parameters: {
    symbol: String,
    timeHorizon: { type: String, required: true },
    marketConditions: [String],
    dataSources: [String],
    confidenceThreshold: { type: Number, min: 0, max: 1, default: 0.8 }
  },
  progress: {
    currentPhase: { type: String, default: 'initialization' },
    phasesCompleted: [String],
    totalPhases: { type: Number, default: 5 },
    completionPercentage: { type: Number, min: 0, max: 100, default: 0 }
  },
  findings: {
    summary: String,
    keyInsights: [String],
    statisticalSignificance: { type: Number, min: 0, max: 1 },
    confidenceLevel: { type: Number, min: 0, max: 1 },
    expectedReturns: Number,
    riskAssessment: String,
    implementationComplexity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH']
    }
  },
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
  estimatedCompletion: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  },
  lastActivity: { type: Date, default: Date.now },
  aiInteractions: [{
    timestamp: { type: Date, default: Date.now },
    requestType: String,
    tokensUsed: { type: Number, default: 0 },
    responseQuality: { type: Number, min: 0, max: 1, default: 0.5 },
    insightsGenerated: { type: Number, default: 0 }
  }]
}, {
  timestamps: true,
  collection: 'research_sessions'
});

// Indexes for efficient querying
ResearchSessionSchema.index({ sessionId: 1 });
ResearchSessionSchema.index({ userId: 1, createdAt: -1 });
ResearchSessionSchema.index({ status: 1, researchType: 1 });
ResearchSessionSchema.index({ 'progress.completionPercentage': 1 });

// Update last activity on save
ResearchSessionSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

export default mongoose.model<IResearchSession>('ResearchSession', ResearchSessionSchema);