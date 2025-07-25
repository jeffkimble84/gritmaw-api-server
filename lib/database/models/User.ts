/**
 * User Database Model
 * Supports NextAuth.js authentication with role-based access control
 */

import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IUser extends Document {
  name?: string
  email: string
  emailVerified?: Date
  image?: string
  role: 'SUPER_ADMIN' | 'INSTITUTIONAL_TRADER' | 'RETAIL_TRADER' | 'PENDING'
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'INACTIVE'
  invitationCode?: string
  invitedBy?: mongoose.Types.ObjectId
  approvedBy?: mongoose.Types.ObjectId
  approvedAt?: Date
  tradingProfile?: {
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH'
    preferredStrategy: string[]
    maxPositionSize: number
    experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
    tradingStyle: 'conservative' | 'moderate' | 'aggressive'
    timeHorizon: 'short' | 'medium' | 'long'
  }
  preferences?: {
    theme: 'dark' | 'light'
    notifications: boolean
    intelligenceLevel: 'minimal' | 'standard' | 'comprehensive'
    autoSaveDecisions: boolean
    showAdvancedMetrics: boolean
  }
  createdAt: Date
  updatedAt: Date
  canAccess(requiredRole: string): boolean
  isActive(): boolean
}

interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>
  findActiveUsers(): Promise<IUser[]>
  findPendingUsers(): Promise<IUser[]>
}

const UserSchema: Schema = new Schema({
  name: { 
    type: String,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true
  },
  emailVerified: { 
    type: Date 
  },
  image: { 
    type: String 
  },
  role: { 
    type: String, 
    required: true,
    enum: ['SUPER_ADMIN', 'INSTITUTIONAL_TRADER', 'RETAIL_TRADER', 'PENDING'],
    default: 'PENDING'
  },
  status: {
    type: String,
    required: true,
    enum: ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'INACTIVE'],
    default: 'PENDING_APPROVAL'
  },
  invitationCode: {
    type: String,
    sparse: true,
    index: true
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  tradingProfile: {
    riskTolerance: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM'
    },
    preferredStrategy: [{
      type: String
    }],
    maxPositionSize: {
      type: Number,
      min: 0,
      default: 10000
    },
    experienceLevel: {
      type: String,
      enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
      default: 'INTERMEDIATE'
    },
    tradingStyle: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    timeHorizon: {
      type: String,
      enum: ['short', 'medium', 'long'],
      default: 'medium'
    }
  },
  preferences: {
    theme: {
      type: String,
      enum: ['dark', 'light'],
      default: 'dark'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    intelligenceLevel: {
      type: String,
      enum: ['minimal', 'standard', 'comprehensive'],
      default: 'standard'
    },
    autoSaveDecisions: {
      type: Boolean,
      default: true
    },
    showAdvancedMetrics: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  collection: 'users'
})

// Indexes
UserSchema.index({ email: 1 }, { unique: true })
UserSchema.index({ role: 1, status: 1 })
UserSchema.index({ invitationCode: 1 }, { sparse: true })
UserSchema.index({ createdAt: -1 })

// Instance methods
UserSchema.methods.canAccess = function(requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'SUPER_ADMIN': 4,
    'INSTITUTIONAL_TRADER': 3,
    'RETAIL_TRADER': 2,
    'PENDING': 1
  }
  
  return roleHierarchy[this.role] >= roleHierarchy[requiredRole]
}

UserSchema.methods.isActive = function(): boolean {
  return this.status === 'ACTIVE'
}

// Static methods
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() })
}

UserSchema.statics.findActiveUsers = function() {
  return this.find({ status: 'ACTIVE' }).sort({ createdAt: -1 })
}

UserSchema.statics.findPendingUsers = function() {
  return this.find({ status: 'PENDING_APPROVAL' }).sort({ createdAt: -1 })
}

// Create and export the model
const User = (mongoose.models.User || mongoose.model<IUser, IUserModel>('User', UserSchema)) as IUserModel

export default User