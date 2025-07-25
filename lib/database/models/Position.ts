/**
 * Position Database Model
 * Aligns with V2 Position type definitions
 */

import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IPosition extends Document {
  id: string
  userId: string
  symbol: string
  name: string
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  gainLoss: number
  gainLossPercent: number
  allocation: number
  category: 'core' | 'tactical' | 'war_chest'
  timeHorizon?: 'short' | 'medium' | 'long'
  status?: 'OPEN' | 'CLOSED'
  unrealizedPnL?: number
  unrealizedPnLPercent?: number
  notes?: string
  lastUpdated: Date
  createdAt: Date
  updatedAt: Date
}

interface IPositionModel extends Model<IPosition> {
  findByUser(userId: string): Promise<IPosition[]>
  findByUserAndSymbol(userId: string, symbol: string): Promise<IPosition | null>
  getPortfolioSummary(userId: string): Promise<any>
  calculatePortfolioMetrics(positions: IPosition[]): any
  findOpenPositions(userId: string): Promise<IPosition[]>
  findBySymbol(userId: string, symbol: string): Promise<IPosition | null>
  calculateTotalValue(positions: IPosition[]): number
}

const PositionSchema: Schema = new Schema({
  userId: { 
    type: String, 
    required: true,
    index: true 
  },
  symbol: { 
    type: String, 
    required: true, 
    uppercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  quantity: { 
    type: Number, 
    required: true,
    min: 0
  },
  avgCost: { 
    type: Number, 
    required: true,
    min: 0
  },
  currentPrice: { 
    type: Number, 
    required: true,
    min: 0
  },
  marketValue: { 
    type: Number, 
    required: true
  },
  gainLoss: { 
    type: Number, 
    required: true
  },
  gainLossPercent: { 
    type: Number, 
    required: true
  },
  allocation: { 
    type: Number, 
    required: true,
    min: 0,
    max: 100
  },
  category: {
    type: String,
    required: true,
    enum: ['core', 'tactical', 'war_chest'],
    default: 'tactical'
  },
  timeHorizon: {
    type: String,
    enum: ['short', 'medium', 'long'],
    required: false
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN'
  },
  unrealizedPnL: {
    type: Number,
    default: 0
  },
  unrealizedPnLPercent: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    required: false,
    maxlength: 500
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'positions'
})

// Compound indexes for efficient queries
PositionSchema.index({ userId: 1, symbol: 1 }, { unique: true })
PositionSchema.index({ userId: 1, category: 1 })
PositionSchema.index({ userId: 1, lastUpdated: -1 })

// Pre-save middleware to calculate derived fields
PositionSchema.pre('save', function(next) {
  if (this.isModified('quantity') || this.isModified('currentPrice')) {
    this.marketValue = this.quantity * this.currentPrice
  }
  
  if (this.isModified('quantity') || this.isModified('avgCost') || this.isModified('currentPrice')) {
    const totalCost = this.quantity * this.avgCost
    this.gainLoss = this.marketValue - totalCost
    this.gainLossPercent = totalCost > 0 ? (this.gainLoss / totalCost) * 100 : 0
  }
  
  this.lastUpdated = new Date()
  next()
})

// Static methods
PositionSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId }).sort({ lastUpdated: -1 })
}

PositionSchema.statics.findByUserAndSymbol = function(userId: string, symbol: string) {
  return this.findOne({ userId, symbol: symbol.toUpperCase() })
}

PositionSchema.statics.getPortfolioSummary = async function(userId: string) {
  const positions = await this.find({ userId })
  
  const totalValue = positions.reduce((sum: number, pos: any) => sum + pos.marketValue, 0)
  const totalCost = positions.reduce((sum: number, pos: any) => sum + (pos.quantity * pos.avgCost), 0)
  const totalGainLoss = totalValue - totalCost
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0
  
  return {
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    positionCount: positions.length,
    positions
  }
}

PositionSchema.statics.calculatePortfolioMetrics = function(positions: IPosition[]) {
  const totalValue = positions.reduce((sum: number, pos: any) => sum + pos.marketValue, 0)
  const totalCost = positions.reduce((sum: number, pos: any) => sum + (pos.quantity * pos.avgCost), 0)
  const totalGainLoss = totalValue - totalCost
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0
  
  const categoryBreakdown = positions.reduce((acc: any, pos: any) => {
    if (!acc[pos.category]) {
      acc[pos.category] = { value: 0, count: 0 }
    }
    acc[pos.category].value += pos.marketValue
    acc[pos.category].count += 1
    return acc
  }, {})
  
  return {
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    categoryBreakdown,
    averageGainLoss: positions.length > 0 ? positions.reduce((sum: number, pos: any) => sum + pos.gainLossPercent, 0) / positions.length : 0
  }
}

// Additional static methods for API compatibility
PositionSchema.statics.findOpenPositions = function(userId: string) {
  return this.find({ userId, status: 'OPEN' }).sort({ lastUpdated: -1 })
}

PositionSchema.statics.findBySymbol = function(userId: string, symbol: string) {
  return this.findOne({ userId, symbol: symbol.toUpperCase() })
}

PositionSchema.statics.calculateTotalValue = function(positions: IPosition[]) {
  return positions.reduce((sum: number, pos: any) => sum + pos.marketValue, 0)
}

// Create and export the model
const Position = (mongoose.models.Position || mongoose.model<IPosition, IPositionModel>('Position', PositionSchema)) as IPositionModel

export default Position