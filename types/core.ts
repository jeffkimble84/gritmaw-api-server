/**
 * GRITMAW V2 - CORE TYPE DEFINITIONS
 * Single source of truth for all data models
 */

// ==========================================
// POSITION MANAGEMENT
// ==========================================

export interface Position {
  id: string
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
  lastUpdated: string
  timeHorizon?: 'short' | 'medium' | 'long'
  notes?: string
}

export interface PositionInput {
  symbol: string
  name?: string
  quantity: number
  avgCost: number
  category?: 'core' | 'tactical' | 'war_chest'
  timeHorizon?: 'short' | 'medium' | 'long'
  notes?: string
}

// ==========================================
// TRADING INTELLIGENCE
// ==========================================

export interface IntelligenceAlert {
  id: string
  type: 'info' | 'warning' | 'critical' | 'opportunity'
  title: string
  message: string
  confidence: number
  canOverride: boolean
  createdAt: string
  expiresAt?: string
  data?: Record<string, any>
}

export interface TradeIntent {
  action: 'buy' | 'sell' | 'trade_for'
  symbol: string
  quantity?: number
  amount?: number
  targetSymbol?: string
  reason?: string
  timestamp: Date
}

export interface ConsistencyResult {
  contradicts: boolean
  score: number
  details: string[]
  warnings: string[]
  recommendations: string[]
  alerts: IntelligenceAlert[]
}

// ==========================================
// CAPITAL ALLOCATION
// ==========================================

export interface CapitalAllocation {
  core: AllocationBucket
  tactical: AllocationBucket
  warChest: AllocationBucket
  totalCapital: number
}

export interface AllocationBucket {
  allocated: number
  used: number
  available: number
  positions: string[] // Position IDs
}

// ==========================================
// PORTFOLIO SUMMARY
// ==========================================

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  totalGainLoss: number
  totalGainLossPercent: number
  dayChange: number
  dayChangePercent: number
  positionCount: number
  allocation: CapitalAllocation
  lastUpdated: string
}

// ==========================================
// BEHAVIORAL RULES
// ==========================================

export interface BehavioralRule {
  id: string
  name: string
  description: string
  type: 'RULE' | 'GUIDELINE'
  active: boolean
  successRate: number
  violationAction: 'block' | 'warn' | 'suggest'
}

// ==========================================
// DECISION TRACKING
// ==========================================

export interface TradingDecision {
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
}

// ==========================================
// USER CONTEXT
// ==========================================

export interface UserProfile {
  id: string
  email: string
  name: string
  tradingStyle: 'conservative' | 'moderate' | 'aggressive'
  riskTolerance: number
  timeHorizon: 'short' | 'medium' | 'long'
  experience: 'beginner' | 'intermediate' | 'advanced'
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: 'dark' | 'light'
  notifications: boolean
  intelligenceLevel: 'minimal' | 'standard' | 'comprehensive'
  autoSaveDecisions: boolean
  showAdvancedMetrics: boolean
}

// ==========================================
// API RESPONSES
// ==========================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ==========================================
// COMPONENT PROPS
// ==========================================

export interface CardProps {
  variant?: 'default' | 'cyber' | 'trading' | 'intelligence'
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  glow?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
}

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}

// ==========================================
// UTILITY TYPES
// ==========================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export type SortDirection = 'asc' | 'desc'

export type TimeFrame = '1d' | '1w' | '1m' | '3m' | '6m' | '1y' | 'all'

// ==========================================
// CONSTANTS
// ==========================================

export const ALLOCATION_TARGETS = {
  CORE: 0.60,    // 60%
  TACTICAL: 0.25, // 25%
  WAR_CHEST: 0.15 // 15%
} as const

export const CONSISTENCY_THRESHOLDS = {
  HIGH_CONTRADICTION: 0.7,
  WARNING: 0.5,
  LOOKBACK_HOURS: 24
} as const

export const BEHAVIORAL_RULES = {
  FIVE_DAY_RETRACEMENT: 'five_day_retracement',
  NO_SELL_FOR_FUNDING: 'no_sell_for_funding',
  PARTIAL_PROFIT_TAKING: 'partial_profit_taking'
} as const

// ==========================================
// BEHAVIORAL FINANCE TYPES (V1 MIGRATION)
// ==========================================

export interface BehavioralEdge {
  id: string
  name: string
  description: string
  category: 'POSITIONING' | 'TIMING' | 'RISK' | 'SENTIMENT'
  confidence: number
  expectedImprovement: number
  implementationComplexity: 'LOW' | 'MEDIUM' | 'HIGH'
  triggerConditions: TriggerCondition[]
  actions: EdgeAction[]
  personaCompatibility: { [personaId: string]: number }
  effectiveness: { [marketCondition: string]: number }
  conflictsWith: string[]
  complexity: number
}

export interface TriggerCondition {
  type: 'MARKET_CONDITION' | 'TECHNICAL_INDICATOR' | 'TIME_BASED' | 'PORTFOLIO_STATE'
  parameter: string
  operator: 'GT' | 'LT' | 'EQ' | 'BETWEEN' | 'IN' | 'NOT_IN'
  value: any
  weight: number
}

export interface EdgeAction {
  type: 'ADJUST_PRICE' | 'MODIFY_SIZE' | 'DELAY_EXECUTION' | 'CANCEL_ORDER' | 'SPLIT_ORDER'
  parameters: { [key: string]: any }
  priority: number
}

export interface EdgeCluster {
  id: string
  name: string
  primaryEdge: string
  supportingEdges: string[]
  synergisticMultiplier: number
  requiredMarketConditions: MarketCondition[]
  conflictingEdges: string[]
  personaCompatibility: { [personaId: string]: number }
}

export interface TradePersona {
  id: string
  name: string
  description: string
  riskTolerance: number
  maxPositionSize: number
  volatilityComfort: number
  marketConditionPreference: MarketCondition[]
  behavioralEdgeAffinity: { [edgeId: string]: number }
  timeHorizonPreference: 'short' | 'medium' | 'long'
}

export type MarketCondition = 
  | 'TRENDING' 
  | 'SIDEWAYS' 
  | 'VOLATILE' 
  | 'LOW_VOLUME' 
  | 'HIGH_VOLUME' 
  | 'BULLISH' 
  | 'BEARISH' 
  | 'NEUTRAL'

export interface Catalyst {
  id: string
  symbol: string
  type: 'EARNINGS' | 'REGULATORY' | 'TECHNICAL' | 'FUNDAMENTAL'
  description: string
  probability: number
  expectedImpact: number
  timeHorizon: string
  dateExpected?: Date
  dateResolved?: Date
  actualImpact?: number
  status: 'PENDING' | 'HIT' | 'MISS' | 'EXPIRED'
  score: number
  createdBy?: string
  resolutionNotes?: string
}

export type ResearchCategory = 
  | 'MOMENTUM_BIASES'
  | 'MEAN_REVERSION'
  | 'VOLATILITY_PATTERNS'
  | 'SENTIMENT_ANOMALIES'
  | 'CALENDAR_EFFECTS'
  | 'MICROSTRUCTURE'
  | 'BEHAVIORAL_HEURISTICS'

// ==========================================
// INTELLIGENCE SYSTEM TYPES
// ==========================================

export interface IntelligenceEngine {
  id: string
  name: string
  type: 'CONSISTENCY_CHECKER' | 'CATALYST_SCORER' | 'PERSONA_ENGINE' | 'RESEARCH_PIPELINE'
  status: 'ACTIVE' | 'MAINTENANCE' | 'DISABLED'
  lastUpdated: Date
  performanceMetrics: {
    accuracy: number
    executionTime: number
    memoryUsage: number
    successRate: number
  }
}

export interface AutomationTrigger {
  id: string
  name: string
  type: 'QUEUE_SIZE' | 'TIME_BASED' | 'PERFORMANCE_BASED' | 'MARKET_EVENT'
  enabled: boolean
  condition: {
    type: 'THRESHOLD' | 'SCHEDULE' | 'EVENT' | 'COMBINATION'
    parameters: { [key: string]: any }
    evaluationFrequency: number
  }
  action: {
    type: 'REPLENISH_QUEUE' | 'DEPLOY_EDGE' | 'SEND_ALERT' | 'RUN_ANALYSIS'
    parameters: { [key: string]: any }
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  }
  lastTriggered?: Date
  triggerCount: number
  successRate: number
}