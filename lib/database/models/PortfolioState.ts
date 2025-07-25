import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IPortfolioState extends Document {
  timestamp: Date
  userId?: string
  totalCapital: number
  positions: Array<{
    symbol: string
    quantity: number
    avgCost: number
    currentPrice: number
    marketValue: number
    unrealizedPnl: number
    allocationBucket: 'core' | 'tactical' | 'war_chest'
    timeHorizon: 'short' | 'medium' | 'long'
    entryDate: Date
    lastUpdated: Date
  }>
  capitalAllocation: {
    coreHoldings: {
      allocated: number
      used: number
      available: number
      percentage: number
    }
    tacticalPlays: {
      allocated: number
      used: number
      available: number
      percentage: number
    }
    warChest: {
      allocated: number
      used: number
      available: number
      percentage: number
    }
  }
  riskMetrics: {
    portfolioBeta: number
    maxDrawdown: number
    sharpeRatio: number
    concentrationRisk: number
    var95: number
  }
  performanceMetrics: {
    totalReturn: number
    dailyReturn: number
    weeklyReturn: number
    monthlyReturn: number
    winRate: number
    avgWin: number
    avgLoss: number
    profitFactor: number
  }
  compliance: {
    capitalDisciplineCompliant: boolean
    violations: string[]
    lastCheck: Date
  }
  
  // Method declarations
  validateCapitalDiscipline(): { compliant: boolean; violations: string[] }
  calculateMetrics(): void
}

const PortfolioStateSchema = new Schema<IPortfolioState>({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  userId: String,
  totalCapital: {
    type: Number,
    required: true,
    min: 0
  },
  positions: [{
    symbol: {
      type: String,
      required: true,
      uppercase: true
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
    unrealizedPnl: {
      type: Number,
      required: true
    },
    allocationBucket: {
      type: String,
      enum: ['core', 'tactical', 'war_chest'],
      required: true
    },
    timeHorizon: {
      type: String,
      enum: ['short', 'medium', 'long'],
      required: true
    },
    entryDate: {
      type: Date,
      required: true
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  capitalAllocation: {
    coreHoldings: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      percentage: { type: Number, required: true }
    },
    tacticalPlays: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      percentage: { type: Number, required: true }
    },
    warChest: {
      allocated: { type: Number, required: true },
      used: { type: Number, required: true },
      available: { type: Number, required: true },
      percentage: { type: Number, required: true }
    }
  },
  riskMetrics: {
    portfolioBeta: { type: Number, default: 1.0 },
    maxDrawdown: { type: Number, default: 0 },
    sharpeRatio: { type: Number, default: 0 },
    concentrationRisk: { type: Number, default: 0 },
    var95: { type: Number, default: 0 }
  },
  performanceMetrics: {
    totalReturn: { type: Number, default: 0 },
    dailyReturn: { type: Number, default: 0 },
    weeklyReturn: { type: Number, default: 0 },
    monthlyReturn: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    avgWin: { type: Number, default: 0 },
    avgLoss: { type: Number, default: 0 },
    profitFactor: { type: Number, default: 0 }
  },
  compliance: {
    capitalDisciplineCompliant: { type: Boolean, default: true },
    violations: [String],
    lastCheck: { type: Date, default: Date.now }
  }
}, {
  timestamps: true,
  collection: 'portfolio_states'
})

// Indexes for efficient querying
PortfolioStateSchema.index({ timestamp: -1 })
PortfolioStateSchema.index({ userId: 1, timestamp: -1 })
PortfolioStateSchema.index({ 'compliance.capitalDisciplineCompliant': 1 })

// Method to validate capital discipline (60/25/15 rule)
PortfolioStateSchema.methods.validateCapitalDiscipline = function(): { compliant: boolean; violations: string[] } {
  const violations: string[] = []
  
  const { coreHoldings, tacticalPlays, warChest } = this.capitalAllocation
  const totalCapital = this.totalCapital
  
  // Check percentage allocations
  const corePercent = (coreHoldings.allocated / totalCapital) * 100
  const tacticalPercent = (tacticalPlays.allocated / totalCapital) * 100
  const warChestPercent = (warChest.allocated / totalCapital) * 100
  
  if (Math.abs(corePercent - 60) > 5) {
    violations.push(`Core allocation ${corePercent.toFixed(1)}% deviates from 60% target`)
  }
  if (Math.abs(tacticalPercent - 25) > 5) {
    violations.push(`Tactical allocation ${tacticalPercent.toFixed(1)}% deviates from 25% target`)
  }
  if (Math.abs(warChestPercent - 15) > 5) {
    violations.push(`War chest allocation ${warChestPercent.toFixed(1)}% deviates from 15% target`)
  }
  
  // Check for over-allocation
  if (coreHoldings.used > coreHoldings.allocated) {
    violations.push('Core holdings exceed allocated capital')
  }
  if (tacticalPlays.used > tacticalPlays.allocated) {
    violations.push('Tactical plays exceed allocated capital')
  }
  if (warChest.used > warChest.allocated) {
    violations.push('War chest usage exceeds allocated capital')
  }
  
  return {
    compliant: violations.length === 0,
    violations
  }
}

// Method to calculate position metrics
PortfolioStateSchema.methods.calculateMetrics = function() {
  // Recalculate market values and PnL
  this.positions.forEach((position: any) => {
    position.marketValue = position.quantity * position.currentPrice
    position.unrealizedPnl = (position.currentPrice - position.avgCost) * position.quantity
  })
  
  // Recalculate capital usage by bucket
  const buckets: Record<string, { used: number }> = {
    core: { used: 0 },
    tactical: { used: 0 },
    war_chest: { used: 0 }
  }
  
  this.positions.forEach((position: any) => {
    if (buckets[position.allocationBucket]) {
      buckets[position.allocationBucket].used += position.marketValue
    }
  })
  
  // Update capital allocation
  this.capitalAllocation.coreHoldings.used = buckets.core.used
  this.capitalAllocation.coreHoldings.available = this.capitalAllocation.coreHoldings.allocated - buckets.core.used
  
  this.capitalAllocation.tacticalPlays.used = buckets.tactical.used
  this.capitalAllocation.tacticalPlays.available = this.capitalAllocation.tacticalPlays.allocated - buckets.tactical.used
  
  this.capitalAllocation.warChest.used = buckets.war_chest.used
  this.capitalAllocation.warChest.available = this.capitalAllocation.warChest.allocated - buckets.war_chest.used
}

// Pre-save hook to calculate metrics and validate
PortfolioStateSchema.pre('save', function(next) {
  this.calculateMetrics()
  
  const validation = this.validateCapitalDiscipline()
  this.compliance.capitalDisciplineCompliant = validation.compliant
  this.compliance.violations = validation.violations
  this.compliance.lastCheck = new Date()
  
  next()
})

// Static method to get latest portfolio state
PortfolioStateSchema.statics.getLatest = async function(userId?: string): Promise<IPortfolioState | null> {
  const query = userId ? { userId: userId } : {}
  return await this.findOne(query).sort({ timestamp: -1 })
}

// Export the model
let PortfolioState: Model<IPortfolioState>

try {
  PortfolioState = mongoose.model<IPortfolioState>('PortfolioState')
} catch {
  PortfolioState = mongoose.model<IPortfolioState>('PortfolioState', PortfolioStateSchema)
}

export { PortfolioState }