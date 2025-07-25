import mongoose, { Schema, Document, Model } from 'mongoose'

export type TradeSide = 'BUY' | 'SELL'
export type TradeStatus = 'EXECUTED' | 'CANCELLED' | 'FAILED'

interface ITradeModel extends Model<ITrade> {
  findByUser(userId: string, options?: { startDate?: Date; endDate?: Date; symbol?: string }): Promise<ITrade[]>
  findBySymbol(userId: string, symbol: string, options?: { startDate?: Date; endDate?: Date }): Promise<ITrade[]>
  calculatePnL(trades: ITrade[]): { realized: number; fees: number; net: number }
  getWinRate(userId: string, startDate?: Date): Promise<number>
  getDailyVolume(userId: string, date: Date): Promise<number>
}

export interface ITrade extends Document {
  tradeId: string
  userId: string
  orderId?: string
  symbol: string
  side: TradeSide
  quantity: number
  price: number
  commission: number
  fees: number
  executedAt: Date
  status: TradeStatus
  performance?: {
    entryPrice?: number
    exitPrice?: number
    profit?: number
    profitPercent?: number
    holdingPeriod?: number // in hours
  }
  metadata?: {
    strategyId?: string
    notes?: string
    tags?: string[]
    source?: string
  }

  // Methods
  calculateProfit(exitTrade?: ITrade): number
  updatePerformance(exitPrice: number): Promise<ITrade>
}

interface ITradeModel extends Model<ITrade> {
  findByUser(userId: string, options?: { startDate?: Date; endDate?: Date; symbol?: string }): Promise<ITrade[]>
  findBySymbol(userId: string, symbol: string, options?: { startDate?: Date; endDate?: Date }): Promise<ITrade[]>
  calculatePnL(trades: ITrade[]): { realized: number; fees: number; net: number }
  getWinRate(userId: string, startDate?: Date): Promise<number>
  getDailyVolume(userId: string, date: Date): Promise<number>
}

const TradeSchema = new Schema<ITrade>({
  tradeId: {
    type: String,
    required: true,
    unique: true,
    default: () => `TRD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  orderId: String,
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  commission: {
    type: Number,
    default: 0,
    min: 0
  },
  fees: {
    type: Number,
    default: 0,
    min: 0
  },
  executedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['EXECUTED', 'CANCELLED', 'FAILED'],
    default: 'EXECUTED',
    required: true
  },
  performance: {
    entryPrice: Number,
    exitPrice: Number,
    profit: Number,
    profitPercent: Number,
    holdingPeriod: Number
  },
  metadata: {
    strategyId: String,
    notes: String,
    tags: [String],
    source: String
  }
}, {
  timestamps: true,
  collection: 'trades'
})

// Indexes
TradeSchema.index({ userId: 1, executedAt: -1 })
TradeSchema.index({ userId: 1, symbol: 1, executedAt: -1 })
TradeSchema.index({ executedAt: -1 })

// Instance methods
TradeSchema.methods.calculateProfit = function(exitTrade?: ITrade): number {
  if (!exitTrade) return 0
  
  if (this.side === 'BUY' && exitTrade.side === 'SELL') {
    const totalCost = (this.price * this.quantity) + this.commission + this.fees
    const totalRevenue = (exitTrade.price * exitTrade.quantity) - exitTrade.commission - exitTrade.fees
    return totalRevenue - totalCost
  } else if (this.side === 'SELL' && exitTrade.side === 'BUY') {
    const totalRevenue = (this.price * this.quantity) - this.commission - this.fees
    const totalCost = (exitTrade.price * exitTrade.quantity) + exitTrade.commission + exitTrade.fees
    return totalRevenue - totalCost
  }
  
  return 0
}

TradeSchema.methods.updatePerformance = async function(exitPrice: number): Promise<ITrade> {
  const profit = this.side === 'BUY' 
    ? (exitPrice - this.price) * this.quantity - this.commission - this.fees
    : (this.price - exitPrice) * this.quantity - this.commission - this.fees
    
  const profitPercent = (profit / (this.price * this.quantity)) * 100
  
  this.performance = {
    entryPrice: this.price,
    exitPrice: exitPrice,
    profit: profit,
    profitPercent: profitPercent,
    holdingPeriod: 0 // Would be calculated based on exit trade time
  }
  
  return await this.save()
}

// Static methods
TradeSchema.statics.findByUser = async function(
  userId: string, 
  options?: { startDate?: Date; endDate?: Date; symbol?: string }
): Promise<ITrade[]> {
  const query: any = { userId }
  
  if (options?.startDate || options?.endDate) {
    query.executedAt = {}
    if (options.startDate) query.executedAt.$gte = options.startDate
    if (options.endDate) query.executedAt.$lte = options.endDate
  }
  
  if (options?.symbol) {
    query.symbol = options.symbol
  }
  
  return await this.find(query).sort({ executedAt: -1 })
}

TradeSchema.statics.findBySymbol = async function(
  userId: string,
  symbol: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<ITrade[]> {
  const query: any = { userId, symbol }
  
  if (options?.startDate || options?.endDate) {
    query.executedAt = {}
    if (options.startDate) query.executedAt.$gte = options.startDate
    if (options.endDate) query.executedAt.$lte = options.endDate
  }
  
  return await this.find(query).sort({ executedAt: -1 })
}

TradeSchema.statics.calculatePnL = function(trades: ITrade[]): {
  realized: number
  fees: number
  net: number
} {
  const result = trades.reduce((acc, trade) => {
    const profit = trade.performance?.profit || 0
    const totalFees = trade.commission + trade.fees
    
    return {
      realized: acc.realized + profit,
      fees: acc.fees + totalFees,
      net: acc.net + profit - totalFees
    }
  }, { realized: 0, fees: 0, net: 0 })
  
  return result
}

TradeSchema.statics.getWinRate = async function(
  userId: string,
  startDate?: Date
): Promise<number> {
  const query: any = { 
    userId,
    'performance.profit': { $exists: true }
  }
  
  if (startDate) {
    query.executedAt = { $gte: startDate }
  }
  
  const trades = await this.find(query)
  
  if (trades.length === 0) return 0
  
  const winningTrades = trades.filter((t: ITrade) => (t.performance?.profit || 0) > 0)
  return (winningTrades.length / trades.length) * 100
}

TradeSchema.statics.getDailyVolume = async function(
  userId: string,
  date: Date
): Promise<number> {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)
  
  const trades = await this.find({
    userId,
    executedAt: { $gte: startOfDay, $lte: endOfDay }
  })
  
  return trades.reduce((volume: number, trade: ITrade) => volume + (trade.price * trade.quantity), 0)
}

// Export model
const Trade = (mongoose.models.Trade || mongoose.model<ITrade, ITradeModel>('Trade', TradeSchema)) as ITradeModel

export { Trade }