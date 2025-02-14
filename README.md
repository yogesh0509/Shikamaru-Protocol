# DeFi Strategy Management System

## Overview
This project implements an intelligent DeFi strategy management system that automates investment decisions across multiple protocols on StarkNet. The system combines AI-driven strategy evaluation with smart contract-based execution to provide optimized DeFi investments based on user risk preferences.

## Architecture

### Technical Stack
- **Backend Services**
  - Protocol Data Provider: Fetches real-time data from DeFi protocols (zkLend, Ekubo)
  - Investment Strategy Provider: Analyzes market conditions and generates recommendations
  - Portfolio Manager: Tracks and optimizes portfolio performance
  - Market Data Provider: Provides market sentiment and token metrics

- **Smart Contracts**
  - PoolManager: Manages user deposits and risk-segregated pools
  - StrategyManager: Executes investment strategies across protocols
  - Protocol-specific Adapters: Handle protocol-specific interactions

### Smart Contract Architecture

#### 1. PoolManager Contract
- **Purpose**: Manages user deposits and risk-segregated pools
- **Features**:
  - Multiple instances for different risk levels (Low, Medium, High)
  - Secure token deposit and withdrawal functionality
  - Risk-isolated pools to protect user assets
  - Balance tracking and accounting
- **Key Functions**:
  ```solidity
  - deposit(token, amount)
  - withdraw(token, amount)
  - getRiskPool(riskLevel)
  - getPoolBalance(token)
  ```

#### 2. StrategyManager Contract
- **Purpose**: Executes investment strategies based on AI recommendations
- **Features**:
  - Acts as middleware between Eliza AI and DeFi protocols
  - Protocol-specific strategy implementations
  - Safe transaction handling and calldata refactoring
  - Risk management and exposure limits
- **Key Functions**:
  ```solidity
  - executeStrategy(strategy, amount)
  - rebalancePosition(protocol, token)
  - withdrawFromStrategy(strategy, amount)
  ```

### Implementation Details

#### 1. Protocol Integration
- **zkLend Integration**:
  - Lending protocol integration with supply/borrow capabilities
  - APY calculation and risk assessment
  - Utilization rate monitoring
  ```typescript
  // Example zkLend data structure
  {
    protocol: "zkLend",
    token: "ETH",
    apy: supplyAPY,
    totalBorrow: totalBorrowUSD,
    totalSupply: totalSupplyUSD
  }
  ```

- **Ekubo Integration**:
  - AMM protocol integration with liquidity provision
  - Pair trading and fee collection
  - Pool metrics monitoring
  ```typescript
  // Example Ekubo pool structure
  {
    protocol: "Ekubo",
    token0: "ETH",
    token1: "USDC",
    apy: apr,
    fee: poolFee,
    tickSpacing: spacing
  }
  ```

#### 2. Risk Management
- Three-tiered risk strategy:
  - Conservative (Low Risk): 80% lending, 20% AMM
  - Moderate (Medium Risk): 65% lending, 35% AMM
  - Aggressive (High Risk): 45% lending, 55% AMM

- Risk Metrics:
  ```typescript
  {
    maxDrawdown: number,
    volatility: number,
    correlationLimit: number,
    rebalanceThreshold: number
  }
  ```

#### 3. Investment Strategy
- Dynamic allocation based on:
  - Market sentiment
  - Protocol performance
  - Risk-adjusted returns
  - Pool liquidity and volume

- Strategy Evaluation:
  ```typescript
  function calculateRiskAdjustedReturn(pool, config) {
    // Risk-adjusted return calculation
    const sharpeRatio = (apy - riskFreeRate) / volatility;
    return sharpeRatio * (1 - drawdownPenalty);
  }
  ```

### Eliza AI Implementation

#### 1. DeFi Evaluator System
```typescript
interface DeFiRecommendation {
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

class AdvancedMemoryManager {
    // Manages historical performance and user context
    async storeRecommendation(recommendation: DeFiRecommendation, userId: string, context: any);
    async getUserContext(userId: string): Promise<UserContext | null>;
    async getHistoricalPerformance(protocol: string, token: string): Promise<HistoricalPerformance | null>;
}

// Evaluation metrics calculation
function calculateRiskAdjustedReturn(pool: any, config: RiskStrategy): number {
    const apy = pool.apy || pool.apr || 0;
    const volatility = volume / tvl;
    const sharpeRatio = (apy - 0.02) / (volatility || 0.1);
    const estimatedDrawdown = Math.min(volatility, 0.3);
    return Math.max(0, sharpeRatio * (1 - drawdownPenalty));
}
```

#### 2. Investment Strategy Provider
```typescript
// Risk level configurations
const STRATEGY_CONFIGS: Record<RiskLevel, RiskStrategy> = {
    [RiskLevel.LOW]: {
        maxDrawdown: 0.05,
        protocols: {
            zkLend: { maxAllocation: 80, minAllocation: 60 },
            ekubo: { maxAllocation: 20, minAllocation: 10 }
        }
    },
    [RiskLevel.MEDIUM]: {
        maxDrawdown: 0.15,
        protocols: {
            zkLend: { maxAllocation: 65, minAllocation: 45 },
            ekubo: { maxAllocation: 35, minAllocation: 25 }
        }
    },
    [RiskLevel.HIGH]: {
        maxDrawdown: 0.30,
        protocols: {
            zkLend: { maxAllocation: 45, minAllocation: 25 },
            ekubo: { maxAllocation: 55, minAllocation: 35 }
        }
    }
};
```

#### 3. Strategy Generation Process
1. **Character-Based Risk Assessment**:
   ```typescript
   // Risk level determination based on character
   if (characterName.includes('conservative')) {
       userRiskLevel = RiskLevel.LOW;
   } else if (characterName.includes('moderate')) {
       userRiskLevel = RiskLevel.MEDIUM;
   } else if (characterName.includes('aggressive')) {
       userRiskLevel = RiskLevel.HIGH;
   }
   ```

2. **Pool Selection and Evaluation**:
   ```typescript
   // Pool filtering criteria
   const selectedPools = matchingPools.filter(pool => {
       if (pool.protocol === 'Ekubo') {
           return pool.riskAdjustedReturn > 0.1 && 
                  pool.marketFit > 0.3 && 
                  pool.tvl > 1000;
       } else {
           const utilizationRate = pool.totalBorrow / pool.totalSupply;
           return utilizationRate > 0.3 && 
                  utilizationRate < 0.8 && 
                  pool.volatility < config.crossProtocolMetrics.maxVolatility;
       }
   });
   ```

3. **Protocol-Specific Handling**:
   ```typescript
   // Ekubo (AMM) specific recommendation structure
   {
       protocol: "Ekubo",
       token: `${pool.token0}/${pool.token1}`,
       amount: amount,
       expectedReturn: pool.apy,
       poolData: {
           token0Address: pool.token0Address,
           token1Address: pool.token1Address,
           fee: pool.fee,
           tickSpacing: pool.tickSpacing
       }
   }

   // zkLend (Lending) specific recommendation structure
   {
       protocol: "zkLend",
       token: pool.token0,
       amount: amount,
       expectedReturn: pool.apy
   }
   ```

#### 4. Performance Metrics
```typescript
interface HistoricalPerformance {
    successRate: number;
    averageReturn: number;
    totalRecommendations: number;
    volatility?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
}

// Market fit calculation
function calculateMarketFit(pool: any, sentiment: any): number {
    const sentimentAlignment = sentiment.overall > 0 ? 
        pool.apy : (1 / pool.volatility);
    const volumeScore = Math.min(pool.volume24h / 1e6, 1);
    const tvlScore = Math.min(pool.tvl / 1e7, 1);
    return (sentimentAlignment * 0.4) + 
           (volumeScore * 0.3) + 
           (tvlScore * 0.3);
}
```

#### 5. Memory Management and Historical Data
```typescript
class RecommendationEngine {
    private memoryManager: AdvancedMemoryManager;

    async generateRecommendations(
        message: Memory,
        userContext: UserContext,
        marketContext: MarketContext
    ): Promise<DeFiRecommendation[]> {
        const baseRecommendations = await this.getBaseRecommendations(message);
        const enhancedRecommendations = await this.enhanceRecommendations(
            baseRecommendations,
            userContext,
            marketContext
        );
        return this.prioritizeRecommendations(
            enhancedRecommendations, 
            userContext
        );
    }
}
```

## System Flow

1. **User Interaction**:
   - User deposits assets into PoolManager
   - Selects risk preference (Conservative/Moderate/Aggressive)

2. **Strategy Generation**:
   - System fetches protocol data
   - Analyzes market conditions
   - Generates risk-adjusted recommendations

3. **Execution**:
   - StrategyManager receives recommendations
   - Validates and refactors transactions
   - Executes positions across protocols

4. **Monitoring**:
   - Continuous performance tracking
   - Risk metric monitoring
   - Rebalancing when thresholds are breached

## Technical Considerations

### Security
- Smart contract security measures:
  - Risk isolation between pools
  - Transaction validation
  - Emergency withdrawal mechanisms
  - Access control and permissions

### Performance
- Optimized data fetching and processing
- Efficient smart contract interactions
- Gas optimization for StarkNet

### Scalability
- Modular architecture for adding new protocols
- Extensible strategy framework
- Upgradeable smart contracts

## Development and Deployment

### Prerequisites
- StarkNet development environment
- Node.js and TypeScript
- Cairo smart contract knowledge

### Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add your StarkNet RPC URL and credentials

# Run tests
npm test

# Deploy contracts
npm run deploy
```

### Configuration
- Set protocol addresses in `src/config`
- Configure risk parameters in `src/providers/utils.ts`
- Adjust strategy thresholds in `src/providers/investmentStrategy.ts`

## Future Enhancements
1. Additional protocol integrations
2. Advanced risk management features
3. Multi-chain support
4. Enhanced analytics and reporting
5. Automated rebalancing strategies

## Contributing
Contributions are welcome! Please read our contributing guidelines and submit pull requests for any enhancements.

## License
MIT License - see LICENSE file for details