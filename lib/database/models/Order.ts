import mongoose, { Schema, Document, Model } from 'mongoose'

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
export type OrderSide = 'BUY' | 'SELL'
export type OrderStatus = 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK'

export interface IOrder extends Document {
  orderId: string
  userId: string
  symbol: string
  type: OrderType
  side: OrderSide
  quantity: number
  price?: number
  stopPrice?: number
  status: OrderStatus
  timeInForce: TimeInForce
  filledQuantity: number
  averagePrice?: number
  commission?: number
  executedAt?: Date
  createdAt: Date
  updatedAt: Date
  notes?: string
  metadata?: {
    source?: string
    strategyId?: string
    parentOrderId?: string
    tags?: string[]
  }

  // Methods
  cancel(): Promise<IOrder>
  update(updates: Partial<IOrder>): Promise<IOrder>
  checkFillStatus(): boolean
  isActive(): boolean
}

interface IOrderModel extends Model<IOrder> {
  findActiveOrders(userId: string): Promise<IOrder[]>
}

const OrderSchema = new Schema<IOrder>({
  orderId: {
    type: String,
    required: true,
    unique: true,
    default: () => `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  type: {
    type: String,
    enum: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'],
    required: true
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
    min: 0,
    required: function() {
      return this.type === 'LIMIT' || this.type === 'STOP_LIMIT'
    }
  },
  stopPrice: {
    type: Number,
    min: 0,
    required: function() {
      return this.type === 'STOP' || this.type === 'STOP_LIMIT'
    }
  },
  status: {
    type: String,
    enum: ['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'],
    default: 'PENDING',
    required: true,
    index: true
  },
  timeInForce: {
    type: String,
    enum: ['DAY', 'GTC', 'IOC', 'FOK'],
    default: 'DAY',
    required: true
  },
  filledQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  averagePrice: {
    type: Number,
    min: 0
  },
  commission: {
    type: Number,
    default: 0,
    min: 0
  },
  executedAt: Date,
  notes: String,
  metadata: {
    source: String,
    strategyId: String,
    parentOrderId: String,
    tags: [String]
  }
}, {
  timestamps: true,
  collection: 'orders'
})

// Indexes
OrderSchema.index({ userId: 1, status: 1 })
OrderSchema.index({ userId: 1, symbol: 1, createdAt: -1 })
OrderSchema.index({ status: 1, createdAt: -1 })

// Methods
OrderSchema.methods.cancel = async function(): Promise<IOrder> {
  if (['FILLED', 'CANCELLED', 'REJECTED'].includes(this.status)) {
    throw new Error(`Cannot cancel order with status: ${this.status}`)
  }
  
  this.status = 'CANCELLED'
  return await this.save()
}

OrderSchema.methods.update = async function(updates: Partial<IOrder>): Promise<IOrder> {
  // Only allow certain fields to be updated
  const allowedUpdates = ['price', 'stopPrice', 'quantity', 'timeInForce', 'notes']
  const updateKeys = Object.keys(updates)
  
  for (const key of updateKeys) {
    if (allowedUpdates.includes(key)) {
      this[key] = updates[key]
    }
  }
  
  return await this.save()
}

OrderSchema.methods.checkFillStatus = function(): boolean {
  return this.filledQuantity >= this.quantity
}

OrderSchema.methods.isActive = function(): boolean {
  return ['PENDING', 'OPEN', 'PARTIALLY_FILLED'].includes(this.status)
}

// Static methods
OrderSchema.statics.findActiveOrders = async function(userId: string): Promise<IOrder[]> {
  return await this.find({
    userId,
    status: { $in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] }
  }).sort({ createdAt: -1 })
}

OrderSchema.statics.findBySymbol = async function(userId: string, symbol: string): Promise<IOrder[]> {
  return await this.find({ userId, symbol }).sort({ createdAt: -1 })
}

// Pre-save middleware
OrderSchema.pre('save', function(next) {
  // Update status based on filled quantity
  if (this.filledQuantity > 0 && this.filledQuantity < this.quantity) {
    this.status = 'PARTIALLY_FILLED'
  } else if (this.filledQuantity >= this.quantity) {
    this.status = 'FILLED'
    if (!this.executedAt) {
      this.executedAt = new Date()
    }
  }
  
  next()
})

// Export model
let Order: IOrderModel

try {
  Order = mongoose.model<IOrder, IOrderModel>('Order')
} catch {
  Order = mongoose.model<IOrder, IOrderModel>('Order', OrderSchema)
}

export { Order }