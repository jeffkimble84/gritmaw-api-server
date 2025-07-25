/**
 * GRITMAW V2 - SERVICES INDEX
 * Central export for all intelligence and automation services
 */

// Core services
export { ConsistencyChecker } from './ConsistencyChecker';
export { claudeService, ClaudeService } from './ClaudeService';
export { personaEngine, PersonaEngine } from './PersonaEngine';
export { researchIngestionSystem, ResearchIngestionSystem } from './ResearchIngestionSystem';
export { automationEngine, AutomationEngine } from './AutomationEngine';

// New intelligent services
export { PatternClusteringEngine } from './PatternClusteringEngine';
export { ResearchContextService } from './ResearchContextService';

// Re-export types
export type {
  // Claude Service types
  ClaudeAnalysisRequest,
  ClaudeAnalysisResponse,
  BiasHypothesis,
  ResearchDiscoveryResult,
  MarketInsight,
  EdgeOptimizationResult,
  TrendAnalysisResult,
  
} from './ClaudeService';

export type {
  // Persona Engine types
  OpportunityScore,
  PersonaCompatibilityResult,
  EdgeSelectionResult,
  PersonaConfiguration
} from './PersonaEngine';

export type {
  // Research Ingestion types
  ResearchReport,
  ResearchFindings,
  BacktestResults,
  ApplicabilityScore,
  ValidationResult,
  ValidationIssue,
  EdgeImplementation
} from './ResearchIngestionSystem';

export type {
  // Automation Engine types
  AutomationEvent,
  QueueMetrics,
  SmartThreshold
} from './AutomationEngine';

export type {
  DecisionInput
} from './ConsistencyChecker';