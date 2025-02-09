// Mock data constants that mirror actual API responses
const MOCK_EKUBO_DATA = {
    ekubo: [
        {
            token0Symbol: "ETH",
            token1Symbol: "USDC",
            fee: "0",
            tickSpacing: 1003,
            volume24h: {
                token0: "1500000000000000000", // 1.5 ETH
                token1: "3000000000", // 3000 USDC
                usd: 3000000 // $3M volume
            },
            tvl: {
                token0: "50000000000000000000", // 50 ETH
                token1: "100000000000", // 100,000 USDC
                usd: 100000000 // $100M TVL
            },
            apr: 15.5, // 15.5% APR
            tokens: {
                token0: {
                    name: "Ether",
                    symbol: "ETH",
                    decimals: 18,
                    l2_token_address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                },
                token1: {
                    name: "USD Coin",
                    symbol: "USDC",
                    decimals: 6,
                    l2_token_address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                }
            }
        },
        {
            token0Symbol: "USDT",
            token1Symbol: "ETH",
            fee: "0",
            tickSpacing: 1003,
            volume24h: {
                token0: "2000000000000", // 2M USDT
                token1: "1000000000000000000", // 1 ETH
                usd: 2000000 // $2M volume
            },
            tvl: {
                token0: "50000000000000", // 50M USDT
                token1: "25000000000000000000", // 25 ETH
                usd: 50000000 // $50M TVL
            },
            apr: 12.8, // 12.8% APR
            tokens: {
                token0: {
                    name: "Tether USD",
                    symbol: "USDT",
                    decimals: 6,
                    l2_token_address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8"
                },
                token1: {
                    name: "Ether",
                    symbol: "ETH",
                    decimals: 18,
                    l2_token_address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                }
            }
        }
    ]
};

const MOCK_ZKLEND_DATA = {
    zklend: [
        {
            token: {
                symbol: "ETH",
                name: "Ether",
                decimals: 18
            },
            totalSupply: "0x2386f26fc10000", // in wei
            totalSupplyUSD: 10000000, // $10M supply
            totalBorrow: "0x1bc16d674ec80000", // in wei
            totalBorrowUSD: 2000000, // $2M borrow
            availableLiquidity: "0x1bc16d674ec80000", // in wei
            availableLiquidityUSD: 8000000, // $8M liquidity
            supplyAPR: {
                total: 4.5, // 4.5% total APR
                base: 1.5,  // 1.5% base APR
                reward: 3.0 // 3.0% reward APR
            },
            borrowAPR: {
                total: 6.5,
                base: 6.5,
                reward: 0
            },
            utilizationRate: 20, // 20% utilization
            timestamp: Math.floor(Date.now() / 1000)
        },
        {
            token: {
                symbol: "USDC",
                name: "USD Coin",
                decimals: 6
            },
            totalSupply: "0x5af3107a4000", // in decimals(6)
            totalSupplyUSD: 15000000, // $15M supply
            totalBorrow: "0x2d79883d2000", // in decimals(6)
            totalBorrowUSD: 3000000, // $3M borrow
            availableLiquidity: "0x2d79883d2000", // in decimals(6)
            availableLiquidityUSD: 12000000, // $12M liquidity
            supplyAPR: {
                total: 3.8,
                base: 1.2,
                reward: 2.6
            },
            borrowAPR: {
                total: 5.5,
                base: 5.5,
                reward: 0
            },
            utilizationRate: 20,
            timestamp: Math.floor(Date.now() / 1000)
        },
        {
            token: {
                symbol: "USDT",
                name: "Tether USD",
                decimals: 6
            },
            totalSupply: "0x4563918244f40000",
            totalSupplyUSD: 12000000, // $12M supply
            totalBorrow: "0x1bc16d674ec80000",
            totalBorrowUSD: 2400000, // $2.4M borrow
            availableLiquidity: "0x2d79883d2000",
            availableLiquidityUSD: 9600000, // $9.6M liquidity
            supplyAPR: {
                total: 3.5,
                base: 1.0,
                reward: 2.5
            },
            borrowAPR: {
                total: 5.2,
                base: 5.2,
                reward: 0
            },
            utilizationRate: 20,
            timestamp: Math.floor(Date.now() / 1000)
        }
    ]
};

export function protocolDataProvider(ekuboData: any = MOCK_EKUBO_DATA, zklendData: any = MOCK_ZKLEND_DATA) {
    const pools = [];

    // Transform Ekubo data
    ekuboData.ekubo.forEach((pool: any) => {
        // Convert volume from wei to normal numbers
        const volume24hUSD = pool.volume24h.usd;
        const tvlUSD = pool.tvl.usd;

        // Ekubo APR is already in percentage
        const apy = pool.apr;

        // For volatility, we could derive it from volume/TVL ratio as a rough estimate
        const volatility = (volume24hUSD / tvlUSD) * 100;

        // Assume maxDrawdown based on protocol type (AMM tends to have higher drawdown)
        const maxDrawdown = 0.2; // 20% as a conservative estimate

        pools.push({
            protocol: "ekubo",
            token0: pool.token0Symbol,
            apy: apy,
            volatility: volatility,
            maxDrawdown: maxDrawdown,
            volume24h: volume24hUSD,
            tvl: tvlUSD,
            // For AMM, we can use TVL as both supply and borrow for calculation purposes
            totalBorrow: tvlUSD / 2, // Estimate based on typical AMM utilization
            totalSupply: tvlUSD,
            historicalAccuracy: 0.8, // Default value as historical data isn't provided
            lastUpdate: Date.now()
        });
    });

    // Transform zkLend data
    zklendData.zklend.forEach((pool: any) => {
        const totalSupplyUSD = pool.totalSupplyUSD;
        const totalBorrowUSD = pool.totalBorrowUSD;

        // Calculate APY from APR (compound interest formula)
        const supplyAPY = ((1 + pool.supplyAPR.total / 100 / 365) ** 365 - 1) * 100;

        // Derive volatility from utilization rate
        const volatility = pool.utilizationRate / 2; // Conservative estimate

        // Lending protocols typically have lower maxDrawdown
        const maxDrawdown = 0.1; // 10% as a conservative estimate

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
            historicalAccuracy: 0.9, // Lending protocols tend to have more predictable returns
            lastUpdate: pool.timestamp * 1000 // Convert seconds to milliseconds
        });
    });

    return {
        pools: pools
    };
}