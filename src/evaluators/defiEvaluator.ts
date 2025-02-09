import {
    type ActionExample,
    booleanFooter,
    composeContext,
    type Content,
    elizaLogger,
    type Evaluator,
    generateObjectArray,
    generateTrueOrFalse,
    type IAgentRuntime,
    type Memory,
    MemoryManager,
    ModelClass,
    type EvaluationExample,
} from "@elizaos/core";
import { investmentStrategyProvider } from "../providers/investmentStrategy.ts";

export const formatRecommendations = (recommendations: Memory[]) => {
    const messageStrings = recommendations
        .reverse()
        .map((rec: Memory) => `${(rec.content as Content)?.content}`);
    const finalMessageStrings = messageStrings.join("\n");
    return finalMessageStrings;
};

interface RecommendationHistory {
    protocol: string;
    token: string;
    successRate: number;
    averageReturn: number;
    totalRecommendations: number;
}

const recommendationHistory: Record<string, RecommendationHistory> = {};

// Example DeFi recommendations for reference
const exampleRecommendations: EvaluationExample[] = [
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
                confidence: "high"
            }],
            protocolTotals: {
                "zkLend": 80000
            }
        })
    },
    {
        context: "User inquiring about yield farming",
        messages: [{
            user: "user2",
            content: { text: "What are the best yield farming opportunities?" }
        }],
        outcome: JSON.stringify({
            recommendations: [{
                protocol: "Ekubo",
                token: "USDC",
                amount: 20000,
                riskLevel: "MEDIUM",
                expectedReturn: 8.5,
                confidence: "medium"
            }],
            protocolTotals: {
                "Ekubo": 20000
            }
        })
    }
];

export const defiEvaluator: Evaluator = {
    name: "STRATEGY_EVALUATOR",
    similes: [
        "GET_DEFI_RECOMMENDATIONS",
        "EXTRACT_PROTOCOL_RECS",
        "EXTRACT_INVESTMENT_RECS",
    ],
    examples: exampleRecommendations,
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
        "Extract DeFi investment recommendations from conversations and generate optimized investment strategies.",
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Evaluating for DeFi opportunities");

        try {
            // Get strategy recommendations
            const strategyData = JSON.parse(
                await investmentStrategyProvider.get(runtime, message)
            );


            // Extract recommendations from strategy
            const recommendations = strategyData.recommendations || [];

            // Calculate protocol-wise totals
            const protocolTotals: Record<string, number> = {};
            recommendations.forEach(rec => {
                protocolTotals[rec.protocol] = (protocolTotals[rec.protocol] || 0) + rec.amount;
            });

            // Filter and enhance recommendations with historical performance
            const enhancedRecommendations = recommendations.map(rec => {
                const historyKey = `${rec.protocol}-${rec.token}`;
                const history = recommendationHistory[historyKey] || {
                    protocol: rec.protocol,
                    token: rec.token,
                    successRate: 0.8, // Initial conservative estimate
                    averageReturn: rec.expectedReturn,
                    totalRecommendations: 0
                };

                // Calculate confidence based on historical performance
                const confidence = calculateConfidence(history, rec);

                // Update recommendation history
                if (!recommendationHistory[historyKey]) {
                    recommendationHistory[historyKey] = history;
                }
                recommendationHistory[historyKey].totalRecommendations++;

                return {
                    ...rec,
                    confidence,
                    historicalPerformance: {
                        successRate: history.successRate,
                        averageReturn: history.averageReturn,
                        totalRecommendations: history.totalRecommendations
                    }
                };
            });

            // Store recommendations in memory
            const recommendationsManager = new MemoryManager({
                runtime,
                tableName: "defi_recommendations",
            });

            const result = {
                recommendations: enhancedRecommendations,
                protocolTotals
            };

            await recommendationsManager.createMemory({
                userId: message.userId,
                agentId: message.agentId,
                content: { text: JSON.stringify(result) },
                roomId: message.roomId,
                createdAt: Date.now(),
            }, true);

            return result;
        } catch (error) {
            console.error("Error in DeFi evaluator:", error);
            return {
                recommendations: [],
                protocolTotals: {}
            };
        }
    }
};

function calculateConfidence(history: RecommendationHistory, currentRec: any): 'none' | 'low' | 'medium' | 'high' {
    // Weight factors for confidence calculation
    const weights = {
        successRate: 0.4,
        returnAccuracy: 0.3,
        recommendationCount: 0.3
    };

    // Calculate success rate score (0-1)
    const successScore = history.successRate;

    // Calculate return accuracy score (0-1)
    const returnDiff = Math.abs(history.averageReturn - currentRec.expectedReturn);
    const returnScore = Math.max(0, 1 - (returnDiff / history.averageReturn));

    // Calculate recommendation count score (0-1)
    const recommendationScore = Math.min(1, history.totalRecommendations / 10);

    // Calculate weighted confidence score
    const confidenceScore = 
        (successScore * weights.successRate) +
        (returnScore * weights.returnAccuracy) +
        (recommendationScore * weights.recommendationCount);

    // Map confidence score to levels
    if (confidenceScore >= 0.8) return 'high';
    if (confidenceScore >= 0.6) return 'medium';
    if (confidenceScore >= 0.3) return 'low';
    return 'none';
} 