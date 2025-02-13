import { marketProvider } from "./market.ts";

// Portfolio Manager Provider
export const portfolioManagerProvider = async () => {
    try {
        const marketData = JSON.parse(await marketProvider());

        // Calculate market sentiment and risk metrics
        const marketSentiment = calculateMarketSentiment(marketData.marketData);
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