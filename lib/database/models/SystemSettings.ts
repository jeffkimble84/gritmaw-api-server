import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  settingsId: string;
  category: 'TRADING' | 'RESEARCH' | 'AI' | 'SECURITY' | 'PERFORMANCE';
  
  // Trading settings
  tradingConfig?: {
    defaultPositionSize: number;
    maxPositionSize: number;
    riskTolerance: number;
    capitalAllocation: {
      corePercentage: number;
      tacticalPercentage: number;
      warChestPercentage: number;
    };
    consistencyCheckEnabled: boolean;
    autoTradeEnabled: boolean;
    stopLossThreshold: number;
  };
  
  // Research settings
  researchConfig?: {
    autoResearchEnabled: boolean;
    minQueueSize: number;
    targetQueueSize: number;
    researchVelocity: number;
    confidenceThreshold: number;
    statisticalSignificanceRequired: number;
    biasDiscoveryFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  };
  
  // AI settings
  aiConfig?: {
    claudeModel: string;
    maxTokensPerRequest: number;
    temperature: number;
    analysisDepth: 'BASIC' | 'STANDARD' | 'COMPREHENSIVE';
    autoEdgeDeployment: boolean;
    edgeConfidenceThreshold: number;
  };
  
  // Security settings
  securityConfig?: {
    sessionTimeout: number;
    maxFailedLogins: number;
    require2fa: boolean;
    apiRateLimit: number;
    auditLogRetention: number;
  };
  
  // Performance settings
  performanceConfig?: {
    cacheDuration: number;
    maxConcurrentRequests: number;
    databaseConnectionPoolSize: number;
    monitoringEnabled: boolean;
    alertThresholds: {
      cpuUsage: number;
      memoryUsage: number;
      responseTime: number;
    };
  };
  
  // Metadata
  createdBy?: string;
  lastModifiedBy?: string;
  isActive: boolean;
  version: number;
  description?: string;
}

const SystemSettingsSchema = new Schema<ISystemSettings>({
  settingsId: {
    type: String,
    required: true,
    unique: true,
    default: () => `settings_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  },
  category: {
    type: String,
    enum: ['TRADING', 'RESEARCH', 'AI', 'SECURITY', 'PERFORMANCE'],
    required: true
  },
  tradingConfig: {
    defaultPositionSize: { type: Number, min: 0.01, max: 1.0 },
    maxPositionSize: { type: Number, min: 0.01, max: 1.0 },
    riskTolerance: { type: Number, min: 0.1, max: 1.0 },
    capitalAllocation: {
      corePercentage: { type: Number, min: 50, max: 70, default: 60 },
      tacticalPercentage: { type: Number, min: 20, max: 35, default: 25 },
      warChestPercentage: { type: Number, min: 10, max: 20, default: 15 }
    },
    consistencyCheckEnabled: { type: Boolean, default: true },
    autoTradeEnabled: { type: Boolean, default: false },
    stopLossThreshold: { type: Number, min: 0.01, max: 0.5, default: 0.1 }
  },
  researchConfig: {
    autoResearchEnabled: { type: Boolean, default: true },
    minQueueSize: { type: Number, min: 5, max: 20, default: 10 },
    targetQueueSize: { type: Number, min: 10, max: 50, default: 15 },
    researchVelocity: { type: Number, min: 1, max: 10, default: 2 },
    confidenceThreshold: { type: Number, min: 0.5, max: 1.0, default: 0.8 },
    statisticalSignificanceRequired: { type: Number, min: 0.8, max: 0.99, default: 0.95 },
    biasDiscoveryFrequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
      default: 'WEEKLY'
    }
  },
  aiConfig: {
    claudeModel: { type: String, default: 'claude-3-sonnet-20240229' },
    maxTokensPerRequest: { type: Number, min: 1000, max: 8192, default: 4096 },
    temperature: { type: Number, min: 0.0, max: 1.0, default: 0.3 },
    analysisDepth: {
      type: String,
      enum: ['BASIC', 'STANDARD', 'COMPREHENSIVE'],
      default: 'STANDARD'
    },
    autoEdgeDeployment: { type: Boolean, default: false },
    edgeConfidenceThreshold: { type: Number, min: 0.7, max: 1.0, default: 0.9 }
  },
  securityConfig: {
    sessionTimeout: { type: Number, min: 900, max: 86400, default: 3600 }, // seconds
    maxFailedLogins: { type: Number, min: 3, max: 10, default: 5 },
    require2fa: { type: Boolean, default: true },
    apiRateLimit: { type: Number, min: 10, max: 1000, default: 100 }, // requests per minute
    auditLogRetention: { type: Number, min: 30, max: 365, default: 90 } // days
  },
  performanceConfig: {
    cacheDuration: { type: Number, min: 60, max: 3600, default: 300 }, // seconds
    maxConcurrentRequests: { type: Number, min: 10, max: 100, default: 50 },
    databaseConnectionPoolSize: { type: Number, min: 5, max: 50, default: 20 },
    monitoringEnabled: { type: Boolean, default: true },
    alertThresholds: {
      cpuUsage: { type: Number, min: 0.5, max: 1.0, default: 0.8 },
      memoryUsage: { type: Number, min: 0.5, max: 1.0, default: 0.85 },
      responseTime: { type: Number, min: 100, max: 5000, default: 1000 } // milliseconds
    }
  },
  createdBy: String,
  lastModifiedBy: String,
  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  description: String
}, {
  timestamps: true,
  collection: 'system_settings'
});

// Indexes for efficient querying
SystemSettingsSchema.index({ category: 1, isActive: 1 });
SystemSettingsSchema.index({ settingsId: 1 });
SystemSettingsSchema.index({ version: -1 });

// Validation to ensure capital allocation percentages sum to 100
SystemSettingsSchema.pre('save', function(next) {
  if (this.tradingConfig?.capitalAllocation) {
    const { corePercentage, tacticalPercentage, warChestPercentage } = this.tradingConfig.capitalAllocation;
    const total = corePercentage + tacticalPercentage + warChestPercentage;
    
    if (Math.abs(total - 100) > 1) { // Allow 1% tolerance
      return next(new Error(`Capital allocation percentages must sum to 100%, got ${total}%`));
    }
  }
  next();
});

export default mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);