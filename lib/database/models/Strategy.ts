import mongoose, { Schema, Document, Model } from 'mongoose'

export type StrategyType = 'MOMENTUM' | 'MEAN_REVERSION' | 'ARBITRAGE' | 'PAIRS' | 'VALUE' | 'GROWTH' | 'CUSTOM'
export type StrategyStatus = 'ACTIVE' | 'INACTIVE' | 'TESTING' | 'ARCHIVED'

export interface IStrategyParameter {
  name: string
  type: 'number' | 'string' | 'boolean' | 'array'
  value: any
  description?: string
  min?: number
  max?: number
}

export interface IBacktestResult {
  startDate: Date
  endDate: Date
  totalReturn: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  totalTrades: number
  profitFactor: number
  parameters: IStrategyParameter[]
  executedAt: Date
}

export interface IStrategy extends Document {
  strategyId: string
  userId: string
  name: string
  type: StrategyType
  description?: string
  status: StrategyStatus
  parameters: IStrategyParameter[]
  performance: {
    totalReturn: number
    sharpeRatio: number
    maxDrawdown: number
    winRate: number
    totalTrades: number
    profitFactor: number
    lastUpdated: Date
  }
  backtestResults: IBacktestResult[]
  rules: {
    entry: string[]
    exit: string[]
    riskManagement: string[]
  }
  allocation: {
    maxPositionSize: number
    maxPortfolioExposure: number
    targetAllocation: number
  }
  metadata?: {
    tags?: string[]
    notes?: string
    version?: number
  }
  createdAt: Date
  updatedAt: Date

  // Methods
  activate(): Promise<IStrategy>
  deactivate(): Promise<IStrategy>
  updateParameters(parameters: IStrategyParameter[]): Promise<IStrategy>
  addBacktestResult(result: IBacktestResult): Promise<IStrategy>
}

interface IStrategyModel extends Model<IStrategy> {
  calculateAveragePerformance(strategies: IStrategy[]): number
  findTopPerformers(limit?: number): Promise<IStrategy[]>
}

const StrategyParameterSchema = new Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['number', 'string', 'boolean', 'array'],
    required: true 
  },
  value: { type: Schema.Types.Mixed, required: true },
  description: String,
  min: Number,
  max: Number
}, { _id: false })

const BacktestResultSchema = new Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalReturn: { type: Number, required: true },
  sharpeRatio: { type: Number, required: true },
  maxDrawdown: { type: Number, required: true },
  winRate: { type: Number, required: true },
  totalTrades: { type: Number, required: true },
  profitFactor: { type: Number, required: true },
  parameters: [StrategyParameterSchema],
  executedAt: { type: Date, default: Date.now }
}, { _id: false })

const StrategySchema = new Schema<IStrategy>({
  strategyId: {
    type: String,
    required: true,
    unique: true,
    default: () => `STR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['MOMENTUM', 'MEAN_REVERSION', 'ARBITRAGE', 'PAIRS', 'VALUE', 'GROWTH', 'CUSTOM'],
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'TESTING', 'ARCHIVED'],
    default: 'INACTIVE',
    required: true,
    index: true
  },
  parameters: [StrategyParameterSchema],
  performance: {
    totalReturn: { type: Number, default: 0 },
    sharpeRatio: { type: Number, default: 0 },
    maxDrawdown: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    profitFactor: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  backtestResults: [BacktestResultSchema],
  rules: {
    entry: [String],
    exit: [String],
    riskManagement: [String]
  },
  allocation: {
    maxPositionSize: { 
      type: Number, 
      default: 0.1,
      min: 0.01,
      max: 1.0
    },
    maxPortfolioExposure: { 
      type: Number, 
      default: 0.5,
      min: 0.1,
      max: 1.0
    },
    targetAllocation: { 
      type: Number, 
      default: 0.2,
      min: 0.05,
      max: 1.0
    }
  },
  metadata: {
    tags: [String],
    notes: String,
    version: { type: Number, default: 1 }
  }
}, {
  timestamps: true,
  collection: 'strategies'
})

// Indexes
StrategySchema.index({ userId: 1, status: 1 })
StrategySchema.index({ type: 1, status: 1 })
StrategySchema.index({ 'performance.totalReturn': -1 })

// Instance methods
StrategySchema.methods.activate = async function(): Promise<IStrategy> {
  if (this.status === 'ARCHIVED') {
    throw new Error('Cannot activate archived strategy')
  }
  
  this.status = 'ACTIVE'
  return await this.save()
}

StrategySchema.methods.deactivate = async function(): Promise<IStrategy> {
  this.status = 'INACTIVE'
  return await this.save()
}

StrategySchema.methods.updateParameters = async function(
  parameters: IStrategyParameter[]
): Promise<IStrategy> {
  // Validate parameters
  for (const param of parameters) {
    if (param.type === 'number' && param.min !== undefined && param.max !== undefined) {
      if (param.value < param.min || param.value > param.max) {
        throw new Error(`Parameter ${param.name} value ${param.value} is out of range [${param.min}, ${param.max}]`)
      }
    }
  }
  
  this.parameters = parameters
  this.metadata.version = (this.metadata.version || 1) + 1
  
  return await this.save()
}

StrategySchema.methods.addBacktestResult = async function(
  result: IBacktestResult
): Promise<IStrategy> {
  this.backtestResults.push(result)
  
  // Keep only last 20 backtest results
  if (this.backtestResults.length > 20) {
    this.backtestResults = this.backtestResults.slice(-20)
  }
  
  // Update performance if this is the latest backtest
  if (result.executedAt >= this.performance.lastUpdated) {
    this.performance = {
      totalReturn: result.totalReturn,
      sharpeRatio: result.sharpeRatio,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
      totalTrades: result.totalTrades,
      profitFactor: result.profitFactor,
      lastUpdated: result.executedAt
    }
  }
  
  return await this.save()
}

// Static methods
StrategySchema.statics.findActiveStrategies = async function(
  userId?: string
): Promise<IStrategy[]> {
  const query: any = { status: 'ACTIVE' }
  if (userId) query.userId = userId
  
  return await this.find(query).sort({ 'performance.totalReturn': -1 })
}

StrategySchema.statics.findByType = async function(
  type: StrategyType,
  userId?: string
): Promise<IStrategy[]> {
  const query: any = { type }
  if (userId) query.userId = userId
  
  return await this.find(query).sort({ createdAt: -1 })
}

StrategySchema.statics.getTopPerformers = async function(
  limit: number = 10
): Promise<IStrategy[]> {
  return await this.find({ status: { $in: ['ACTIVE', 'INACTIVE'] } })
    .sort({ 'performance.totalReturn': -1 })
    .limit(limit)
}

// Additional static methods for API compatibility
StrategySchema.statics.calculateAveragePerformance = function(strategies: IStrategy[]): number {
  if (strategies.length === 0) return 0
  
  const totalReturn = strategies.reduce((sum, strategy) => {
    return sum + (strategy.performance?.totalReturn || 0)
  }, 0)
  
  return totalReturn / strategies.length
}

StrategySchema.statics.findTopPerformers = async function(limit: number = 5): Promise<IStrategy[]> {
  return await this.find({ status: 'ACTIVE' })
    .sort({ 'performance.totalReturn': -1 })
    .limit(limit)
}

// Instance method for adding backtest results
StrategySchema.methods.addBacktestResult = async function(result: IBacktestResult): Promise<IStrategy> {
  this.backtestResults.push(result)
  
  // Update performance metrics with latest backtest
  this.performance = {
    totalReturn: result.totalReturn,
    sharpeRatio: result.sharpeRatio,
    maxDrawdown: result.maxDrawdown,
    winRate: result.winRate,
    totalTrades: result.totalTrades,
    profitFactor: result.profitFactor,
    lastUpdated: new Date()
  }
  
  return await this.save()
}

// Export model
let Strategy: IStrategyModel

try {
  Strategy = mongoose.model<IStrategy, IStrategyModel>('Strategy')
} catch {
  Strategy = mongoose.model<IStrategy, IStrategyModel>('Strategy', StrategySchema)
}

export { Strategy }