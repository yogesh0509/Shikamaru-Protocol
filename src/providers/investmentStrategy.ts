import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { RiskLevel, STARKNET_PROTOCOLS } from "./utils.ts";
import { protocolDataProvider } from "./protocol.ts";
import { portfolioManagerProvider } from "./portfolioManager.ts";
import { investmentProvider } from "./investment.ts";

interface InvestmentRecommendation {
    protocol: string;
    token: string;
    amount: number;
    expectedReturn: number;
    riskScore: number;
    confidence: number;
    poolData?: {
        token0Address: string;
        token1Address: string;
        fee: number;
        tickSpacing: number;
    };
}

interface RiskStrategy {
    maxDrawdown: number;
    riskLevel: RiskLevel;
    protocols: {
        [key: string]: {
            name: string;
            type: string;
            maxAllocation: number;
            minAllocation: number;
        }
    };
    crossProtocolMetrics: {
        rebalanceThreshold: number;
        maxVolatility: number;
        correlationLimit: number;
        totalDrawdownLimit: number;
    }
}

// Strategy configurations for different risk levels
const STRATEGY_CONFIGS: Record<RiskLevel, RiskStrategy> = {
    [RiskLevel.LOW]: {
        maxDrawdown: 0.05,
        riskLevel: RiskLevel.LOW,
        protocols: {
            zkLend: {
                name: 'zkLend',
                type: 'LENDING',
                maxAllocation: 80,
                minAllocation: 60,
            },
            ekubo: {
                name: 'Ekubo',
                type: 'AMM',
                maxAllocation: 20,
                minAllocation: 10,
            }
        },
        crossProtocolMetrics: {
            rebalanceThreshold: 5,
            maxVolatility: 12,
            correlationLimit: 0.4,
            totalDrawdownLimit: 8
        }
    },

    [RiskLevel.MEDIUM]: {
        maxDrawdown: 0.15,
        riskLevel: RiskLevel.MEDIUM,
        protocols: {
            zkLend: {
                name: 'zkLend',
                type: 'LENDING',
                maxAllocation: 65,
                minAllocation: 45,
            },
            ekubo: {
                name: 'Ekubo',
                type: 'AMM',
                maxAllocation: 35,
                minAllocation: 25,
            }
        },
        crossProtocolMetrics: {
            rebalanceThreshold: 8,
            maxVolatility: 20,
            correlationLimit: 0.6,
            totalDrawdownLimit: 15
        }
    },

    [RiskLevel.HIGH]: {
        maxDrawdown: 0.30,
        riskLevel: RiskLevel.HIGH,
        protocols: {
            zkLend: {
                name: 'zkLend',
                type: 'LENDING',
                maxAllocation: 45,
                minAllocation: 25,
            },
            ekubo: {
                name: 'Ekubo',
                type: 'AMM',
                maxAllocation: 55,
                minAllocation: 35,
            }
        },
        crossProtocolMetrics: {
            rebalanceThreshold: 10,
            maxVolatility: 30,
            correlationLimit: 0.8,
            totalDrawdownLimit: 25
        }
    }
};

// StarkNet token configuration
const SUPPORTED_TOKENS = {
    ETH: 'ETH',
    USDC: 'USDC',
    USDT: 'USDT',
    STRK: 'STRK'
} as const;

export const investmentStrategyProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
        try {
            const portfolioData = await portfolioManagerProvider();
            const tokenData = await protocolDataProvider();
            const investmentData = JSON.parse(await investmentProvider.get(runtime, message));
            
            // Map character name to risk level
            let userRiskLevel: RiskLevel;
            const characterName = runtime.character?.name?.toLowerCase() || '';
            
            if (characterName.includes('conservative')) {
                userRiskLevel = RiskLevel.LOW;
            } else if (characterName.includes('moderate')) {
                userRiskLevel = RiskLevel.MEDIUM;
            } else if (characterName.includes('aggressive')) {
                userRiskLevel = RiskLevel.HIGH;
            } else {
                userRiskLevel = RiskLevel.MEDIUM; // Default to medium risk if unknown
            }

            // Get strategy config and ensure it exists
            const strategyConfig = STRATEGY_CONFIGS[userRiskLevel];
            if (!strategyConfig) {
                console.error(`No strategy config found for risk level: ${userRiskLevel}`);
                return JSON.stringify({ recommendations: [] });
            }

            const marketSentiment = portfolioData.overall;

            // Generate investment recommendations
            const recommendations = generateRecommendations(
                strategyConfig,
                tokenData,
                marketSentiment,
                investmentData.totalAmount
            );

            console.log("Final recommendations:", recommendations);

            return JSON.stringify({
                recommendations,
                riskLevel: userRiskLevel,
                totalAmount: investmentData.totalAmount
            });
        } catch (error) {
            console.error("Error in investment strategy provider:", error);
            throw error;
        }
    }
};

function generateRecommendations(
    config: RiskStrategy,
    tokenData: any,
    sentiment: any,
    totalAmount: number
): InvestmentRecommendation[] {
    console.log("Starting recommendation generation with:", {
        riskLevel: config.riskLevel,
        totalAmount,
        sentiment
    });

    const recommendations: InvestmentRecommendation[] = [];
    const pools = tokenData.pools;

    // Separate pools by protocol
    const poolsByProtocol: { [key: string]: any[] } = {};
    pools.forEach((pool: any) => {
        // Normalize protocol names to lowercase for comparison
        const poolProtocol = pool.protocol.toLowerCase();
        const protocolKey = Object.entries(STARKNET_PROTOCOLS).find(
            ([key, value]) => value.toLowerCase() === poolProtocol
        )?.[0];
        
        if (Object.values(SUPPORTED_TOKENS).includes(pool.token0) && protocolKey) {
            if (!poolsByProtocol[protocolKey]) {
                poolsByProtocol[protocolKey] = [];
            }
            poolsByProtocol[protocolKey].push(pool);
        }
    });

    // Calculate risk-adjusted returns for each pool
    Object.keys(poolsByProtocol).forEach(protocol => {
        console.log(`Calculating risk-adjusted returns for ${protocol}`);
        poolsByProtocol[protocol] = poolsByProtocol[protocol]
            .map(pool => {
                const riskAdjusted = calculateRiskAdjustedReturn(pool, config);
                const marketFit = calculateMarketFit(pool, sentiment);
                console.log(`Pool ${protocol}/${pool.token0}:`, {
                    apy: pool.apy,
                    riskAdjusted,
                    marketFit
                });
                return {
                    ...pool,
                    riskAdjustedReturn: riskAdjusted,
                    marketFit: marketFit
                };
            })
            .sort((a, b) => b.riskAdjustedReturn - a.riskAdjustedReturn);
    });

    // Allocate funds according to protocol constraints
    Object.entries(config.protocols).forEach(([protocol, protocolConfig]) => {
        // Normalize protocol name for comparison
        const normalizedProtocol = protocol.toLowerCase();
        console.log(`Processing allocations for ${protocol}:`, protocolConfig);

        // Find matching pools using case-insensitive comparison
        const matchingPools = poolsByProtocol[Object.keys(poolsByProtocol).find(
            key => key.toLowerCase() === normalizedProtocol
        ) || protocol];

        if (!matchingPools || matchingPools.length === 0) {
            console.log(`No pools found for ${protocol}, skipping`);
            return;
        }

        // Calculate allocation for this protocol based on strategy config
        const minAllocation = protocolConfig.minAllocation / 100;
        const maxAllocation = protocolConfig.maxAllocation / 100;
        
        // Start with minimum allocation, adjust based on market conditions
        let protocolAllocation = minAllocation;
        const marketConditionBonus = matchingPools[0].marketFit * 
            (maxAllocation - minAllocation);
        protocolAllocation = Math.min(maxAllocation, 
            protocolAllocation + marketConditionBonus);

        // Calculate actual amount for this protocol
        const protocolAmount = totalAmount * protocolAllocation;

        // Select top pools for this protocol
        const selectedPools = matchingPools
            .slice(0, Math.min(3, matchingPools.length));

        // Distribute protocol allocation among selected pools
        const totalRiskAdjustedReturn = selectedPools
            .reduce((sum, pool) => sum + pool.riskAdjustedReturn, 0);

        console.log(`${protocol} pool distribution:`, {
            selectedPools: selectedPools.length,
            totalRiskAdjustedReturn
        });

        selectedPools.forEach(pool => {
            const poolWeight = pool.riskAdjustedReturn / totalRiskAdjustedReturn;
            const amount = protocolAmount * poolWeight;

                if (pool.protocol === 'Ekubo') {
                    // For Ekubo, add a single recommendation with both token symbols
                    recommendations.push({
                        protocol: pool.protocol,
                        token: `${pool.token0}/${pool.token1}`, // Show both tokens in the pair
                        amount: amount,
                        expectedReturn: pool.apy,
                        riskScore: calculatePoolRiskScore(pool),
                        confidence: calculateConfidenceScore(pool, sentiment),
                        poolData: {
                            token0Address: pool.token0Address,
                            token1Address: pool.token1Address,
                            fee: pool.fee,
                            tickSpacing: pool.tickSpacing
                        }
                    });
                } else {
                    // For other protocols, keep existing logic
                    recommendations.push({
                        protocol: pool.protocol,
                        token: pool.token0,
                        amount: amount,
                        expectedReturn: pool.apy,
                        riskScore: calculatePoolRiskScore(pool),
                        confidence: calculateConfidenceScore(pool, sentiment)
                    });
                }

                console.log(`Adding recommendation for ${protocol}/${pool.token0}${pool.protocol === 'Ekubo' ? `/${pool.token1}` : ''}:`, {
                    poolWeight,
                    amount,
                    expectedReturn: pool.apy,
                    isEkubo: pool.protocol === 'Ekubo'
                });
            });
        
    });

    console.log("Final recommendations before return:", recommendations);
    return recommendations;
}

function calculateRiskAdjustedReturn(pool: any, config: RiskStrategy): number {
    if (!config) {
        console.log("No config provided for risk adjustment");
        return 0;
    }

    // Extract APY from pool data
    const apy = pool.apy || pool.apr || 0;
    
    // Calculate volatility from volume/TVL ratio as a proxy
    const volume = pool.volume24h?.usd || pool.volume24h || 0;
    const tvl = pool.tvl?.usd || pool.tvl || 1; // Avoid division by zero
    const volatility = volume / tvl;
    
    // Calculate Sharpe ratio with a minimum volatility floor
    const sharpeRatio = (apy - 0.02) / (volatility || 0.1); // Assuming 2% risk-free rate
    
    // Use volume/TVL ratio as a proxy for drawdown risk
    const estimatedDrawdown = Math.min(volatility, 0.3); // Cap at 30%
    const drawdownPenalty = Math.max(0, estimatedDrawdown - (config.maxDrawdown || 0.15));
    
    const result = Math.max(0, sharpeRatio * (1 - drawdownPenalty));
    return result;
}

function calculateMarketFit(pool: any, sentiment: any): number {
    const sentimentAlignment = 
        sentiment.overall > 0 ? pool.apy : (1 / pool.volatility);
    const volumeScore = Math.min(pool.volume24h / 1e6, 1);
    const tvlScore = Math.min(pool.tvl / 1e7, 1);
    
    return (sentimentAlignment * 0.4) + (volumeScore * 0.3) + (tvlScore * 0.3);
}

function calculatePoolRiskScore(pool: any): number {
    const utilizationRisk = pool.totalBorrow / pool.totalSupply;
    const volatilityRisk = Math.min(pool.volatility / 100, 1);
    const tvlRisk = Math.max(0, 1 - pool.tvl / 1e7);
    
    return (utilizationRisk * 0.4) + (volatilityRisk * 0.3) + (tvlRisk * 0.3);
}

function calculateConfidenceScore(pool: any, sentiment: any): number {
    const marketAlignment = 0.5 + (sentiment.overall * 0.5); // 0-1 scale
    const dataQuality = calculateDataQuality(pool);
    const historicalAccuracy = pool.historicalAccuracy || 0.5;
    
    return (marketAlignment * 0.4) + (dataQuality * 0.3) + (historicalAccuracy * 0.3);
}

function calculateDataQuality(pool: any): number {
    const hasRequiredFields = [
        'apy', 'tvl', 'volume24h', 'liquidity'
    ].every(field => pool[field] !== undefined);
    
    const dataFreshness = (Date.now() - (pool.lastUpdate || 0)) < 3600000; // 1 hour
    const dataCompleteness = Object.keys(pool).length / 10; // Assuming 10 key metrics
    
    return (hasRequiredFields ? 0.4 : 0) +
           (dataFreshness ? 0.3 : 0) +
           (Math.min(dataCompleteness, 1) * 0.3);
}