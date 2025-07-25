import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ICatalyst extends Document {
  catalystId: string
  symbol: string
  catalystType: 'EARNINGS' | 'REGULATORY' | 'TECHNICAL' | 'FUNDAMENTAL'
  description: string
  probability: number
  expectedImpact: number
  timeHorizon: string
  dateExpected?: Date
  dateResolved?: Date
  actualImpact?: number
  status: 'PENDING' | 'HIT' | 'MISS' | 'EXPIRED'
  score?: number
  createdBy?: string
  resolutionNotes?: string

  // Method declarations
  checkExpiration(): boolean
  resolve(actualImpact: number, hitOrMiss: 'HIT' | 'MISS', notes?: string): Promise<ICatalyst>
}

const CatalystSchema = new Schema<ICatalyst>({
  catalystId: {
    type: String,
    required: true,
    unique: true,
    default: () => `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  catalystType: {
    type: String,
    enum: ['EARNINGS', 'REGULATORY', 'TECHNICAL', 'FUNDAMENTAL'],
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  probability: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  expectedImpact: {
    type: Number,
    required: true,
    min: -100,
    max: 100
  },
  timeHorizon: {
    type: String,
    required: true
  },
  dateExpected: Date,
  dateResolved: Date,
  actualImpact: Number,
  status: {
    type: String,
    enum: ['PENDING', 'HIT', 'MISS', 'EXPIRED'],
    default: 'PENDING',
    required: true
  },
  score: {
    type: Number,
    min: 0,
    max: 10
  },
  createdBy: String,
  resolutionNotes: String
}, {
  timestamps: true,
  collection: 'catalysts'
})

// Indexes for efficient querying
CatalystSchema.index({ catalystId: 1 })
CatalystSchema.index({ symbol: 1 })
CatalystSchema.index({ status: 1 })
CatalystSchema.index({ score: -1 })
CatalystSchema.index({ dateExpected: 1 })

// Calculate catalyst score before saving
CatalystSchema.pre('save', function(next) {
  if (this.isModified('probability') || this.isModified('expectedImpact') || this.isModified('timeHorizon')) {
    this.score = calculateScore(this)
  }
  next()
})

// Mathematical framework for catalyst scoring
function calculateScore(catalyst: ICatalyst): number {
  const { probability, expectedImpact, timeHorizon, catalystType } = catalyst
  
  // Base components
  const strength = Math.abs(expectedImpact) / 100 // Normalize to 0-1
  const confidence = probability
  
  // Time decay factor (closer events score higher)
  let timeDecay = 1.0
  if (timeHorizon.includes('day')) {
    const days = parseInt(timeHorizon) || 1
    timeDecay = Math.max(0.3, 1 - (days / 30)) // Decay over 30 days
  } else if (timeHorizon.includes('week')) {
    const weeks = parseInt(timeHorizon) || 1
    timeDecay = Math.max(0.2, 1 - (weeks / 8)) // Decay over 8 weeks
  } else if (timeHorizon.includes('month')) {
    const months = parseInt(timeHorizon) || 1
    timeDecay = Math.max(0.1, 1 - (months / 6)) // Decay over 6 months
  }
  
  // Risk adjustment based on catalyst type
  let riskMultiplier = 1.0
  switch (catalystType) {
    case 'REGULATORY':
      riskMultiplier = 1.2 // Higher risk, higher reward
      break
    case 'EARNINGS':
      riskMultiplier = 1.0 // Standard risk
      break
    case 'TECHNICAL':
      riskMultiplier = 0.8 // Lower risk, more predictable
      break
    case 'FUNDAMENTAL':
      riskMultiplier = 0.9 // Moderate risk
      break
  }
  
  // Calculate final score (0-10 scale)
  const rawScore = (strength * confidence * timeDecay * riskMultiplier)
  return Math.round(rawScore * 10 * 10) / 10 // Round to 1 decimal
}

// Method to check if catalyst has expired
CatalystSchema.methods.checkExpiration = function(): boolean {
  if (this.status !== 'PENDING' || !this.dateExpected) {
    return false
  }
  
  const now = new Date()
  const graceperiod = 24 * 60 * 60 * 1000 // 24 hours grace period
  
  return now > new Date(this.dateExpected.getTime() + graceperiod)
}

// Method to resolve catalyst
CatalystSchema.methods.resolve = async function(
  actualImpact: number,
  hitOrMiss: 'HIT' | 'MISS',
  notes?: string
): Promise<ICatalyst> {
  this.actualImpact = actualImpact
  this.status = hitOrMiss
  this.dateResolved = new Date()
  if (notes) {
    this.resolutionNotes = notes
  }
  
  return await this.save()
}

// Static method to find high-scoring opportunities
CatalystSchema.statics.findOpportunities = async function(
  minScore: number = 7.0
): Promise<ICatalyst[]> {
  return await this.find({
    status: 'PENDING',
    score: { $gte: minScore }
  }).sort({ score: -1 })
}

// Export the model
let Catalyst: Model<ICatalyst>

try {
  Catalyst = mongoose.model<ICatalyst>('Catalyst')
} catch {
  Catalyst = mongoose.model<ICatalyst>('Catalyst', CatalystSchema)
}

export { Catalyst }