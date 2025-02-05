import { IAgentRuntime, Memory, State } from "@elizaos/core";
import { Provider } from './token';
import { RiskLevel, STARKNET_PROTOCOLS } from './portfolioManager';

interface StrategyConfig {
    riskLevel: RiskLevel;
    minInvestment: number;
    maxInvestment: number;
    rebalanceInterval: number; // in milliseconds
    targetReturn: number;
    maxDrawdown: number;
    diversificationFactor: number; // 0-1, higher means more diversified
}

interface InvestmentRecommendation {
    protocol: string;
    token: string;
    amount: number;
    expectedReturn: number;
    riskScore: number;
    confidence: number;
}

// Strategy configurations for different risk levels
const STRATEGY_CONFIGS: Record<RiskLevel, StrategyConfig> = {
    [RiskLevel.LOW]: {
        riskLevel: RiskLevel.LOW,
        minInvestment: 100,
        maxInvestment: 10000,
        rebalanceInterval: 7 * 24 * 60 * 60 * 1000, // 1 week
        targetReturn: 0.10, // 10% annual return
        maxDrawdown: 0.05, // 5% max drawdown
        diversificationFactor: 0.8
    },
    [RiskLevel.MEDIUM]: {
        riskLevel: RiskLevel.MEDIUM,
        minInvestment: 500,
        maxInvestment: 50000,
        rebalanceInterval: 3 * 24 * 60 * 60 * 1000, // 3 days
        targetReturn: 0.25, // 25% annual return
        maxDrawdown: 0.15, // 15% max drawdown
        diversificationFactor: 0.6
    },
    [RiskLevel.HIGH]: {
        riskLevel: RiskLevel.HIGH,
        minInvestment: 1000,
        maxInvestment: 100000,
        rebalanceInterval: 24 * 60 * 60 * 1000, // 1 day
        targetReturn: 0.50, // 50% annual return
        maxDrawdown: 0.30, // 30% max drawdown
        diversificationFactor: 0.4
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
    name: "investment_strategy",
    get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
        try {
            // Get data from other providers
            const marketData = JSON.parse(await runtime.providers.get("market"));
            const tokenData = JSON.parse(await runtime.providers.get("defi_token"));
            const portfolioData = JSON.parse(await runtime.providers.get("portfolio_manager"));

            // Extract user preferences and current market conditions
            const userRiskLevel = portfolioData.portfolioState.riskLevel;
            const strategyConfig = STRATEGY_CONFIGS[userRiskLevel];
            const marketSentiment = portfolioData.marketSentiment;

            // Generate investment recommendations
            const recommendations = generateRecommendations(
                strategyConfig,
                tokenData,
                marketData,
                marketSentiment
            );

            // Calculate strategy performance metrics
            const performanceMetrics = calculateStrategyPerformance(
                recommendations,
                portfolioData.portfolioState
            );

            return JSON.stringify({
                recommendations,
                performanceMetrics,
                nextRebalance: Date.now() + strategyConfig.rebalanceInterval,
                marketConditions: {
                    sentiment: marketSentiment,
                    volatility: calculateMarketVolatility(marketData),
                    trend: detectMarketTrend(marketData)
                }
            });
        } catch (error) {
            console.error("Error in investment strategy provider:", error);
            throw error;
        }
    }
};

function generateRecommendations(
    config: StrategyConfig,
    tokenData: any,
    marketData: any,
    sentiment: any
): InvestmentRecommendation[] {
    const recommendations: InvestmentRecommendation[] = [];
    const pools = tokenData.pools;

    // Filter pools by supported tokens and protocols
    const eligiblePools = pools.filter((pool: any) => {
        const isValidToken = Object.values(SUPPORTED_TOKENS).includes(pool.token0);
        const isValidProtocol = Object.values(STARKNET_PROTOCOLS).includes(pool.protocol);
        return isValidToken && isValidProtocol;
    });

    // Sort pools by risk-adjusted return
    const rankedPools = eligiblePools
        .map((pool: any) => ({
            ...pool,
            riskAdjustedReturn: calculateRiskAdjustedReturn(pool, config),
            marketFit: calculateMarketFit(pool, sentiment)
        }))
        .sort((a: any, b: any) => b.riskAdjustedReturn - a.riskAdjustedReturn);

    // Select top pools based on diversification factor
    const numPools = Math.max(2, Math.floor(rankedPools.length * config.diversificationFactor));
    const selectedPools = rankedPools.slice(0, numPools);

    // Generate recommendations for selected pools
    let remainingAllocation = 100;
    for (const pool of selectedPools) {
        const allocation = calculatePoolAllocation(
            pool,
            config,
            remainingAllocation,
            selectedPools.length
        );

        recommendations.push({
            protocol: pool.protocol,
            token: pool.token0,
            amount: allocation,
            expectedReturn: pool.apy,
            riskScore: calculatePoolRiskScore(pool),
            confidence: calculateConfidenceScore(pool, sentiment)
        });

        remainingAllocation -= allocation;
    }

    return recommendations;
}

function calculateRiskAdjustedReturn(pool: any, config: StrategyConfig): number {
    const sharpeRatio = (pool.apy - 0.02) / (pool.volatility || 0.1); // Assuming 2% risk-free rate
    const drawdownPenalty = Math.max(0, pool.maxDrawdown - config.maxDrawdown);
    return sharpeRatio * (1 - drawdownPenalty);
}

function calculateMarketFit(pool: any, sentiment: any): number {
    const sentimentAlignment = 
        sentiment.overall > 0 ? pool.apy : (1 / pool.volatility);
    const volumeScore = Math.min(pool.volume24h / 1e6, 1);
    const tvlScore = Math.min(pool.tvl / 1e7, 1);
    
    return (sentimentAlignment * 0.4) + (volumeScore * 0.3) + (tvlScore * 0.3);
}

function calculatePoolAllocation(
    pool: any,
    config: StrategyConfig,
    remainingAllocation: number,
    numPools: number
): number {
    const baseAllocation = remainingAllocation / numPools;
    const riskAdjustment = 1 - (pool.riskScore || 0);
    const sentimentAdjustment = pool.marketFit;
    
    return Math.min(
        remainingAllocation,
        baseAllocation * riskAdjustment * (1 + sentimentAdjustment)
    );
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

function calculateStrategyPerformance(
    recommendations: InvestmentRecommendation[],
    portfolioState: any
): any {
    const totalValue = portfolioState.totalValue;
    const weightedReturn = recommendations.reduce(
        (acc, rec) => acc + (rec.expectedReturn * rec.amount / 100),
        0
    );
    
    const portfolioVolatility = calculatePortfolioVolatility(
        recommendations,
        portfolioState.positions
    );
    
    return {
        expectedAnnualReturn: weightedReturn,
        volatility: portfolioVolatility,
        sharpeRatio: (weightedReturn - 0.02) / portfolioVolatility, // Assuming 2% risk-free rate
        diversificationScore: calculateDiversificationScore(recommendations),
        riskScore: calculatePortfolioRiskScore(recommendations)
    };
}

function calculatePortfolioVolatility(
    recommendations: InvestmentRecommendation[],
    currentPositions: any[]
): number {
    // Simplified portfolio volatility calculation
    const weightedVolatility = recommendations.reduce(
        (acc, rec) => acc + (rec.riskScore * rec.amount / 100),
        0
    );
    
    return weightedVolatility;
}

function calculateDiversificationScore(recommendations: InvestmentRecommendation[]): number {
    const protocols = new Set(recommendations.map(r => r.protocol));
    const tokens = new Set(recommendations.map(r => r.token));
    
    const protocolDiversity = protocols.size / recommendations.length;
    const tokenDiversity = tokens.size / recommendations.length;
    
    return (protocolDiversity + tokenDiversity) / 2;
}

function calculatePortfolioRiskScore(recommendations: InvestmentRecommendation[]): number {
    return recommendations.reduce(
        (acc, rec) => acc + (rec.riskScore * rec.amount / 100),
        0
    );
}

function calculateMarketVolatility(marketData: any): number {
    const volatilities = Object.values(marketData).map(
        (token: any) => token.volatility || 0
    );
    return volatilities.reduce((a: number, b: number) => a + b, 0) / volatilities.length;
}

function detectMarketTrend(marketData: any): string {
    const priceChanges = Object.values(marketData).map(
        (token: any) => token.priceChange24h || 0
    );
    const averageChange = priceChanges.reduce((a: number, b: number) => a + b, 0) / priceChanges.length;
    
    if (averageChange > 5) return "STRONG_BULLISH";
    if (averageChange > 2) return "BULLISH";
    if (averageChange < -5) return "STRONG_BEARISH";
    if (averageChange < -2) return "BEARISH";
    return "NEUTRAL";
} 