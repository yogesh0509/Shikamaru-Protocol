import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { StarkNetTransactionHandler } from "./utils.ts";
import { Account, RpcProvider } from "starknet";

// Initialize StarkNet provider and account
const STARKNET_RPC = process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io";
const ACCOUNT_ADDRESS = process.env.STARKNET_ADDRESS;
const PRIVATE_KEY = process.env.STARKNET_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
    throw new Error("StarkNet account credentials not found in environment variables");
}

const provider = new RpcProvider({ nodeUrl: STARKNET_RPC });
const account = new Account(provider, ACCOUNT_ADDRESS, PRIVATE_KEY);
const handler = new StarkNetTransactionHandler(account, provider);

interface DefiRecommendation {
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
}

interface ActionContent {
    text: string;
    recommendations: DefiRecommendation[];
    protocolTotals: Record<string, number>;
}

// Action for executing investment strategy
export const executeStrategyAction: Action = {
    name: "EXECUTE_STRATEGY",
    similes: ["INVEST", "DEPLOY_FUNDS"],
    description: "Execute DeFi investment strategy across protocols",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text?.toLowerCase() || '';
        return text.includes('invest') || text.includes('buy') || text.includes('execute');
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            const content = message.content as unknown as ActionContent;
            if (!content.recommendations || !content.protocolTotals) {
                throw new Error("Invalid action format");
            }

            // Sort recommendations by protocol and confidence
            const sortedRecommendations = content.recommendations.sort((a, b) => {
                const confidenceScore = { high: 3, medium: 2, low: 1, none: 0 };
                if (a.protocol !== b.protocol) {
                    return a.protocol.localeCompare(b.protocol);
                }
                const aScore = (confidenceScore[a.confidence] * 0.7) + (a.expectedReturn * 0.3);
                const bScore = (confidenceScore[b.confidence] * 0.7) + (b.expectedReturn * 0.3);
                return bScore - aScore;
            });

            const results = [];
            // Process recommendations by protocol
            for (const protocol of Object.keys(content.protocolTotals)) {
                const protocolRecs = sortedRecommendations.filter(
                    rec => rec.protocol.toLowerCase() === protocol.toLowerCase()
                );

                // Execute transactions for this protocol's recommendations
                for (const rec of protocolRecs) {
                    try {
                        // Validate recommendation
                        if (rec.amount <= 0) {
                            console.warn(`Skipping invalid amount for ${rec.protocol}/${rec.token}: ${rec.amount}`);
                            continue;
                        }

                        // Execute protocol-specific transaction
                        let txHash;
                        if (rec.protocol.toLowerCase() === 'zklend') {
                            txHash = await handler.executeZklend(rec.token, rec.amount);
                        } else if (rec.protocol.toLowerCase() === 'ekubo') {
                            txHash = await handler.executeEkubo(rec.token, rec.amount);
                        } else {
                            console.warn(`Unsupported protocol: ${rec.protocol}`);
                            continue;
                        }

                        results.push({
                            protocol: rec.protocol,
                            token: rec.token,
                            amount: rec.amount,
                            txHash,
                            status: 'success'
                        });

                        console.log(`Successfully executed transaction for ${rec.protocol}/${rec.token}:`, {
                            amount: rec.amount,
                            expectedReturn: rec.expectedReturn,
                            txHash
                        });
                    } catch (error) {
                        console.error(`Error executing transaction for ${rec.protocol}/${rec.token}:`, error);
                        results.push({
                            protocol: rec.protocol,
                            token: rec.token,
                            amount: rec.amount,
                            error: error.message,
                            status: 'failed'
                        });
                    }
                }
            }

            return {
                success: results.some(r => r.status === 'success'),
                message: `Completed execution of ${results.length} recommendations`,
                results
            };
        } catch (error) {
            console.error("Error executing strategy:", error);
            return {
                success: false,
                message: error.message,
                error: error
            };
        }
    },
    examples: []
};

export const defiActions = [
    executeStrategyAction,
]; 