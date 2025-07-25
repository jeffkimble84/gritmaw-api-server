import mongoose, { Schema, Document } from 'mongoose';

export interface IBehavioralEdge extends Document {
  edgeId: string;
  name: string;
  type: 'RULE' | 'GUIDELINE' | 'ARCHIVED';
  description: string;
  hypothesis: string;
  academicEvidence: string[];
  successRate: number;
  expectedImpact: string;
  implementationGuidance: string;
  applicabilityConditions: string[];
  performanceMetrics: {
    totalApplications: number;
    successfulApplications: number;
    averageImprovement: number;
    lastUpdated: Date;
  };
  researchStatus: 'ACTIVE' | 'VALIDATED' | 'TESTING' | 'ARCHIVED';
  createdDate: Date;
  lastValidated: Date;
}

const BehavioralEdgeSchema: Schema = new Schema({
  edgeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['RULE', 'GUIDELINE', 'ARCHIVED'] },
  description: { type: String, required: true },
  hypothesis: { type: String, required: true },
  academicEvidence: [{ type: String }],
  successRate: { type: Number, min: 0, max: 1, required: true },
  expectedImpact: { type: String, required: true },
  implementationGuidance: { type: String, required: true },
  applicabilityConditions: [{ type: String }],
  performanceMetrics: {
    totalApplications: { type: Number, default: 0 },
    successfulApplications: { type: Number, default: 0 },
    averageImprovement: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  researchStatus: { 
    type: String, 
    required: true, 
    enum: ['ACTIVE', 'VALIDATED', 'TESTING', 'ARCHIVED'],
    default: 'TESTING'
  },
  createdDate: { type: Date, default: Date.now },
  lastValidated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'behavioral_edges'
});

// Add indexes for performance
BehavioralEdgeSchema.index({ researchStatus: 1, successRate: -1 });
BehavioralEdgeSchema.index({ type: 1, createdDate: -1 });

export default mongoose.model<IBehavioralEdge>('BehavioralEdge', BehavioralEdgeSchema);