import { EventEmitter } from 'events';
import { 
  ResearchPatternModel, 
  PatternClusterModel, 
  ResearchContextModel,
  type IResearchPattern,
  type IPatternCluster,
  type IResearchContext
} from '@/lib/database/models';
import { claudeService } from './ClaudeService';

interface FeatureVector {
  patternId: string;
  vector: number[];
  metadata: {
    dimensions: string[];
    timestamp: Date;
  };
}

interface SimilarityScore {
  pattern1: string;
  pattern2: string;
  score: number;
  dimensions: Map<string, number>;
}

interface ClusteringResult {
  clusterId: string;
  confidence: number;
  membershipScore: number;
  reasoning: string;
}

interface PatternApplication {
  patternId: string;
  clusterId: string;
  context: any;
  confidence: number;
  suggestedParameters: Map<string, any>;
}

export class PatternClusteringEngine extends EventEmitter {
  private static instance: PatternClusteringEngine;
  private featureCache: Map<string, FeatureVector> = new Map();
  private clusterCache: Map<string, IPatternCluster> = new Map();
  private similarityThreshold = 0.7;
  private minClusterSize = 2;
  private maxClusterRadius = 0.5;

  private constructor() {
    super();
  }

  static getInstance(): PatternClusteringEngine {
    if (!PatternClusteringEngine.instance) {
      PatternClusteringEngine.instance = new PatternClusteringEngine();
    }
    return PatternClusteringEngine.instance;
  }

  /**
   * Main entry point for ingesting new patterns
   */
  async ingestPattern(pattern: IResearchPattern): Promise<ClusteringResult> {
    console.log(`🧠 Ingesting pattern: ${pattern.pattern.name}`);

    try {
      // Extract semantic features
      const features = await this.extractSemanticFeatures(pattern);
      
      // Find similar patterns
      const similarities = await this.findSimilarPatterns(features);
      
      // Determine cluster assignment
      const clusterResult = await this.assignToCluster(pattern, similarities);
      
      // Update relationships
      await this.updateRelationships(pattern, clusterResult);
      
      // Learn from the pattern
      await this.updateLearningMetrics(pattern, clusterResult);
      
      // Emit event for other systems
      this.emit('patternIngested', {
        patternId: pattern.patternId,
        clusterId: clusterResult.clusterId,
        timestamp: new Date()
      });

      return clusterResult;
    } catch (error) {
      console.error('❌ Pattern ingestion failed:', error);
      throw error;
    }
  }

  /**
   * Extract semantic features from pattern using embeddings and statistics
   */
  private async extractSemanticFeatures(pattern: IResearchPattern): Promise<FeatureVector> {
    // Check cache first
    const cached = this.featureCache.get(pattern.patternId);
    if (cached && this.isCacheValid(cached.metadata.timestamp)) {
      return cached;
    }

    // Extract text features for embedding
    const textElements = [
      pattern.pattern.name,
      pattern.pattern.type,
      pattern.pattern.hypothesis,
      ...pattern.evidence.sources.flatMap(s => s.keyFindings),
      ...pattern.parameters.contextualFactors.map(f => f.description)
    ];

    // Get embeddings from Claude if available
    let textEmbeddings: number[] = [];
    if (claudeService.isAvailable()) {
      textEmbeddings = await this.getTextEmbeddings(textElements);
    } else {
      // Fallback to simple feature extraction
      textEmbeddings = this.extractSimpleTextFeatures(textElements);
    }

    // Extract statistical features
    const statFeatures = this.extractStatisticalFeatures(pattern);
    
    // Extract structural features
    const structFeatures = this.extractStructuralFeatures(pattern);
    
    // Combine all features
    const combinedVector = [
      ...textEmbeddings,
      ...statFeatures,
      ...structFeatures
    ];

    // Normalize vector
    const normalizedVector = this.normalizeVector(combinedVector);

    const featureVector: FeatureVector = {
      patternId: pattern.patternId,
      vector: normalizedVector,
      metadata: {
        dimensions: this.getFeatureDimensions(),
        timestamp: new Date()
      }
    };

    // Cache the result
    this.featureCache.set(pattern.patternId, featureVector);

    return featureVector;
  }

  /**
   * Find patterns similar to the given feature vector
   */
  private async findSimilarPatterns(features: FeatureVector): Promise<SimilarityScore[]> {
    const similarities: SimilarityScore[] = [];
    
    // Get all active patterns
    const activePatterns = await ResearchPatternModel.find({
      'metadata.reviewStatus': { $in: ['approved', 'pending'] },
      'metadata.archived': { $ne: true }
    }).limit(1000);

    // Calculate similarity with each pattern
    for (const pattern of activePatterns) {
      if (pattern.patternId === features.patternId) continue;
      
      const otherFeatures = await this.extractSemanticFeatures(pattern);
      const similarity = this.calculateCosineSimilarity(
        features.vector,
        otherFeatures.vector
      );

      if (similarity > this.similarityThreshold) {
        similarities.push({
          pattern1: features.patternId,
          pattern2: pattern.patternId,
          score: similarity,
          dimensions: this.analyzeDimensionalSimilarity(features, otherFeatures)
        });
      }
    }

    // Sort by similarity score
    similarities.sort((a, b) => b.score - a.score);

    return similarities;
  }

  /**
   * Assign pattern to appropriate cluster
   */
  private async assignToCluster(
    pattern: IResearchPattern,
    similarities: SimilarityScore[]
  ): Promise<ClusteringResult> {
    // Find clusters containing similar patterns
    const candidateClusters = await this.findCandidateClusters(similarities);

    if (candidateClusters.length === 0) {
      // Create new cluster
      return await this.createNewCluster(pattern);
    }

    // Evaluate fit for each candidate cluster
    const clusterScores = await Promise.all(
      candidateClusters.map(cluster => this.evaluateClusterFit(pattern, cluster))
    );

    // Select best cluster
    const bestCluster = clusterScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    if (bestCluster.score < this.similarityThreshold) {
      // Pattern doesn't fit well in any cluster, create new one
      return await this.createNewCluster(pattern);
    }

    // Add to existing cluster
    await this.addToCluster(pattern, bestCluster.cluster);

    return {
      clusterId: bestCluster.cluster.clusterId,
      confidence: bestCluster.score,
      membershipScore: bestCluster.membershipScore,
      reasoning: bestCluster.reasoning
    };
  }

  /**
   * Create new cluster for pattern
   */
  private async createNewCluster(pattern: IResearchPattern): Promise<ClusteringResult> {
    const clusterId = `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newCluster = new PatternClusterModel({
      clusterId,
      name: `${pattern.pattern.type} Cluster - ${pattern.pattern.name}`,
      description: `Cluster initiated by: ${pattern.pattern.hypothesis}`,
      characteristics: {
        type: this.determineClusterType(pattern),
        primaryDimensions: Array.from(pattern.pattern.dimensions.keys()),
        semanticFeatures: [],
        centroid: [],
        radius: 0,
        density: 1
      },
      members: [{
        patternId: pattern.patternId,
        membershipScore: 1.0,
        joinedAt: new Date(),
        contributionWeight: 1.0
      }],
      quality: {
        cohesion: 1.0,
        separation: 1.0,
        stability: 1.0,
        significance: pattern.pattern.confidence,
        confidence: pattern.pattern.confidence
      },
      performance: {
        applicationsCount: 0,
        successRate: 0,
        avgImpact: 0,
        contextualPerformance: new Map()
      },
      evolution: [{
        timestamp: new Date(),
        event: 'created',
        description: `Cluster created with founding pattern: ${pattern.pattern.name}`,
        metrics: {
          memberCount: 1,
          avgSimilarity: 1.0,
          stability: 1.0
        }
      }],
      relationships: {
        childClusters: [],
        relatedClusters: []
      },
      applicationRules: {
        minimumConfidence: 0.7,
        requiredContext: [],
        exclusionContext: [],
        combinationRules: []
      },
      metadata: {
        tags: [...pattern.metadata.tags, 'auto-generated'],
        autoGenerated: true,
        lastEvaluated: new Date(),
        evaluationSchedule: 'daily',
        archived: false
      }
    });

    await newCluster.save();
    this.clusterCache.set(clusterId, newCluster);

    console.log(`🎯 Created new cluster: ${clusterId}`);

    return {
      clusterId,
      confidence: 1.0,
      membershipScore: 1.0,
      reasoning: 'Founded new cluster as no suitable existing cluster found'
    };
  }

  /**
   * Add pattern to existing cluster
   */
  private async addToCluster(pattern: IResearchPattern, cluster: IPatternCluster): Promise<void> {
    const membershipScore = await this.calculateMembershipScore(pattern, cluster);
    
    await cluster.addMember(pattern.patternId, membershipScore);
    
    // Update pattern with cluster assignment
    pattern.relationships.clusters.push({
      clusterId: cluster.clusterId,
      centroid: cluster.characteristics.centroid,
      memberPatterns: cluster.members.map(m => m.patternId),
      clusterType: cluster.characteristics.type,
      stability: cluster.quality.stability,
      lastUpdated: new Date()
    });
    
    await pattern.save();
    
    console.log(`➕ Added pattern ${pattern.patternId} to cluster ${cluster.clusterId}`);
  }

  /**
   * Update pattern relationships based on clustering
   */
  private async updateRelationships(
    pattern: IResearchPattern,
    clusterResult: ClusteringResult
  ): Promise<void> {
    // Find patterns in same cluster
    const cluster = await PatternClusterModel.findOne({ 
      clusterId: clusterResult.clusterId 
    });
    
    if (!cluster) return;

    const clusterMembers = cluster.members
      .filter(m => m.patternId !== pattern.patternId)
      .map(m => m.patternId);

    // Update correlated patterns
    for (const memberId of clusterMembers) {
      const correlation = await this.calculatePatternCorrelation(
        pattern.patternId,
        memberId
      );

      if (correlation > 0.5) {
        pattern.relationships.correlatedPatterns.push({
          patternId: memberId,
          correlation,
          lag: 0
        });
      }
    }

    // Detect conflicting patterns
    await this.detectConflictingPatterns(pattern);

    await pattern.save();
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Extract statistical features from pattern
   */
  private extractStatisticalFeatures(pattern: IResearchPattern): number[] {
    const features: number[] = [];

    // Confidence and quality metrics
    features.push(pattern.pattern.confidence);
    features.push(pattern.metadata.qualityScore);

    // Evidence strength
    const avgSampleSize = pattern.evidence.sources
      .map(s => s.sampleSize || 0)
      .reduce((a, b) => a + b, 0) / Math.max(pattern.evidence.sources.length, 1);
    features.push(Math.log10(avgSampleSize + 1) / 10); // Normalize

    // Statistical significance
    const avgPValue = pattern.evidence.statisticalTests
      .map(t => t.pValue || 0.5)
      .reduce((a, b) => a + b, 0) / Math.max(pattern.evidence.statisticalTests.length, 1);
    features.push(1 - avgPValue); // Convert to significance

    // Performance metrics if available
    features.push(pattern.performance.aggregateMetrics.successRate || 0.5);
    features.push(pattern.performance.aggregateMetrics.avgAccuracy || 0.5);

    return features;
  }

  /**
   * Extract structural features from pattern
   */
  private extractStructuralFeatures(pattern: IResearchPattern): number[] {
    const features: number[] = [];

    // Dimension count and types
    features.push(pattern.pattern.dimensions.size / 10); // Normalize
    
    const dimensionTypes = Array.from(pattern.pattern.dimensions.values())
      .map(d => d.dataType);
    features.push(dimensionTypes.filter(t => t === 'continuous').length / dimensionTypes.length);
    features.push(dimensionTypes.filter(t => t === 'temporal').length / dimensionTypes.length);

    // Complexity indicators
    features.push(pattern.parameters.triggers.length / 10); // Normalize
    features.push(pattern.parameters.contextualFactors.length / 10);

    // Implementation feasibility
    features.push(pattern.implementation.realTimeFeasible ? 1 : 0);
    
    const complexityMap: Record<string, number> = {
      'O(1)': 0.1,
      'O(log n)': 0.3,
      'O(n)': 0.5,
      'O(n log n)': 0.7,
      'O(n²)': 0.9,
      'custom': 0.5
    };
    features.push(complexityMap[pattern.implementation.computationalComplexity] || 0.5);

    return features;
  }

  /**
   * Simple text feature extraction when Claude is not available
   */
  private extractSimpleTextFeatures(texts: string[]): number[] {
    // Simple bag-of-words approach with predefined keywords
    const keywords = [
      'momentum', 'reversal', 'breakout', 'fade', 'trend',
      'volume', 'volatility', 'sentiment', 'news', 'earnings',
      'support', 'resistance', 'gap', 'spike', 'consolidation'
    ];

    const combinedText = texts.join(' ').toLowerCase();
    
    return keywords.map(keyword => 
      combinedText.includes(keyword) ? 1 : 0
    );
  }

  /**
   * Get text embeddings using Claude
   */
  private async getTextEmbeddings(texts: string[]): Promise<number[]> {
    // In a real implementation, this would call an embedding service
    // For now, fallback to simple features
    return this.extractSimpleTextFeatures(texts);
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) return vector;

    return vector.map(val => val / magnitude);
  }

  /**
   * Recommend patterns for given context
   */
  async recommendPatterns(context: any): Promise<PatternApplication[]> {
    const recommendations: PatternApplication[] = [];

    // Get relevant clusters based on context
    const relevantClusters = await this.getRelevantClusters(context);

    // Score patterns in each cluster
    for (const cluster of relevantClusters) {
      const patterns = await ResearchPatternModel.find({
        patternId: { $in: cluster.members.map(m => m.patternId) }
      });

      for (const pattern of patterns) {
        const score = await this.scorePatternForContext(pattern, context);
        
        if (score.confidence > 0.7) {
          recommendations.push({
            patternId: pattern.patternId,
            clusterId: cluster.clusterId,
            context,
            confidence: score.confidence,
            suggestedParameters: score.parameters
          });
        }
      }
    }

    // Sort by confidence
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  /**
   * Helper methods
   */
  private isCacheValid(timestamp: Date): boolean {
    const cacheLifetime = 3600000; // 1 hour
    return Date.now() - timestamp.getTime() < cacheLifetime;
  }

  private getFeatureDimensions(): string[] {
    return [
      ...['momentum', 'reversal', 'breakout', 'fade', 'trend'],
      ...['volume', 'volatility', 'sentiment', 'news', 'earnings'],
      ...['support', 'resistance', 'gap', 'spike', 'consolidation'],
      'confidence', 'quality', 'sample_size', 'significance',
      'success_rate', 'accuracy', 'dimension_count', 'continuous_ratio',
      'temporal_ratio', 'trigger_count', 'factor_count', 'real_time',
      'complexity'
    ];
  }

  private determineClusterType(pattern: IResearchPattern): 'behavioral' | 'statistical' | 'temporal' | 'mixed' {
    const hasBehavioralFactors = pattern.parameters.contextualFactors.some(
      f => f.description.toLowerCase().includes('bias') || 
           f.description.toLowerCase().includes('psychology')
    );
    
    const hasStatisticalTests = pattern.evidence.statisticalTests.length > 0;
    
    const hasTemporalDimensions = Array.from(pattern.pattern.dimensions.values())
      .some(d => d.dataType === 'temporal');

    if (hasBehavioralFactors && !hasStatisticalTests) return 'behavioral';
    if (hasStatisticalTests && !hasBehavioralFactors) return 'statistical';
    if (hasTemporalDimensions && !hasBehavioralFactors) return 'temporal';
    
    return 'mixed';
  }

  private async findCandidateClusters(similarities: SimilarityScore[]): Promise<IPatternCluster[]> {
    const clusterIds = new Set<string>();
    
    // Get clusters containing similar patterns
    for (const similarity of similarities) {
      const pattern = await ResearchPatternModel.findOne({ 
        patternId: similarity.pattern2 
      });
      
      if (pattern) {
        pattern.relationships.clusters.forEach(c => clusterIds.add(c.clusterId));
      }
    }

    return await PatternClusterModel.find({
      clusterId: { $in: Array.from(clusterIds) },
      'metadata.archived': { $ne: true }
    });
  }

  private async evaluateClusterFit(
    pattern: IResearchPattern,
    cluster: IPatternCluster
  ): Promise<{ cluster: IPatternCluster; score: number; membershipScore: number; reasoning: string }> {
    const features = await this.extractSemanticFeatures(pattern);
    
    // Calculate distance to cluster centroid
    const centroidDistance = cluster.characteristics.centroid.length > 0
      ? this.calculateEuclideanDistance(features.vector, cluster.characteristics.centroid)
      : 0;

    // Check if within cluster radius
    const withinRadius = centroidDistance <= cluster.characteristics.radius * 1.5;

    // Calculate membership score based on similarity to existing members
    const membershipScore = await this.calculateMembershipScore(pattern, cluster);

    // Overall fit score
    const score = withinRadius 
      ? membershipScore 
      : membershipScore * 0.5; // Penalty for being outside radius

    const reasoning = withinRadius
      ? `Pattern fits well within cluster radius (distance: ${centroidDistance.toFixed(2)})`
      : `Pattern outside optimal cluster radius but shows similarity (distance: ${centroidDistance.toFixed(2)})`;

    return { cluster, score, membershipScore, reasoning };
  }

  private async calculateMembershipScore(
    pattern: IResearchPattern,
    cluster: IPatternCluster
  ): Promise<number> {
    if (cluster.members.length === 0) return 1.0;

    const features = await this.extractSemanticFeatures(pattern);
    let totalSimilarity = 0;

    // Sample up to 10 members for efficiency
    const sampleSize = Math.min(cluster.members.length, 10);
    const sampledMembers = cluster.members
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);

    for (const member of sampledMembers) {
      const memberPattern = await ResearchPatternModel.findOne({ 
        patternId: member.patternId 
      });
      
      if (memberPattern) {
        const memberFeatures = await this.extractSemanticFeatures(memberPattern);
        const similarity = this.calculateCosineSimilarity(
          features.vector,
          memberFeatures.vector
        );
        totalSimilarity += similarity;
      }
    }

    return totalSimilarity / sampleSize;
  }

  private calculateEuclideanDistance(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
      sum += Math.pow(vec1[i] - vec2[i], 2);
    }

    return Math.sqrt(sum);
  }

  private analyzeDimensionalSimilarity(
    features1: FeatureVector,
    features2: FeatureVector
  ): Map<string, number> {
    const similarities = new Map<string, number>();
    const dimensions = features1.metadata.dimensions;

    // Analyze similarity for each dimension group
    const dimensionGroups = [
      { name: 'behavioral', indices: [0, 4] },
      { name: 'market_structure', indices: [5, 9] },
      { name: 'statistical', indices: [10, 14] },
      { name: 'implementation', indices: [15, 19] }
    ];

    for (const group of dimensionGroups) {
      const vec1Slice = features1.vector.slice(group.indices[0], group.indices[1] + 1);
      const vec2Slice = features2.vector.slice(group.indices[0], group.indices[1] + 1);
      
      similarities.set(
        group.name,
        this.calculateCosineSimilarity(vec1Slice, vec2Slice)
      );
    }

    return similarities;
  }

  private async updateLearningMetrics(
    pattern: IResearchPattern,
    clusterResult: ClusteringResult
  ): Promise<void> {
    // Update pattern learning metrics
    pattern.performance.learningCurve.push({
      timestamp: new Date(),
      metricName: 'cluster_assignment',
      value: clusterResult.confidence
    });

    await pattern.save();

    // Update cluster learning
    const cluster = await PatternClusterModel.findOne({ 
      clusterId: clusterResult.clusterId 
    });
    
    if (cluster) {
      // Recalculate cluster centroid with new member
      await this.updateClusterCentroid(cluster);
    }
  }

  private async updateClusterCentroid(cluster: IPatternCluster): Promise<void> {
    const memberPatterns = await ResearchPatternModel.find({
      patternId: { $in: cluster.members.map(m => m.patternId) }
    });

    if (memberPatterns.length === 0) return;

    // Calculate weighted centroid
    const vectorLength = (await this.extractSemanticFeatures(memberPatterns[0])).vector.length;
    const centroid = new Array(vectorLength).fill(0);
    let totalWeight = 0;

    for (const pattern of memberPatterns) {
      const features = await this.extractSemanticFeatures(pattern);
      const member = cluster.members.find(m => m.patternId === pattern.patternId);
      const weight = member?.contributionWeight || 1;

      for (let i = 0; i < vectorLength; i++) {
        centroid[i] += features.vector[i] * weight;
      }
      totalWeight += weight;
    }

    // Normalize
    for (let i = 0; i < vectorLength; i++) {
      centroid[i] /= totalWeight;
    }

    cluster.characteristics.centroid = centroid;

    // Update radius
    let maxDistance = 0;
    for (const pattern of memberPatterns) {
      const features = await this.extractSemanticFeatures(pattern);
      const distance = this.calculateEuclideanDistance(features.vector, centroid);
      maxDistance = Math.max(maxDistance, distance);
    }

    cluster.characteristics.radius = maxDistance;
    cluster.characteristics.density = cluster.members.length / (Math.PI * maxDistance * maxDistance);

    await cluster.save();
  }

  private async detectConflictingPatterns(pattern: IResearchPattern): Promise<void> {
    // Find patterns with opposite hypotheses or conflicting triggers
    const potentialConflicts = await ResearchPatternModel.find({
      $or: [
        { 'pattern.type': { $ne: pattern.pattern.type } },
        { 'parameters.triggers.condition.type': 'composite' }
      ]
    }).limit(100);

    for (const candidate of potentialConflicts) {
      const conflict = this.analyzeConflict(pattern, candidate);
      
      if (conflict.isConflict) {
        pattern.relationships.conflictingPatterns.push({
          patternId: candidate.patternId,
          conflictType: conflict.type,
          resolution: conflict.resolution
        });
      }
    }
  }

  private analyzeConflict(pattern1: IResearchPattern, pattern2: IResearchPattern): {
    isConflict: boolean;
    type: string;
    resolution: string;
  } {
    // Simple conflict detection based on pattern types
    const oppositeTypes: Record<string, string> = {
      'momentum': 'reversal',
      'reversal': 'momentum',
      'breakout': 'fade',
      'fade': 'breakout'
    };

    if (oppositeTypes[pattern1.pattern.type] === pattern2.pattern.type) {
      return {
        isConflict: true,
        type: 'opposite_direction',
        resolution: 'Use contextual factors to determine which applies'
      };
    }

    // Check for overlapping triggers with different outcomes
    const trigger1Dims = new Set(pattern1.parameters.triggers.map(t => t.name));
    const trigger2Dims = new Set(pattern2.parameters.triggers.map(t => t.name));
    const overlap = Array.from(trigger1Dims).filter(d => trigger2Dims.has(d));

    if (overlap.length > 0 && pattern1.pattern.type !== pattern2.pattern.type) {
      return {
        isConflict: true,
        type: 'overlapping_triggers',
        resolution: 'Apply pattern with higher confidence in context'
      };
    }

    return {
      isConflict: false,
      type: '',
      resolution: ''
    };
  }

  private async calculatePatternCorrelation(
    patternId1: string,
    patternId2: string
  ): Promise<number> {
    // In a full implementation, this would analyze historical performance correlation
    // For now, use feature similarity as proxy
    const pattern1 = await ResearchPatternModel.findOne({ patternId: patternId1 });
    const pattern2 = await ResearchPatternModel.findOne({ patternId: patternId2 });

    if (!pattern1 || !pattern2) return 0;

    const features1 = await this.extractSemanticFeatures(pattern1);
    const features2 = await this.extractSemanticFeatures(pattern2);

    return this.calculateCosineSimilarity(features1.vector, features2.vector);
  }

  private async getRelevantClusters(context: any): Promise<IPatternCluster[]> {
    // Get all active clusters
    const allClusters = await PatternClusterModel.find({
      'metadata.archived': { $ne: true },
      'quality.confidence': { $gte: 0.6 }
    });

    // Score each cluster for relevance to context
    const scoredClusters = await Promise.all(
      allClusters.map(async cluster => ({
        cluster,
        score: await this.scoreClusterForContext(cluster, context)
      }))
    );

    // Return top relevant clusters
    return scoredClusters
      .filter(sc => sc.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(sc => sc.cluster);
  }

  private async scoreClusterForContext(
    cluster: IPatternCluster,
    context: any
  ): Promise<number> {
    let score = cluster.quality.confidence;

    // Boost score if cluster has good performance in similar context
    const contextKey = this.getContextKey(context);
    const contextPerf = cluster.performance.contextualPerformance.get(contextKey);
    
    if (contextPerf && contextPerf.applications > 5) {
      score *= (1 + contextPerf.successRate);
    }

    // Consider required context
    const meetsRequired = cluster.applicationRules.requiredContext.every(
      req => context[req] !== undefined
    );
    
    if (!meetsRequired) score *= 0.5;

    // Check exclusion context
    const hasExclusion = cluster.applicationRules.exclusionContext.some(
      exc => context[exc] !== undefined
    );
    
    if (hasExclusion) score *= 0.1;

    return Math.min(score, 1.0);
  }

  private async scorePatternForContext(
    pattern: IResearchPattern,
    context: any
  ): Promise<{ confidence: number; parameters: Map<string, any> }> {
    let confidence = pattern.pattern.confidence;
    const parameters = new Map<string, any>();

    // Check if pattern's contextual factors align
    for (const factor of pattern.parameters.contextualFactors) {
      const contextValue = context[factor.name];
      
      if (contextValue !== undefined) {
        if (factor.impact === 'amplifies') {
          confidence *= 1.2;
        } else if (factor.impact === 'dampens') {
          confidence *= 0.8;
        }
      }
    }

    // Suggest parameters based on context
    for (const threshold of pattern.parameters.thresholds) {
      // Use context to adjust threshold parameters
      if (context.volatility && threshold.dimension === 'volatility_adjustment') {
        parameters.set(threshold.dimension, {
          ...threshold.distribution.parameters,
          adjusted: true,
          contextValue: context.volatility
        });
      }
    }

    return {
      confidence: Math.min(confidence, 1.0),
      parameters
    };
  }

  private getContextKey(context: any): string {
    // Create a key representing the context for performance tracking
    const keys = ['market', 'volatility', 'timeframe', 'assetClass']
      .map(k => context[k] || 'unknown')
      .join('_');
    
    return keys.toLowerCase();
  }
}