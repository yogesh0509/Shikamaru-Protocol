import { IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import { SAFETY_LIMITS } from "../utils.ts";
import { stringToUuid } from "@elizaos/core";

interface DefiRecommendation {
    recommendations: Array<{
        protocol: string;
        token: string;
        amount: number;
        expectedReturn: number;
        confidence: string;
        historicalPerformance: {
            successRate: number;
            averageReturn: number;
            totalRecommendations: number;
        }
    }>;
    protocolTotals: Record<string, number>;
}

interface TradingState {
    isActive: boolean;
    lastTradeTime: number;
    totalTradesExecuted: number;
    successfulTrades: number;
    failedTrades: number;
    totalVolume: number;
}

interface TradingMetrics {
    lastPnL: number;
    dailyVolume: number;
    successRate: number;
    averageReturnPerTrade: number;
}

export class AutoClient {
    private runtime: IAgentRuntime;
    private interval: NodeJS.Timeout;
    private tradingState: TradingState;
    private metrics: TradingMetrics;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        
        // Initialize trading state
        this.tradingState = {
            isActive: false,
            lastTradeTime: 0,
            totalTradesExecuted: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalVolume: 0
        };

        // Initialize metrics
        this.metrics = {
            lastPnL: 0,
            dailyVolume: 0,
            successRate: 0,
            averageReturnPerTrade: 0
        };

        this.startTradingLoop();
    }

    private startTradingLoop() {
        // Run trading loop every hour
        this.interval = setInterval(
            () => {
                this.makeTrades();
            },
            60 * 1000 // 1 hour interval
        );

        // Start first trade immediately
        this.makeTrades();
    }

    private async makeTrades() {
        if (this.tradingState.isActive) {
            elizaLogger.log("Trading already in progress, skipping cycle");
            return;
        }

        this.tradingState.isActive = true;

        try {
            const dummyMemory: Memory = {
                content: { text: "Auto Trading" },
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId: stringToUuid("auto-trading")
            };

            // Create analysis context with metrics
            const context = {
                character: this.runtime.character,
                safetyLimits: SAFETY_LIMITS,
                tradingMetrics: this.metrics,
                tradingState: {
                    totalTrades: this.tradingState.totalTradesExecuted,
                    successRate: this.calculateSuccessRate()
                }
            };

            // Get recommendations from strategy evaluator
            const evaluator = this.runtime.evaluators.find(e => e.name === "STRATEGY_EVALUATOR");
            if (!evaluator) {
                throw new Error("Strategy evaluator not found");
            }

            const result = await evaluator.handler(this.runtime, {
                ...dummyMemory,
                content: { text: "Auto Trading", context }
            }) as DefiRecommendation;

            console.log(result);

            // if (!this.validateRecommendations(result)) {
            //     throw new Error("Invalid recommendations received from evaluator");
            // }

            // Execute trades based on recommendations
            await this.executeTrades(result, dummyMemory);

            // Update metrics after successful execution
            await this.updateMetrics(result);

            elizaLogger.log(`[${new Date().toISOString()}] Trading cycle completed for ${this.runtime.character.name}`);
            
            // Update trading state
            this.tradingState.successfulTrades++;
            this.tradingState.totalTradesExecuted++;
            this.tradingState.lastTradeTime = Date.now();

        } catch (error) {
            elizaLogger.error(`[${new Date().toISOString()}] Trading error for ${this.runtime.character.name}:`, error);
            this.tradingState.failedTrades++;
        } finally {
            this.tradingState.isActive = false;
        }
    }

    private validateRecommendations(result: DefiRecommendation): boolean {
        if (!result || !result.recommendations || !result.protocolTotals) {
            return false;
        }

        // Validate each recommendation
        for (const rec of result.recommendations) {
            if (!rec.protocol || !rec.token || !rec.amount || !rec.expectedReturn) {
                return false;
            }
        }

        // Validate protocol totals match recommendations
        const calculatedTotals: Record<string, number> = {};
        result.recommendations.forEach(rec => {
            calculatedTotals[rec.protocol] = (calculatedTotals[rec.protocol] || 0) + rec.amount;
        });

        for (const [protocol, total] of Object.entries(result.protocolTotals)) {
            if (calculatedTotals[protocol] !== total) {
                return false;
            }
        }

        return true;
    }

    private async executeTrades(result: DefiRecommendation, dummyMemory: Memory) {
        const executeAction = this.runtime.actions.find(a => a.name === "EXECUTE_STRATEGY");
        if (!executeAction) {
            throw new Error("Execute action not found");
        }

        elizaLogger.log("Executing trades for recommendations:", result);

        await executeAction.handler(this.runtime, {
            ...dummyMemory,
            content: {
                text: "Auto Trading",
                recommendations: result.recommendations,
                protocolTotals: result.protocolTotals
            }
        });

        // Update total volume
        const totalVolume = Object.values(result.protocolTotals).reduce((sum, val) => sum + val, 0);
        this.tradingState.totalVolume += totalVolume;
    }

    private async updateMetrics(result: DefiRecommendation) {
        // Calculate total volume for this trade
        const currentVolume = Object.values(result.protocolTotals).reduce((sum, val) => sum + val, 0);

        // Update metrics
        this.metrics = {
            lastPnL: this.calculatePnL(result.recommendations),
            dailyVolume: this.metrics.dailyVolume + currentVolume,
            successRate: this.calculateSuccessRate(),
            averageReturnPerTrade: this.calculateAverageReturn(result.recommendations)
        };
    }

    private calculateSuccessRate(): number {
        if (this.tradingState.totalTradesExecuted === 0) return 0;
        return this.tradingState.successfulTrades / this.tradingState.totalTradesExecuted;
    }

    private calculatePnL(recommendations: DefiRecommendation["recommendations"]): number {
        return recommendations.reduce((total, rec) => {
            return total + (rec.amount * (rec.expectedReturn / 100));
        }, 0);
    }

    private calculateAverageReturn(recommendations: DefiRecommendation["recommendations"]): number {
        if (recommendations.length === 0) return 0;
        
        const totalReturn = recommendations.reduce((sum, rec) => sum + rec.expectedReturn, 0);
        return totalReturn / recommendations.length;
    }

    public getStatus() {
        return {
            tradingState: this.tradingState,
            metrics: this.metrics,
            lastUpdate: new Date().toISOString()
        };
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.tradingState.isActive = false;
        elizaLogger.log(`[${new Date().toISOString()}] Trading stopped for ${this.runtime.character.name}`);
    }
}