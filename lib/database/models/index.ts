/**
 * Database Models Index
 * Centralized export for all database models
 */

// Core V2 models
export { default as Position, type IPosition } from './Position'
export { default as User, type IUser } from './User'  
export { default as TradingDecision, type ITradingDecision } from './TradingDecision'

// Trading models
export { Order, type IOrder } from './Order'
export { Trade, type ITrade } from './Trade'
export { Strategy, type IStrategy } from './Strategy'

// Intelligence system models migrated from V1
export { default as BehavioralEdge, type IBehavioralEdge } from './BehavioralEdge'
export { Catalyst, type ICatalyst } from './Catalyst'
export { PortfolioState, type IPortfolioState } from './PortfolioState'
export { default as ResearchSession, type IResearchSession } from './ResearchSession'
export { default as SystemSettings, type ISystemSettings } from './SystemSettings'

// New flexible research models
export { ResearchPatternModel, type IResearchPattern } from './ResearchPattern'
export { PatternClusterModel, type IPatternCluster } from './PatternCluster'
export { ResearchContextModel, type IResearchContext } from './ResearchContext'