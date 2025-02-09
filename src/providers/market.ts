import { STARKNET_TOKENS } from './utils.ts';
import axios from 'axios';

// Types for market data
interface TokenPriceData {
    price: number;
    priceChange24h: number;
    totalVolume: number;
    priceHistory: number[];
}

interface MarketData {
    price: number;
    priceChange24h: number;
    volume24h: number;
    volume24h_previous: number;
    volatility: number;
    technicalAnalysis: {
        rsi: number;
        macd: { histogram: number };
        movingAverages: { sma20: number; sma50: number };
    };
}

// Fallback data for when APIs are unavailable
const fallbackData: Record<string, TokenPriceData> = {
    'ethereum': {
        price: 2665.74,
        priceChange24h: 2.2028604496813835,
        totalVolume: 13931051041.936989,
        priceHistory: Array(24).fill(0).map((_, i) => 2665.74 + Math.sin(i / 4) * 50)
    },
    'usd': {
        price: 0.998477,
        priceChange24h: -0.22600645332322725,
        totalVolume: 428089.7928788941,
        priceHistory: Array(24).fill(0).map((_, i) => 0.998477 + Math.sin(i / 4) * 0.001)
    },
    'starknet': {
        price: 0.244307,
        priceChange24h: 7.375095921348371,
        totalVolume: 31775872.91140891,
        priceHistory: Array(24).fill(0).map((_, i) => 0.244307 + Math.sin(i / 4) * 0.01)
    }
};

// CoinGecko API configuration
const COINGECKO_API_KEY = 'CG-1YsMfoXvDDYPHa1oLBv7PzMb';
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const RETRY_DELAY = 1000; // 1 second delay between retries
const MAX_RETRIES = 3;

// Helper function to calculate volatility
function calculateVolatility(priceHistory: number[]): number {
    if (!priceHistory || priceHistory.length < 2) {
        return 0;
    }

    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
        returns.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(365);
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
function calculateMACD(prices: number[]): { histogram: number } {
    if (prices.length < 26) {
        return { histogram: 0 };
    }

    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    const signalLine = calculateEMA([macdLine], 9);

    return {
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
function calculateMovingAverages(prices: number[]): { sma20: number; sma50: number } {
    return {
        sma20: calculateSMA(prices, 20),
        sma50: calculateSMA(prices, 50)
    };
}

// Helper function to calculate SMA
function calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    return prices.slice(-period).reduce((a, b) => a + b) / period;
}

async function fetchWithRetry(url: string, config: any, retries = 0): Promise<any> {
    try {
        const response = await axios.get(url, config);
        return response;
    } catch (error: any) {
        if (error.response?.status === 429 && retries < MAX_RETRIES) {
            console.warn(`Rate limit hit, retrying after ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchWithRetry(url, config, retries + 1);
        }
        throw error;
    }
}

async function fetchTokenPriceData(token: string): Promise<TokenPriceData> {
    try {
        const config = {
            headers: {
                'x-cg-pro-api-key': COINGECKO_API_KEY,
                'accept': 'application/json'
            }
        };

        try {
            const [priceData, historyData] = await Promise.all([
                fetchWithRetry(`${COINGECKO_API_BASE}/simple/price`, {
                    ...config,
                    params: {
                        ids: token,
                        vs_currencies: 'usd',
                        include_24hr_change: true,
                        include_24hr_vol: true
                    }
                }),
                fetchWithRetry(`${COINGECKO_API_BASE}/coins/${token}/market_chart`, {
                    ...config,
                    params: {
                        vs_currency: 'usd',
                        days: 7
                    }
                })
            ]);

            const prices = historyData.data.prices;
            const lastDayPrices = prices.slice(Math.max(prices.length - 24, 0));
            const normalizedPrices = lastDayPrices.map((p: number[]) => p[1]);

            return {
                price: priceData.data[token].usd,
                priceChange24h: priceData.data[token].usd_24h_change,
                totalVolume: priceData.data[token].usd_24h_vol,
                priceHistory: normalizedPrices
            };
        } catch (error: any) {
            console.warn(`CoinGecko API error for ${token} (${error.response?.status || error.message}), using fallback data`);
            return fallbackData[token] || {
                price: 0,
                priceChange24h: 0,
                totalVolume: 0,
                priceHistory: Array(24).fill(0)
            };
        }
    } catch (error) {
        console.error(`Error fetching price data for ${token}:`, error);
        throw error;
    }
}

export const marketProvider = async () => {
    try {
        const marketData: Record<string, MarketData> = {};

        // Fetch market data for each supported token
        for (const [symbol, address] of Object.entries(STARKNET_TOKENS)) {
            const priceData = await fetchTokenPriceData(symbol.toLowerCase());
            const volatility = calculateVolatility(priceData.priceHistory);

            marketData[symbol] = {
                price: priceData.price,
                priceChange24h: priceData.priceChange24h,
                volume24h: priceData.totalVolume,
                volume24h_previous: priceData.totalVolume * 0.9, // Estimate previous day
                volatility,
                technicalAnalysis: {
                    rsi: calculateRSI(priceData.priceHistory),
                    macd: calculateMACD(priceData.priceHistory),
                    movingAverages: calculateMovingAverages(priceData.priceHistory)
                }
            };
        }

        return JSON.stringify({
            marketData,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error("Error in market provider:", error);
        throw error;
    }
};