import axios from 'axios';

// API endpoints
const ZKLEND_API_URL = 'https://cairo-psi.vercel.app/api/apr/zklend';
const EKUBO_API_URL = 'https://cairo-psi.vercel.app/api/apr/ekubo';

async function fetchProtocolData(url: string): Promise<any> {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching protocol data from ${url}:`, error);
        throw error;
    }
}

export async function protocolDataProvider() {
    try {
        // Fetch data from both protocols
        const [zklendData, ekuboData] = await Promise.all([
            fetchProtocolData(ZKLEND_API_URL),
            fetchProtocolData(EKUBO_API_URL)
        ]);

        const pools = [];

        // Transform Ekubo data
        ekuboData.data.forEach((pool: any) => {
            // Extract token symbols and addresses
            const token0 = pool.tokens.token0;
            const token1 = pool.tokens.token1;

            // Convert volume and TVL to USD
            const volume24hUSD = parseFloat(pool.volume24h?.usd || '0');
            const tvlUSD = parseFloat(pool.tvl?.usd || '0');
            const apy = pool.apr || 0;

            // Calculate volatility using volume/TVL ratio
            const volatility = tvlUSD > 0 ? Math.min((volume24hUSD / tvlUSD) * 100, 100) : 0;

            pools.push({
                protocol: "Ekubo",
                token0: token0.symbol,
                token1: token1.symbol,
                apy: apy,
                volatility: volatility,
                maxDrawdown: Math.min(volatility * 0.5, 30), // Conservative estimate
                volume24h: volume24hUSD,
                tvl: tvlUSD,
                totalBorrow: 0, // Ekubo is AMM, not lending
                totalSupply: parseFloat(pool.tvl?.token0 || '0') / (10 ** token0.decimals), // Convert using token decimals
                lastUpdate: Date.now(),
                poolAddress: token0.l2_token_address,
                fee: pool.fee,
                tickSpacing: pool.tickSpacing,
                fees24h: parseFloat(pool.fees24h?.usd || '0'),
                token0Address: token0.l2_token_address,
                token1Address: token1.l2_token_address,
                token0Decimals: token0.decimals,
                token1Decimals: token1.decimals
            });
        });

        // Transform zkLend data
        zklendData.data.forEach((pool: any) => {
            const totalSupplyUSD = parseFloat(pool.totalSupplyUSD);
            const totalBorrowUSD = parseFloat(pool.totalBorrowUSD);

            // Calculate APY from APR (compound interest formula)
            const supplyAPY = ((1 + pool.supplyAPR.total / 100 / 365) ** 365 - 1) * 100;

            // Derive volatility from utilization rate
            const volatility = pool.utilizationRate / 2;

            // Lending protocols typically have lower maxDrawdown
            const maxDrawdown = 0.1;

            pools.push({
                protocol: "zkLend",
                token0: pool.token.symbol,
                apy: supplyAPY,
                volatility: volatility,
                maxDrawdown: maxDrawdown,
                volume24h: totalBorrowUSD * 0.1, // Estimate daily volume as 10% of total borrow
                tvl: totalSupplyUSD,
                totalBorrow: totalBorrowUSD,
                totalSupply: totalSupplyUSD,
                historicalAccuracy: 0.9,
                lastUpdate: pool.timestamp * 1000
            });
        });

        return {
            pools: pools
        };
    } catch (error) {
        console.error("Error in protocol data provider:", error);
        throw error;
    }
}