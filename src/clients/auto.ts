import { IAgentRuntime, Memory, State } from "@elizaos/core";
import { SAFETY_LIMITS } from "../utils.ts";
import { Provider } from "../providers";
import { stringToUuid } from "@elizaos/core";

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

            // Get market data
            const marketProvider = this.runtime.providers.find((p: Provider) => p.name === "market");
            const marketData = marketProvider ? JSON.parse(await marketProvider.get(this.runtime, dummyMemory)) : null;

            // // Get protocol data
            // const protocolProvider = this.runtime.providers.find((p: Provider) => p.name === "protocol");
            // const protocolData = protocolProvider ? JSON.parse(await protocolProvider.get(this.runtime, dummyMemory)) : null;

            // // Get current positions
            // const smartContractProvider = this.runtime.providers.find((p: Provider) => p.name === "smart_contract");
            // const positionData = smartContractProvider ? JSON.parse(await smartContractProvider.get(this.runtime, dummyMemory)) : null;

            // Create analysis context
            const context = {
                marketData,
                // protocolData,
                // positionData,
                character: this.runtime.character,
                safetyLimits: SAFETY_LIMITS
            };

            // Get recommendations from strategy evaluator
            const evaluator = this.runtime.evaluators.find(e => e.name === "STRATEGY_EVALUATOR");
            if (!evaluator) {
                throw new Error("Strategy evaluator not found");
            }

            const recommendations = await evaluator.handler(this.runtime, {
                ...dummyMemory,
                content: { text: "Auto Trading", context }
            });

            if (!recommendations) {
                throw new Error("No recommendations received from evaluator");
            }

            // Execute trades based on recommendations
            const executeAction = this.runtime.actions.find(a => a.name === "EXECUTE_STRATEGY");
            if (!executeAction) {
                throw new Error("Execute action not found");
            }

            await executeAction.handler(this.runtime, {
                ...dummyMemory,
                content: { text: "Auto Trading", recommendations }
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