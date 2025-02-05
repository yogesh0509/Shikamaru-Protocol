import { IAgentRuntime, Memory, State } from "@elizaos/core";
import { STARKNET_TOKENS, STARKNET_PROTOCOLS, Provider } from './token';
import axios from 'axios';

// Types for market data
interface TokenPriceData {
    price: number;
    priceChange24h: number;
    marketCap: number;
    totalVolume: number;
    priceHistory: number[];
    tvl?: number;
    stakingApy?: number;
    networkStats?: {
        transactions24h: number;
        activeAccounts: number;
    };
    source?: string;
}

interface DexLiquidityData {
    volume24h: number;
    liquidity: number;
    priceImpact: number;
}

interface TechnicalAnalysis {
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
}

interface MarketData {
    price: number;
    priceChange24h: number;
    volume24h: number;
    volume24h_previous: number;
    marketCap: number;
    volatility: number;
    technicalAnalysis: TechnicalAnalysis;
    dexData: DexLiquidityData;
    volatilityMetrics: {
        volatility24h: number;
        maxDrawdown: number;
        sharpeRatio: number;
    };
}

// Fallback data for when APIs are unavailable
const fallbackData: Record<string, TokenPriceData> = {
    'starknet': {
        price: 3.45,
        priceChange24h: 2.5,
        marketCap: 345000000,
        totalVolume: 15000000,
        priceHistory: Array(24).fill(0).map((_, i) => 3.45 + Math.sin(i / 4) * 0.1),
        tvl: 100000000,
        stakingApy: 12.5,
        networkStats: {
            transactions24h: 150000,
            activeAccounts: 50000
        },
        source: 'fallback'
    }
};

// Fallback DEX data
const fallbackDexData: Record<string, DexLiquidityData> = {
    'ETH/USDC': {
        volume24h: 5000000,
        liquidity: 20000000,
        priceImpact: 0.5
    },
    'STRK/USDC': {
        volume24h: 2000000,
        liquidity: 8000000,
        priceImpact: 1.2
    }
};

// Helper function to calculate volatility metrics
function calculateVolatilityMetrics(priceHistory: number[]): {
    volatility24h: number;
    maxDrawdown: number;
    sharpeRatio: number;
} {
    if (!priceHistory || priceHistory.length < 2) {
        return { volatility24h: 0, maxDrawdown: 0, sharpeRatio: 0 };
    }

    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
        returns.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(365);

    let maxDrawdown = 0;
    let peak = priceHistory[0];
    for (const price of priceHistory) {
        if (price > peak) peak = price;
        const drawdown = (peak - price) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const riskFreeRate = 0.02;
    const excessReturn = mean * 365 - riskFreeRate;
    const sharpeRatio = excessReturn / volatility;

    return {
        volatility24h: volatility,
        maxDrawdown: maxDrawdown * 100,
        sharpeRatio
    };
}

// Helper function to calculate RSI
function calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
    }

    let gains = changes.map(c => c > 0 ? c : 0);
    let losses = changes.map(c => c < 0 ? -c : 0);

    const avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

// Helper function to calculate MACD
function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number; } {
    if (prices.length < 26) {
        return { value: 0, signal: 0, histogram: 0 };
    }

    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const signalLine = calculateEMA([macdLine], 9);

    return {
        value: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine
    };
}

// Helper function to calculate EMA
function calculateEMA(prices: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
}

// Helper function to calculate moving averages
function calculateMovingAverages(prices: number[]): {
    sma20: number;
    sma50: number;
    sma200: number;
    ema20: number;
} {
    return {
        sma20: calculateSMA(prices, 20),
        sma50: calculateSMA(prices, 50),
        sma200: calculateSMA(prices, 200),
        ema20: calculateEMA(prices, 20)
    };
}

// Helper function to calculate SMA
function calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    return prices.slice(-period).reduce((a, b) => a + b) / period;
}

async function fetchTokenPriceData(token: string): Promise<TokenPriceData> {
    try {
        // Try CoinGecko with fallback
        try {
            const [priceData, historyData] = await Promise.all([
                axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`),
                axios.get(`https://api.coingecko.com/api/v3/coins/${token}/market_chart?vs_currency=usd&days=7`)
            ]);

            const prices = historyData.data.prices;
            const lastDayPrices = prices.slice(Math.max(prices.length - 24, 0));
            const normalizedPrices = lastDayPrices.map((p: number[]) => p[1]);

            return {
                price: priceData.data[token].usd,
                priceChange24h: priceData.data[token].usd_24h_change,
                marketCap: priceData.data[token].usd_market_cap,
                totalVolume: priceData.data[token].usd_24h_vol,
                priceHistory: normalizedPrices,
                source: 'coingecko'
            };
        } catch (error) {
            console.warn(`CoinGecko API error for ${token}, using fallback data:`, error.message);
            return fallbackData[token] || {
                price: 0,
                priceChange24h: 0,
                marketCap: 0,
                totalVolume: 0,
                priceHistory: Array(24).fill(0),
                source: 'fallback'
            };
        }
    } catch (error) {
        console.error(`Error fetching price data for ${token}:`, error.message);
        throw error;
    }
}

async function fetchTechnicalAnalysis(pair: string): Promise<TechnicalAnalysis> {
    try {
        const [token0] = pair.split('/');
        const priceHistory = await fetchTokenPriceData(token0.toLowerCase());

        const rsi = calculateRSI(priceHistory.priceHistory);
        const macd = calculateMACD(priceHistory.priceHistory);
        const movingAverages = calculateMovingAverages(priceHistory.priceHistory);

        return { rsi, macd, movingAverages };
    } catch (error) {
        console.error(`Error performing technical analysis for ${pair}:`, error);
        throw error;
    }
}

export const marketProvider =
    async () => {
        try {
            const marketData: Record<string, MarketData> = {};

            // Fetch market data for each supported token
            for (const [symbol, address] of Object.entries(STARKNET_TOKENS)) {
                const priceData = await fetchTokenPriceData(symbol.toLowerCase());
                const technicalAnalysis = await fetchTechnicalAnalysis(`${symbol}/USD`);
                const volatilityMetrics = calculateVolatilityMetrics(priceData.priceHistory);

                // Get DEX data for token pairs
                const dexKey = `${symbol}/USDC`;
                const dexData = fallbackDexData[dexKey] || {
                    volume24h: 0,
                    liquidity: 0,
                    priceImpact: 0
                };

                marketData[symbol] = {
                    price: priceData.price,
                    priceChange24h: priceData.priceChange24h,
                    volume24h: priceData.totalVolume,
                    volume24h_previous: priceData.totalVolume * 0.9, // Estimate previous day
                    marketCap: priceData.marketCap,
                    volatility: volatilityMetrics.volatility24h,
                    technicalAnalysis,
                    dexData,
                    volatilityMetrics
                };
            }

            return JSON.stringify({
                marketData,
                timestamp: Date.now(),
                dataQuality: {
                    source: 'hybrid', // coingecko + fallback
                    reliability: 'medium',
                    lastUpdate: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error("Error in market provider:", error);
            throw error;
        }
    }