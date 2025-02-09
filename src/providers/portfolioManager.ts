import { marketProvider } from "./market.ts";

// Portfolio Manager Provider
export const portfolioManagerProvider = async () => {
    try {
        // Get current market conditions and protocol data
        // const marketProvider = runtime.providers.find(p => p.name === "market");
        // const protocolProvider = runtime.providers.find(p => p.name === "protocol");
        // const contractProvider = runtime.providers.find(p => p.name === "smart_contract");

        // if (!marketProvider) {
        //     throw new Error("Required providers not found");
        // }

        const marketData = JSON.parse(await marketProvider());
        // const protocolData = JSON.parse(await protocolProvider(runtime, message, state));
        // const contractData = JSON.parse(await contractProvider(runtime, message, state));

        // Calculate market sentiment and risk metrics
        const marketSentiment = calculateMarketSentiment(marketData.marketData);
        // const riskMetrics = calculateRiskMetrics(protocolData);

        // Determine optimal portfolio allocation based on market conditions
        // const portfolioState = await getPortfolioState(contractData);
        // const optimalAllocation = calculateOptimalAllocation(
        //     portfolioState.riskLevel,
        //     marketSentiment,
        //     riskMetrics,
        //     protocolData
        // );

        // Check if rebalancing is needed
        // const rebalanceNeeded = checkRebalanceNeeded(
        //     portfolioState,
        //     optimalAllocation,
        //     INVESTMENT_STRATEGIES[portfolioState.riskLevel].rebalanceThreshold
        // );

        // return JSON.stringify({
            // portfolioState,
            // optimalAllocation,
            // rebalanceNeeded,
            // marketSentiment,
            // riskMetrics
        // });
        return marketSentiment;
    } catch (error) {
        console.error("Error in portfolio manager:", error);
        throw error;
    }
}

// Helper function to calculate market sentiment
function calculateMarketSentiment(marketData: any) {
    const sentimentFactors = {
        priceAction: 0,
        volatility: 0,
        volume: 0,
        technicals: 0
    };

    // Analyze price action for StarkNet ecosystem tokens
    for (const token of Object.values(marketData)) {
        const tokenData = token as {
            priceChange24h: number;
            volatility: number;
            volume24h: number;
            volume24h_previous: number;
            technicalAnalysis: {
                rsi: number;
                macd: { histogram: number };
                movingAverages: { sma20: number; sma50: number };
            };
        };
        
        sentimentFactors.priceAction += Math.sign(tokenData.priceChange24h);
        sentimentFactors.volatility += tokenData.volatility > 30 ? -1 : 1;
        sentimentFactors.volume += tokenData.volume24h > tokenData.volume24h_previous ? 1 : -1;
        
        // Technical analysis signals
        const { rsi, macd, movingAverages } = tokenData.technicalAnalysis;
        sentimentFactors.technicals += (
            (rsi > 70 || rsi < 30 ? -1 : 1) +
            (macd.histogram > 0 ? 1 : -1) +
            (movingAverages.sma20 > movingAverages.sma50 ? 1 : -1)
        );
    }

    // Normalize sentiment scores
    const totalTokens = Object.keys(marketData).length;
    return {
        overall: Object.values(sentimentFactors).reduce((a, b) => a + b, 0) / (4 * totalTokens),
        factors: {
            priceAction: sentimentFactors.priceAction / totalTokens,
            volatility: sentimentFactors.volatility / totalTokens,
            volume: sentimentFactors.volume / totalTokens,
            technicals: sentimentFactors.technicals / (3 * totalTokens)
        }
    };
}

// Helper function to calculate risk metrics for StarkNet protocols
// function calculateRiskMetrics(protocolData: any) {
//     const riskMetrics: Record<string, any> = {};

//     for (const [protocol, data] of Object.entries(protocolData)) {
//         const tvl = (data as any).tvl || 0;
//         const apy = (data as any).apy || { conservative: 0, moderate: 0, aggressive: 0 };
//         const audits = (data as any).audits || 0;
//         const launchYear = (data as any).launchYear || 2023;

//         riskMetrics[protocol] = {
//             tvlRisk: calculateTVLRisk(tvl),
//             apyRisk: calculateAPYRisk(apy),
//             auditRisk: calculateAuditRisk(audits),
//             ageRisk: calculateAgeRisk(launchYear)
//         };
//     }

//     return riskMetrics;
// }

// // Helper functions for risk calculations
// function calculateTVLRisk(tvl: number): number {
//     return Math.max(0, Math.min(1, 1 - (tvl / 100000000)));
// }

// function calculateAPYRisk(apy: any): number {
//     const maxSafeAPY = 50;
//     return Math.max(0, Math.min(1, apy.aggressive / maxSafeAPY));
// }

// function calculateAuditRisk(audits: number): number {
//     return Math.max(0, Math.min(1, 1 - (audits / 5)));
// }

// function calculateAgeRisk(launchYear: number): number {
//     const currentYear = new Date().getFullYear();
//     return Math.max(0, Math.min(1, (currentYear - launchYear) / 5));
// }

// function calculateProtocolRiskScore(riskMetrics: any): number {
//     return (
//         riskMetrics.tvlRisk * 0.4 +
//         riskMetrics.apyRisk * 0.3 +
//         riskMetrics.auditRisk * 0.2 +
//         riskMetrics.ageRisk * 0.1
//     );
// }

// // Helper function to calculate optimal allocation
// function calculateOptimalAllocation(
//     riskLevel: RiskLevel,
//     marketSentiment: any,
//     riskMetrics: any,
//     protocolData: any
// ) {
//     const strategy = INVESTMENT_STRATEGIES[riskLevel];
//     const adjustedAllocation: Record<string, number> = {};

//     // Base allocation from strategy
//     let totalAllocation = 0;
//     for (const [category, allocation] of Object.entries(strategy.targetAllocation)) {
//         let adjustedPercentage = allocation.percentage;

//         // Adjust based on market sentiment
//         adjustedPercentage *= (1 + marketSentiment.overall);

//         // Calculate average risk score for protocols in this category
//         const categoryRiskScore = allocation.protocols.reduce((acc, protocol) => {
//             return acc + calculateProtocolRiskScore(riskMetrics[protocol]);
//         }, 0) / allocation.protocols.length;

//         // Adjust based on risk metrics
//         adjustedPercentage *= (1 - categoryRiskScore * 0.2);

//         // Adjust based on APY opportunities
//         const categoryAPY = allocation.protocols.reduce((acc, protocol) => {
//             const protocolAPY = protocolData[protocol]?.apy?.[riskLevel.toLowerCase()] || 0;
//             return acc + protocolAPY;
//         }, 0) / allocation.protocols.length;

//         if (categoryAPY > allocation.minAPY * 1.5) {
//             adjustedPercentage *= 1.2;
//         }

//         adjustedAllocation[category] = Math.max(0, Math.min(100, adjustedPercentage));
//         totalAllocation += adjustedAllocation[category];
//     }

//     // Normalize allocations to 100%
//     for (const category in adjustedAllocation) {
//         adjustedAllocation[category] = (adjustedAllocation[category] / totalAllocation) * 100;
//     }

//     return adjustedAllocation;
// }

// // Helper function to check if rebalancing is needed
// function checkRebalanceNeeded(
//     currentState: PortfolioState,
//     optimalAllocation: Record<string, number>,
//     threshold: number
// ): boolean {
//     const currentAllocation: Record<string, number> = {};
    
//     // Calculate current allocation percentages
//     for (const position of currentState.positions) {
//         currentAllocation[position.protocol] = (position.value / currentState.totalValue) * 100;
//     }

//     // Check if any allocation deviates more than the threshold
//     for (const [protocol, targetAllocation] of Object.entries(optimalAllocation)) {
//         const currentAllocPercentage = currentAllocation[protocol] || 0;
//         if (Math.abs(currentAllocPercentage - targetAllocation) > threshold) {
//             return true;
//         }
//     }

//     return false;
// }

// Helper function to get current portfolio state
// async function getPortfolioState(contractData: any): Promise<PortfolioState> {
//     return {
//         totalValue: contractData.totalFunds,
//         positions: contractData.currentPositions,
//         lastRebalance: Date.now(),
//         riskLevel: RiskLevel.MEDIUM,
//         performance: {
//             daily: 1.5,
//             weekly: 5.2,
//             monthly: 12.8
//         }
//     };
// } 