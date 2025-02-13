import {
    type ActionExample,
    composeContext,
    type Content,
    elizaLogger,
    type Evaluator,
    type IAgentRuntime,
    type Memory,
    MemoryManager,
    ModelClass,
    type EvaluationExample,
    stringToUuid,
} from "@elizaos/core";
import { investmentStrategyProvider } from "../providers/investmentStrategy.ts";

// Enhanced interfaces for better type safety and clarity
interface DeFiRecommendation {
    protocol: string;
    token: string;
    amount: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    expectedReturn: number;
    confidence: 'none' | 'low' | 'medium' | 'high';
    timeHorizon?: number;
    historicalPerformance?: HistoricalPerformance;
}

interface HistoricalPerformance {
    successRate: number;
    averageReturn: number;
    totalRecommendations: number;
    volatility?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
}

interface MarketContext {
    overallSentiment: 'bearish' | 'neutral' | 'bullish';
    volatilityIndex: number;
    trendStrength: number;
    timestamp: number;
}

interface UserContext {
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    investmentGoals: string[];
    preferredProtocols?: string[];
    preferredTokens?: string[];
    previousSuccesses: string[];
    previousFailures: string[];
}

class AdvancedMemoryManager {
    private memoryManager: MemoryManager;
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.memoryManager = new MemoryManager({
            runtime,
            tableName: "defi_recommendations",
        });
    }

    async storeRecommendation(recommendation: DeFiRecommendation, userId: string, context: any) {
        const memory = {
            userId: stringToUuid(userId),
            agentId: this.runtime.agentId,
            content: {
                text: JSON.stringify(recommendation),
                context,
                timestamp: Date.now()
            },
            roomId: context.roomId,
            createdAt: Date.now(),
        };

        await this.memoryManager.createMemory(memory, true);
    }

    async getUserContext(userId: string): Promise<UserContext | null> {
        const memories = await this.memoryManager.getMemories({
            roomId: stringToUuid(userId),
            count: 1
        });

        if (memories.length === 0) return null;
        try {
            const parsedContent = JSON.parse(memories[0].content.text) as unknown as UserContext;
            return parsedContent;
        } catch (error) {
            return null;
        }
    }

    async getHistoricalPerformance(protocol: string, token: string): Promise<HistoricalPerformance | null> {
        const memories = await this.memoryManager.getMemories({
            roomId: stringToUuid(`${protocol}-${token}`),
            count: 100
        });

        if (memories.length === 0) return null;
        return this.calculateAggregatePerformance(memories);
    }

    private calculateAggregatePerformance(memories: Memory[]): HistoricalPerformance {
        const performances = memories.map(m => {
            try {
                return JSON.parse(m.content.text) as unknown as HistoricalPerformance;
            } catch {
                return null;
            }
        }).filter((p): p is HistoricalPerformance => p !== null);
        
        if (performances.length === 0) {
            return {
                successRate: 0,
                averageReturn: 0,
                totalRecommendations: 0
            };
        }

        return {
            successRate: this.calculateWeightedAverage(performances.map(p => p.successRate)),
            averageReturn: this.calculateWeightedAverage(performances.map(p => p.averageReturn)),
            totalRecommendations: performances.reduce((sum, p) => sum + p.totalRecommendations, 0),
            volatility: this.calculateVolatility(performances),
            sharpeRatio: this.calculateSharpeRatio(performances),
            maxDrawdown: this.calculateMaxDrawdown(performances)
        };
    }

    private calculateWeightedAverage(values: number[]): number {
        const weights = values.map((_, i) => Math.exp(-i * 0.1)); // Exponential decay
        const weightedSum = values.reduce((sum, value, i) => sum + value * weights[i], 0);
        const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
        return weightedSum / weightSum;
    }

    private calculateVolatility(performances: HistoricalPerformance[]): number {
        const returns = performances.map(p => p.averageReturn);
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / returns.length);
    }

    private calculateSharpeRatio(performances: HistoricalPerformance[]): number {
        const riskFreeRate = 0.02; // Assuming 2% risk-free rate
        const averageReturn = this.calculateWeightedAverage(performances.map(p => p.averageReturn));
        const volatility = this.calculateVolatility(performances);
        return (averageReturn - riskFreeRate) / volatility;
    }

    private calculateMaxDrawdown(performances: HistoricalPerformance[]): number {
        const returns = performances.map(p => p.averageReturn);
        let maxDrawdown = 0;
        let peak = returns[0];
        
        for (const return_ of returns) {
            if (return_ > peak) peak = return_;
            const drawdown = (peak - return_) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        return maxDrawdown;
    }
}

class RecommendationEngine {
    private memoryManager: AdvancedMemoryManager;
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.memoryManager = new AdvancedMemoryManager(runtime);
    }

    async generateRecommendations(
        message: Memory,
        userContext: UserContext,
        marketContext: MarketContext
    ): Promise<DeFiRecommendation[]> {
        const baseRecommendations = await this.getBaseRecommendations(message);
        const enhancedRecommendations = await this.enhanceRecommendations(
            baseRecommendations,
            userContext,
            marketContext
        );
        return this.prioritizeRecommendations(enhancedRecommendations, userContext);
    }

    private async getBaseRecommendations(message: Memory): Promise<DeFiRecommendation[]> {
        const strategyData = JSON.parse(
            await investmentStrategyProvider.get(this.runtime, message)
        );
        return strategyData.recommendations || [];
    }

    private async enhanceRecommendations(
        recommendations: DeFiRecommendation[],
        userContext: UserContext,
        marketContext: MarketContext
    ): Promise<DeFiRecommendation[]> {
        return Promise.all(recommendations.map(async rec => {
            const historicalPerformance = await this.memoryManager.getHistoricalPerformance(
                rec.protocol,
                rec.token
            );

            const confidence = this.calculateConfidence(
                historicalPerformance,
                rec,
                marketContext
            );

            const adjustedRiskLevel = this.adjustRiskLevel(
                rec.riskLevel,
                userContext,
                marketContext
            );

            return {
                ...rec,
                confidence,
                riskLevel: adjustedRiskLevel,
                historicalPerformance,
                timeHorizon: this.calculateTimeHorizon(rec, marketContext)
            };
        }));
    }

    private calculateConfidence(
        history: HistoricalPerformance | null,
        recommendation: DeFiRecommendation,
        marketContext: MarketContext
    ): 'none' | 'low' | 'medium' | 'high' {
        if (!history) return 'none';

        const weights = {
            successRate: 0.3,
            returnAccuracy: 0.2,
            recommendationCount: 0.2,
            marketAlignment: 0.3
        };

        const successScore = history.successRate;
        const returnScore = Math.max(0, 1 - Math.abs(history.averageReturn - recommendation.expectedReturn) / history.averageReturn);
        const recommendationScore = Math.min(1, history.totalRecommendations / 20);
        const marketScore = this.calculateMarketAlignmentScore(recommendation, marketContext);

        const confidenceScore = 
            (successScore * weights.successRate) +
            (returnScore * weights.returnAccuracy) +
            (recommendationScore * weights.recommendationCount) +
            (marketScore * weights.marketAlignment);

        if (confidenceScore >= 0.8) return 'high';
        if (confidenceScore >= 0.6) return 'medium';
        if (confidenceScore >= 0.3) return 'low';
        return 'none';
    }

    private calculateMarketAlignmentScore(
        recommendation: DeFiRecommendation,
        marketContext: MarketContext
    ): number {
        const sentimentScore = {
            'bearish': 0.3,
            'neutral': 0.5,
            'bullish': 0.7
        }[marketContext.overallSentiment];

        const volatilityScore = 1 - (marketContext.volatilityIndex / 100);
        const trendScore = marketContext.trendStrength / 100;

        return (sentimentScore + volatilityScore + trendScore) / 3;
    }

    private adjustRiskLevel(
        baseRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
        userContext: UserContext,
        marketContext: MarketContext
    ): 'LOW' | 'MEDIUM' | 'HIGH' {
        const riskToleranceMap = {
            'conservative': -1,
            'moderate': 0,
            'aggressive': 1
        };

        const marketSentimentMap = {
            'bearish': -1,
            'neutral': 0,
            'bullish': 1
        };

        const riskLevelMap = {
            'LOW': 0,
            'MEDIUM': 1,
            'HIGH': 2
        };

        const baseRiskScore = riskLevelMap[baseRiskLevel];
        const adjustment = 
            riskToleranceMap[userContext.riskTolerance] +
            marketSentimentMap[marketContext.overallSentiment];

        const finalScore = Math.max(0, Math.min(2, baseRiskScore + adjustment * 0.5));

        if (finalScore <= 0.5) return 'LOW';
        if (finalScore <= 1.5) return 'MEDIUM';
        return 'HIGH';
    }

    private calculateTimeHorizon(
        recommendation: DeFiRecommendation,
        marketContext: MarketContext
    ): number {
        const baseHorizon = recommendation.riskLevel === 'LOW' ? 90 : 
                           recommendation.riskLevel === 'MEDIUM' ? 60 : 30;

        const marketMultiplier = marketContext.overallSentiment === 'bullish' ? 0.8 :
                                marketContext.overallSentiment === 'neutral' ? 1 : 1.2;

        return Math.round(baseHorizon * marketMultiplier);
    }

    private prioritizeRecommendations(
        recommendations: DeFiRecommendation[],
        userContext: UserContext
    ): DeFiRecommendation[] {
        return recommendations.sort((a, b) => {
            const aScore = this.calculatePriorityScore(a, userContext);
            const bScore = this.calculatePriorityScore(b, userContext);
            return bScore - aScore;
        });
    }

    private calculatePriorityScore(
        recommendation: DeFiRecommendation,
        userContext: UserContext
    ): number {
        let score = 0;

        // Preferred protocols and tokens bonus
        if (userContext.preferredProtocols?.includes(recommendation.protocol)) score += 2;
        if (userContext.preferredTokens?.includes(recommendation.token)) score += 2;

        // Previous success/failure consideration
        const successKey = `${recommendation.protocol}-${recommendation.token}`;
        if (userContext.previousSuccesses.includes(successKey)) score += 3;
        if (userContext.previousFailures.includes(successKey)) score -= 4;

        // Risk alignment
        const riskScores = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
        const userRiskScores = { 'conservative': 1, 'moderate': 2, 'aggressive': 3 };
        score += 2 - Math.abs(riskScores[recommendation.riskLevel] - userRiskScores[userContext.riskTolerance]);

        // Confidence bonus
        const confidenceScores = { 'none': 0, 'low': 1, 'medium': 2, 'high': 3 };
        score += confidenceScores[recommendation.confidence];

        return score;
    }
}

export const defiEvaluator: Evaluator = {
    name: "STRATEGY_EVALUATOR",
    similes: [
        "GET_DEFI_RECOMMENDATIONS",
        "EXTRACT_PROTOCOL_RECS",
        "EXTRACT_INVESTMENT_RECS",
    ],
    examples: [
        {
            context: "User asking for conservative DeFi investments",
            messages: [{
                user: "user1",
                content: { text: "Looking for conservative DeFi investments on StarkNet" }
            }],
            outcome: JSON.stringify({
                recommendations: [{
                    protocol: "zkLend",
                    token: "ETH",
                    amount: 80000,
                    riskLevel: "LOW",
                    expectedReturn: 5.2,
                    confidence: "high",
                    timeHorizon: 90
                }]
            })
        }
    ],
    alwaysRun: true,
    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        if (message.content.text.length < 5) {
            return false;
        }
        return message.userId !== message.agentId;
    },
    description:
        "Enhanced DeFi investment recommendations with advanced context awareness and performance tracking",
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Evaluating for DeFi opportunities with enhanced context");

        try {
            const recommendationEngine = new RecommendationEngine(runtime);
            const memoryManager = new AdvancedMemoryManager(runtime);

            // Get user context
            const userContext = await memoryManager.getUserContext(message.userId) || {
                riskTolerance: 'moderate',
                investmentGoals: ['growth'],
                previousSuccesses: [],
                previousFailures: []
            };

            // Simulate market context (in practice, this would come from a market data provider)
            const marketContext: MarketContext = {
                overallSentiment: 'neutral',
                volatilityIndex: 50,
                trendStrength: 60,
                timestamp: Date.now()
            };

            // Generate recommendations

            // Generate recommendations with full context
            const recommendations = await recommendationEngine.generateRecommendations(
                message,
                userContext,
                marketContext
            );

            // Store recommendations with context
            for (const recommendation of recommendations) {
                await memoryManager.storeRecommendation(
                    recommendation,
                    message.userId,
                    {
                        marketContext,
                        userContext,
                        roomId: message.roomId
                    }
                );
            }

            // Calculate portfolio-level metrics
            const portfolioMetrics = calculatePortfolioMetrics(recommendations);

            return {
                recommendations,
                portfolioMetrics,
                marketContext,
                timestamp: Date.now()
            };

        } catch (error) {
            elizaLogger.error("Error in enhanced DeFi evaluator:", error);
            return {
                recommendations: [],
                portfolioMetrics: null,
                error: "Failed to generate recommendations"
            };
        }
    }
};

interface PortfolioMetrics {
    totalValue: number;
    weightedRisk: number;
    expectedReturn: number;
    diversificationScore: number;
    protocolExposure: Record<string, number>;
    tokenExposure: Record<string, number>;
}

function calculatePortfolioMetrics(recommendations: DeFiRecommendation[]): PortfolioMetrics {
    const totalValue = recommendations.reduce((sum, rec) => sum + rec.amount, 0);
    
    const protocolExposure: Record<string, number> = {};
    const tokenExposure: Record<string, number> = {};
    
    // Calculate exposures
    recommendations.forEach(rec => {
        protocolExposure[rec.protocol] = (protocolExposure[rec.protocol] || 0) + (rec.amount / totalValue);
        tokenExposure[rec.token] = (tokenExposure[rec.token] || 0) + (rec.amount / totalValue);
    });

    // Calculate weighted risk score
    const riskScores = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
    const weightedRisk = recommendations.reduce((sum, rec) => {
        return sum + (riskScores[rec.riskLevel] * (rec.amount / totalValue));
    }, 0);

    // Calculate expected portfolio return
    const expectedReturn = recommendations.reduce((sum, rec) => {
        return sum + (rec.expectedReturn * (rec.amount / totalValue));
    }, 0);

    // Calculate diversification score
    const diversificationScore = calculateDiversificationScore(protocolExposure, tokenExposure);

    return {
        totalValue,
        weightedRisk,
        expectedReturn,
        diversificationScore,
        protocolExposure,
        tokenExposure
    };
}

function calculateDiversificationScore(
    protocolExposure: Record<string, number>,
    tokenExposure: Record<string, number>
): number {
    // Calculate Herfindahl-Hirschman Index (HHI) for protocols and tokens
    const protocolHHI = Object.values(protocolExposure)
        .reduce((sum, exposure) => sum + Math.pow(exposure, 2), 0);
    
    const tokenHHI = Object.values(tokenExposure)
        .reduce((sum, exposure) => sum + Math.pow(exposure, 2), 0);

    // Convert HHI to diversification score (1 - HHI normalized to 0-1)
    const protocolDiversification = 1 - protocolHHI;
    const tokenDiversification = 1 - tokenHHI;

    // Combine scores with equal weighting
    return (protocolDiversification + tokenDiversification) / 2;
}