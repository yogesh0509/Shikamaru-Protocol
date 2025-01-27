import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";

interface Provider {
    name: string;
    get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}

interface Strategy {
    allocations: Array<{
        protocol: string;
        amount: number;
        expectedApy?: number;
        strategy?: string;
    }>;
}

interface ProtocolInfo {
    tvl: number;
    apy: number;
    audits: number;
    launchYear: number;
}

interface MarketData {
    [pair: string]: {
        volatility: 'low' | 'medium' | 'high';
        volume: number;
        liquidity: number;
    };
}

interface RiskAssessment {
    riskLevels: {
        [level: string]: {
            maxDrawdown: string;
            requiredAudits: number;
        };
    };
}

// Action for executing investment strategy
export const executeStrategyAction: Action = {
    name: "EXECUTE_STRATEGY",
    similes: ["INVEST", "DEPLOY_FUNDS"],
    description: "Executes investment strategy based on evaluator recommendations",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text?.toLowerCase() || '';
        return text.includes('invest') || text.includes('buy') || text.includes('execute');
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        // Get strategy from evaluator
        const evaluator = runtime.evaluators.find(e => e.name === "STRATEGY_EVALUATOR");
        if (!evaluator) return false;

        const strategy = await evaluator.handler(runtime, message, state) as Strategy;
        if (!strategy) return false;

        // Execute each allocation in the strategy
        const results = await Promise.all(strategy.allocations.map(async (allocation) => {
            if (allocation.protocol === 'Reserve') {
                return {
                    protocol: 'Reserve',
                    status: 'HELD',
                    amount: allocation.amount
                };
            }

            // Get protocol details
            const provider = runtime.providers.find((p: Provider) => p.name === "protocol");
            const protocolData = provider ? await provider.get(runtime, message, state) : '{}';
            const protocols = JSON.parse(protocolData) as Record<string, ProtocolInfo>;
            const protocolInfo = protocols[allocation.protocol];

            return {
                protocol: allocation.protocol,
                status: 'EXECUTED',
                amount: allocation.amount,
                expectedApy: allocation.expectedApy,
                tvl: protocolInfo?.tvl,
                strategy: allocation.strategy
            };
        }));

        // Store execution results
        const executionId = stringToUuid(`execution-${message.userId}-${Date.now()}`);
        await runtime.messageManager.createMemory({
            id: executionId,
            content: {
                text: `Strategy Execution:\n${JSON.stringify(results, null, 2)}`,
                execution: results
            },
            userId: message.userId,
            roomId: message.roomId,
            agentId: runtime.agentId,
        });

        return true;
    },
    examples: []
};

export const defiActions = [
    executeStrategyAction,
]; 