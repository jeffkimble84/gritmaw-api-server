/**
 * Trading Decision Database Model  
 * Tracks all trading decisions for consistency analysis and XRP/MP Materials prevention
 */

import mongoose, { Schema, Document, Model } from 'mongoose'
import { TradingDecision as TradingDecisionType, ConsistencyResult, CapitalAllocation } from '@/types/core'

export interface ITradingDecision extends Document {
  id: string
  userId: string
  timestamp: Date
  symbol?: string
  decisionType: 'POSITION_OPEN' | 'POSITION_CLOSE' | 'ALLOCATION_CHANGE'
  confidence: number
  reasoning: string
  position?: {
    symbol: string
    size: number
    category: 'core' | 'tactical' | 'war_chest'
    timeHorizon: string
  }
  capitalAllocation: CapitalAllocation
  consistencyCheck: ConsistencyResult
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'FAILED'
  strategyName: string
  executedAt?: Date
  executionDetails?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

const TradingDecisionSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  symbol: {
    type: String,
    uppercase: true,
    trim: true,
    sparse: true,
    index: true
  },
  decisionType: {
    type: String,
    required: true,
    enum: ['POSITION_OPEN', 'POSITION_CLOSE', 'ALLOCATION_CHANGE']
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  reasoning: {
    type: String,
    required: true,
    maxlength: 1000
  },
  position: {
    symbol: {
      type: String,
      uppercase: true,
      trim: true
    },
    size: {
      type: Number,
      min: 0
    },
    category: {
      type: String,
      enum: ['core', 'tactical', 'war_chest']
    },
    timeHorizon: {
      type: String
    }
  },
  capitalAllocation: {
    core: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      positions: [{ type: String }]
    },
    tactical: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      positions: [{ type: String }]
    },
    warChest: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      positions: [{ type: String }]
    },
    totalCapital: { type: Number, required: true }
  },
  consistencyCheck: {
    contradicts: { type: Boolean, required: true },
    score: { type: Number, required: true, min: 0, max: 1 },
    details: [{ type: String }],
    warnings: [{ type: String }],
    recommendations: [{ type: String }],
    alerts: [{
      id: { type: String, required: true },
      type: { 
        type: String, 
        required: true,
        enum: ['info', 'warning', 'critical', 'opportunity']
      },
      title: { type: String, required: true },
      message: { type: String, required: true },
      confidence: { type: Number, required: true, min: 0, max: 1 },
      canOverride: { type: Boolean, required: true },
      createdAt: { type: String, required: true }
    }]
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'EXECUTED', 'CANCELLED', 'FAILED'],
    default: 'PENDING'
  },
  strategyName: {
    type: String,
    required: true,
    trim: true
  },
  executedAt: {
    type: Date,
    sparse: true
  },
  executionDetails: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  collection: 'trading_decisions'
})

// Compound indexes for efficient consistency checking
TradingDecisionSchema.index({ userId: 1, timestamp: -1 })
TradingDecisionSchema.index({ userId: 1, symbol: 1, timestamp: -1 })
TradingDecisionSchema.index({ userId: 1, decisionType: 1, timestamp: -1 })
TradingDecisionSchema.index({ userId: 1, strategyName: 1, timestamp: -1 })
TradingDecisionSchema.index({ 'consistencyCheck.contradicts': 1, timestamp: -1 })

// Static methods for consistency checking
TradingDecisionSchema.statics.getRecentDecisions = function(
  userId: string, 
  hoursBack: number = 24
) {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  return this.find({
    userId,
    timestamp: { $gte: cutoffTime }
  }).sort({ timestamp: -1 })
}

TradingDecisionSchema.statics.findContradictoryDecisions = function(
  userId: string,
  symbol: string,
  decisionType: string,
  hoursBack: number = 24
) {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  const oppositeType = decisionType === 'POSITION_OPEN' ? 'POSITION_CLOSE' : 'POSITION_OPEN'
  
  return this.find({
    userId,
    symbol,
    decisionType: oppositeType,
    timestamp: { $gte: cutoffTime }
  }).sort({ timestamp: -1 })
}

TradingDecisionSchema.statics.getStrategyChanges = function(
  userId: string,
  hoursBack: number = 24
) {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  return this.aggregate([
    {
      $match: {
        userId,
        timestamp: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$strategyName',
        count: { $sum: 1 },
        lastUsed: { $max: '$timestamp' }
      }
    },
    {
      $sort: { lastUsed: -1 }
    }
  ])
}

TradingDecisionSchema.statics.getConsistencyStats = function(userId: string) {
  return this.aggregate([
    {
      $match: { userId }
    },
    {
      $group: {
        _id: null,
        totalDecisions: { $sum: 1 },
        contradictoryDecisions: {
          $sum: { $cond: ['$consistencyCheck.contradicts', 1, 0] }
        },
        avgConfidence: { $avg: '$confidence' },
        avgConsistencyScore: { $avg: '$consistencyCheck.score' }
      }
    }
  ])
}

// Instance methods
TradingDecisionSchema.methods.markExecuted = function(executionDetails?: any) {
  this.status = 'EXECUTED'
  this.executedAt = new Date()
  if (executionDetails) {
    this.executionDetails = executionDetails
  }
  return this.save()
}

TradingDecisionSchema.methods.cancel = function(reason?: string) {
  this.status = 'CANCELLED'
  if (reason) {
    this.executionDetails = { cancelReason: reason }
  }
  return this.save()
}

// Create and export the model
const TradingDecision: Model<ITradingDecision> = mongoose.models.TradingDecision || 
  mongoose.model<ITradingDecision>('TradingDecision', TradingDecisionSchema)

export default TradingDecision