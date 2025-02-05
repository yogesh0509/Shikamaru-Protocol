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
} from "@elizaos/core";
import { RiskLevel } from "../providers/portfolioManager";
import { investmentStrategyProvider } from "../providers/investmentStrategy";

const shouldProcessTemplate =
    `# Task: Decide if the recent messages should be processed for DeFi investment recommendations.

    Look for messages that:
    - Mention specific DeFi protocols or tokens
    - Discuss investment strategies, yields, or APY
    - Express interest in DeFi mutual funds or portfolio management
    - Ask about risk levels or investment preferences

    Based on the following conversation, should the messages be processed for DeFi recommendations? YES or NO

    {{recentMessages}}

    Should the messages be processed for DeFi recommendations? ` + booleanFooter;

export const formatRecommendations = (recommendations: Memory[]) => {
    const messageStrings = recommendations
        .reverse()
        .map((rec: Memory) => `${(rec.content as Content)?.content}`);
    const finalMessageStrings = messageStrings.join("\n");
    return finalMessageStrings;
};

const recommendationTemplate = `TASK: Extract DeFi investment recommendations from the conversation as an array of objects in JSON format.

    DeFi recommendations usually include:
    - Protocol name and contract address
    - Token pairs and their addresses
    - Risk level (LOW, MEDIUM, HIGH)
    - Expected APY or yield
    - Investment conviction level (none, low, medium, high)
    - Investment type (yield farming, lending, liquidity provision)

# START OF EXAMPLES
These are examples of the expected output of this task:
{{evaluationExamples}}
# END OF EXAMPLES

# INSTRUCTIONS

Extract any new DeFi recommendations from the conversation that are not already present in the list of known recommendations below:
{{recentRecommendations}}

- Include the recommender's username
- Try not to include already-known recommendations
- Set the conviction to 'none', 'low', 'medium' or 'high'
- Set the risk level to 'LOW', 'MEDIUM' or 'HIGH'
- Include protocol addresses and token addresses if available

Recent Messages:
{{recentMessages}}

Response should be a JSON object array inside a JSON markdown block. Correct response format:
\`\`\`json
[
  {
    "recommender": string,
    "protocol": string,
    "protocolAddress": string | null,
    "token0": string | null,
    "token1": string | null,
    "riskLevel": enum<LOW|MEDIUM|HIGH>,
    "expectedApy": number,
    "investmentType": enum<yield_farming|lending|liquidity>,
    "conviction": enum<none|low|medium|high>,
    "alreadyKnown": boolean
  },
  ...
]
\`\`\``;

interface InvestmentAnalysis {
    marketAnalysis: {
        price: number;
        priceChange24h: number;
        volume24h: number;
        technicalAnalysis: {
            rsi: number;
            macd: {
                value: number;
                signal: number;
                histogram: number;
            };
            movingAverages: {
                sma20: number;
                sma50: number;
                sma200: number;
                ema20: number;
            };
        };
        volatilityMetrics: {
            volatility24h: number;
            maxDrawdown: number;
            sharpeRatio: number;
        };
    };
    protocolAnalysis: {
        tvl: number;
        apy: {
            conservative: number;
            moderate: number;
            aggressive: number;
        };
        riskMetrics: {
            impermanentLossRisk: number;
            smartContractRisk: number;
            marketRisk: number;
            composabilityRisk: number;
            overallRisk: number;
        };
        healthScore: number;
    };
    portfolioState: {
        totalValue: number;
        positions: Array<{
            protocol: string;
            token: string;
            amount: number;
            value: number;
        }>;
        riskLevel: RiskLevel;
        performance: {
            daily: number;
            weekly: number;
            monthly: number;
        };
    };
    rebalanceNeeded: boolean;
    rebalanceReason: string;
    marketSentiment: {
        overall: number;
        factors: {
            priceAction: number;
            volatility: number;
            volume: number;
            technicals: number;
        };
    };
}

async function analyzeInvestment(
    runtime: IAgentRuntime,
    protocol: string,
    token0: string,
    token1: string | null
): Promise<InvestmentAnalysis> {
    const strategyData = JSON.parse(
        await investmentStrategyProvider.get(runtime, {} as Memory)
    );

    const token0Data = strategyData.marketData[token0];
    const protocolInfo = strategyData.protocols[protocol];

    return {
        marketAnalysis: {
            price: token0Data.price,
            priceChange24h: token0Data.priceChange24h,
            volume24h: token0Data.volume24h,
            technicalAnalysis: token0Data.technicalAnalysis,
            volatilityMetrics: token0Data.volatilityMetrics
        },
        protocolAnalysis: {
            tvl: protocolInfo.tvl,
            apy: protocolInfo.apy,
            riskMetrics: protocolInfo.riskMetrics,
            healthScore: protocolInfo.healthScore
        },
        portfolioState: strategyData.portfolioState,
        rebalanceNeeded: strategyData.rebalanceNeeded,
        rebalanceReason: strategyData.rebalanceReason,
        marketSentiment: strategyData.marketSentiment
    };
}

function evaluateInvestmentRisk(analysis: InvestmentAnalysis): RiskLevel {
    const riskFactors = {
        marketRisk: 0,
        protocolRisk: 0
    };

    // Evaluate market risk
    if (analysis.marketAnalysis.volatilityMetrics.volatility24h > 0.5) riskFactors.marketRisk += 1;
    if (analysis.marketAnalysis.volatilityMetrics.maxDrawdown > 20) riskFactors.marketRisk += 1;
    if (analysis.marketAnalysis.technicalAnalysis.rsi > 70 || analysis.marketAnalysis.technicalAnalysis.rsi < 30) riskFactors.marketRisk += 1;
    if (analysis.marketAnalysis.volatilityMetrics.sharpeRatio < 1) riskFactors.marketRisk += 1;

    // Evaluate protocol risk
    if (analysis.protocolAnalysis.riskMetrics.overallRisk > 0.4) riskFactors.protocolRisk += 1;
    if (analysis.protocolAnalysis.tvl < 1000000) riskFactors.protocolRisk += 1;
    if (analysis.protocolAnalysis.healthScore < 70) riskFactors.protocolRisk += 1;
    if (analysis.protocolAnalysis.riskMetrics.smartContractRisk > 0.3) riskFactors.protocolRisk += 1;

    const totalRisk = riskFactors.marketRisk + riskFactors.protocolRisk;
    
    if (totalRisk <= 2) return RiskLevel.LOW;
    if (totalRisk <= 4) return RiskLevel.MEDIUM;
    return RiskLevel.HIGH;
}

async function handler(runtime: IAgentRuntime, message: Memory) {
    elizaLogger.log("Evaluating for DeFi opportunities");
    const state = await runtime.composeState(message);

    // Check if we should process the messages
    const shouldProcessContext = composeContext({
        state,
        template: shouldProcessTemplate,
    });

    const shouldProcess = await generateTrueOrFalse({
        context: shouldProcessContext,
        modelClass: ModelClass.SMALL,
        runtime,
    });

    if (!shouldProcess) {
        elizaLogger.log("Skipping process");
        return [];
    }

    elizaLogger.log("Processing DeFi recommendations");

    const recommendationsManager = new MemoryManager({
        runtime,
        tableName: "defi_recommendations",
    });

    const context = composeContext({
        state,
        template: recommendationTemplate,
    });

    const recommendations = await generateObjectArray({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    if (!recommendations) {
        return [];
    }

    // Filter and enhance recommendations with investment analysis
    const filteredRecommendations = [];
    for (const rec of recommendations) {
        if (
            !rec.alreadyKnown &&
            rec.protocol &&
            rec.riskLevel &&
            rec.recommender &&
            rec.conviction &&
            rec.recommender.trim() !== ""
        ) {
            try {
                // Analyze the investment using the strategy provider
                const analysis = await analyzeInvestment(
                    runtime,
                    rec.protocol,
                    rec.token0,
                    rec.token1
                );

                // Evaluate risk based on analysis
                const calculatedRisk = evaluateInvestmentRisk(analysis);

                // Enhance recommendation with analysis
                const enhancedRec = {
                    ...rec,
                    riskLevel: calculatedRisk,
                    analysis: {
                        market: analysis.marketAnalysis,
                        protocol: analysis.protocolAnalysis,
                        portfolio: {
                            state: analysis.portfolioState,
                            rebalanceNeeded: analysis.rebalanceNeeded,
                            rebalanceReason: analysis.rebalanceReason
                        },
                        marketSentiment: analysis.marketSentiment
                    }
                };

                filteredRecommendations.push(enhancedRec);
            } catch (error) {
                elizaLogger.error(`Error analyzing recommendation for ${rec.protocol}:`, error);
            }
        }
    }

    // Store enhanced recommendations
    for (const rec of filteredRecommendations) {
        const recMemory = {
            userId: message.userId,
            agentId: message.agentId,
            content: { text: JSON.stringify(rec) },
            roomId: message.roomId,
            createdAt: Date.now(),
        };

        await recommendationsManager.createMemory(recMemory, true);
    }

    return filteredRecommendations;
}

export const defiEvaluator: Evaluator = {
    name: "EXTRACT_DEFI_RECOMMENDATIONS",
    similes: [
        "GET_DEFI_RECOMMENDATIONS",
        "EXTRACT_PROTOCOL_RECS",
        "EXTRACT_INVESTMENT_RECS",
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
        "Extract DeFi investment recommendations from conversations, including protocol details, risk levels, and expected returns.",
    handler,
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: Experienced DeFi investor. Focuses on yield farming.
{{user2}}: New to DeFi, interested in low-risk investments.`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "JediSwap on StarkNet is looking really good right now. The ETH-USDC pool at their router 0x041fd22b238fa21cfcf5dd45a8548974d8263b3a531a60388411c5e230f97023 is giving 15% APY with relatively low risk.",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "That sounds interesting! Is it safe to invest there? I'm new to DeFi and want to start with something conservative.",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Yeah, JediSwap is one of the most established DEXes on StarkNet. The ETH-USDC pair is pretty stable. I'd say it's a good entry point for beginners.",
                    },
                },
            ],
            outcome: `\`\`\`json
[
  {
    "recommender": "{{user1}}",
    "protocol": "JEDISWAP",
    "protocolAddress": "0x041fd22b238fa21cfcf5dd45a8548974d8263b3a531a60388411c5e230f97023",
    "token0": "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "token1": "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    "riskLevel": "LOW",
    "expectedApy": 15,
    "investmentType": "liquidity",
    "conviction": "high",
    "alreadyKnown": false
  }
]
\`\`\``,
        },
        {
            context: `Actors in the scene:
{{user1}}: Risk-seeking investor. Prefers high-yield opportunities.
{{user2}}: Moderate investor. Balances risk and reward.`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "zkLend's lending platform is offering insane yields right now. You can get 25% APY lending ETH at 0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Those rates seem too good to be true. What's the catch?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Higher risk, higher reward. It's using their new lending protocol which is still in beta. But the smart contracts are audited.",
                    },
                },
            ],
            outcome: `\`\`\`json
[
  {
    "recommender": "{{user1}}",
    "protocol": "ZKLEND",
    "protocolAddress": "0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05",
    "token0": "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "token1": null,
    "riskLevel": "HIGH",
    "expectedApy": 25,
    "investmentType": "lending",
    "conviction": "high",
    "alreadyKnown": false
  }
]
\`\`\``,
        },
        {
            context: `Actors in the scene:
{{user1}}: Conservative investor. Prefers stable returns.
{{user2}}: Yield farmer. Actively manages positions.`,
            messages: [
                {
                    user: "{{user2}}",
                    content: {
                        text: "The USDC-USDT pool on mySwap (0x010884171baf1914edc28d7afb619b40a4051cfae78a094a55d230f19e944a28) is perfect for stable farming. Steady 8% APY with minimal impermanent loss risk.",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "That's more my speed. How long have you been farming there?",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "About 3 months now. Super reliable, perfect for conservative portfolios.",
                    },
                },
            ],
            outcome: `\`\`\`json
[
  {
    "recommender": "{{user2}}",
    "protocol": "MYSWAP",
    "protocolAddress": "0x010884171baf1914edc28d7afb619b40a4051cfae78a094a55d230f19e944a28",
    "token0": "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    "token1": "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    "riskLevel": "LOW",
    "expectedApy": 8,
    "investmentType": "yield_farming",
    "conviction": "high",
    "alreadyKnown": false
  }
]
\`\`\``,
        },
    ],
}; 