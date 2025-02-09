import { IAgentRuntime, Memory } from "@elizaos/core";
import { SAFETY_LIMITS } from "../utils.ts";
// import { Provider } from "../providers";
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

export class AutoClient {
    private runtime: IAgentRuntime;
    private interval: NodeJS.Timeout;
    private isTrading: boolean = false;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.startTradingLoop();
    }

    private startTradingLoop() {
        // Run trading loop every hour
        this.interval = setInterval(
            () => {
                this.makeTrades();
            },
            60 * 60 * 1000 // 1 hour interval
        );

        // Start first trade immediately
        this.makeTrades();
    }

    private async makeTrades() {
        if (this.isTrading) return; // Prevent concurrent trading
        this.isTrading = true;

        try {
            const dummyMemory: Memory = {
                content: { text: "Auto Trading" },
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId: stringToUuid("auto-trading")
            };

            // Create analysis context
            const context = {
                character: this.runtime.character,
                safetyLimits: SAFETY_LIMITS
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

            if (!result || !result.recommendations || !result.protocolTotals) {
                throw new Error("Invalid recommendations format received from evaluator");
            }

            // Execute trades based on recommendations
            const executeAction = this.runtime.actions.find(a => a.name === "EXECUTE_STRATEGY");
            if (!executeAction) {
                throw new Error("Execute action not found");
            }

            console.log("Executing trades for recommendations:", result);

            // Execute all recommendations in one go
            await executeAction.handler(this.runtime, {
                ...dummyMemory,
                content: {
                    text: "Auto Trading",
                    recommendations: result.recommendations,
                    protocolTotals: result.protocolTotals
                }
            });

            console.log(`[${new Date().toISOString()}] Trading cycle completed for ${this.runtime.character.name}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Trading error for ${this.runtime.character.name}:`, error);
        } finally {
            this.isTrading = false;
        }
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }
} 