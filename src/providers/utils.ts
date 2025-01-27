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
    },
    'ethereum': {
        price: 2250,
        priceChange24h: 1.2,
        marketCap: 270000000000,
        totalVolume: 8000000000,
        priceHistory: Array(24).fill(0).map((_, i) => 2250 + Math.sin(i / 4) * 20),
        source: 'fallback'
    },
    'usd-coin': {
        price: 1,
        priceChange24h: 0,
        marketCap: 25000000000,
        totalVolume: 1000000000,
        priceHistory: Array(24).fill(1),
        source: 'fallback'
    },
    'dai': {
        price: 1,
        priceChange24h: 0,
        marketCap: 5000000000,
        totalVolume: 500000000,
        priceHistory: Array(24).fill(1),
        source: 'fallback'
    }
};

// Helper function to fetch token price data with fallbacks
export async function fetchTokenPriceData(token: string): Promise<TokenPriceData> {
    try {
        // For other tokens, try CoinGecko with fallback
        try {
            const [priceData, historyData] = await Promise.all([
                axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, {
                    timeout: 10000
                }),
                axios.get(`https://api.coingecko.com/api/v3/coins/${token}/market_chart?vs_currency=usd&days=7`, {
                    timeout: 10000
                })
            ]);

            // Extract the last 24 points from the 7-day data to simulate hourly-like granularity
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
                price: token.includes('usd') ? 1 : 0,
                priceChange24h: 0,
                marketCap: 0,
                totalVolume: 0,
                priceHistory: Array(24).fill(token.includes('usd') ? 1 : 0),
                source: 'fallback'
            };
        }
    } catch (error) {
        console.error(`Error fetching price data for ${token}:`, error.message);
        return fallbackData[token] || {
            price: token.includes('usd') ? 1 : 0,
            priceChange24h: 0,
            marketCap: 0,
            totalVolume: 0,
            priceHistory: Array(24).fill(token.includes('usd') ? 1 : 0),
            source: 'fallback'
        };
    }
}

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
    },
    'ETH/STRK': {
        volume24h: 1500000,
        liquidity: 5000000,
        priceImpact: 1.5
    },
    'STRK/DAI': {
        volume24h: 1000000,
        liquidity: 4000000,
        priceImpact: 1.8
    }
};

// Helper function to calculate volatility metrics
export function calculateVolatilityMetrics(priceHistory: number[]): {
    volatility24h: number;
    maxDrawdown: number;
    sharpeRatio: number;
} {
    if (!priceHistory || priceHistory.length < 2) {
        return { volatility24h: 0, maxDrawdown: 0, sharpeRatio: 0 };
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
        returns.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
    }

    // Calculate volatility (standard deviation of returns)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(365); // Annualized

    // Calculate maximum drawdown
    let maxDrawdown = 0;
    let peak = priceHistory[0];
    for (const price of priceHistory) {
        if (price > peak) peak = price;
        const drawdown = (peak - price) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Calculate Sharpe ratio (assuming risk-free rate of 2%)
    const riskFreeRate = 0.02;
    const excessReturn = mean * 365 - riskFreeRate;
    const sharpeRatio = excessReturn / volatility;

    return {
        volatility24h: volatility,
        maxDrawdown: maxDrawdown * 100,
        sharpeRatio
    };
}

// Helper function to perform technical analysis
export async function fetchTechnicalAnalysis(pair: string): Promise<TechnicalAnalysis> {
    try {
        // Fetch historical price data
        const [token0, token1] = pair.split('/');
        const priceHistory = await fetchTokenPriceData(token0.toLowerCase());

        // Calculate RSI
        const rsi = calculateRSI(priceHistory.priceHistory);

        // Calculate MACD
        const macd = calculateMACD(priceHistory.priceHistory);

        // Calculate moving averages
        const movingAverages = calculateMovingAverages(priceHistory.priceHistory);

        return {
            rsi,
            macd,
            movingAverages
        };
    } catch (error) {
        console.error(`Error performing technical analysis for ${pair}:`, error);
        throw error;
    }
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