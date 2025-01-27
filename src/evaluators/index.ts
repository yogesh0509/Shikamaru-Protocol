import { Evaluator, IAgentRuntime, Memory as BaseMemory, State } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { Provider } from "../providers";

// Extend Memory type to include context
interface Memory extends BaseMemory {
  context?: {
    marketData: {
      tokens: {
        [key: string]: {
          price: number;
          priceChange24h: number;
          volume24h: number;
        }
      };
      protocols: {
        [key: string]: {
          tvl: number;
          apy: {
            conservative: number;
            moderate: number;
            aggressive: number;
          };
          volume24h: number;
          strategies: {
            [key: string]: {
              minAmount: number;
              maxAmount: number;
              expectedApy: number;
              risk: 'conservative' | 'moderate' | 'aggressive';
            }
          }
        }
      };
      marketMetrics: {
        totalTvlChange24h: number;
        volatilityIndex: number;
      };
    };
    protocolData: {
      [protocol: string]: {
        tvl: number;
        strategies: {
          [strategy: string]: {
            apy: number;
            risk: 'conservative' | 'moderate' | 'aggressive';
            minAmount: number;
          }
        }
      }
    };
    character: {
      name: string;
      knowledge: string[];
    };
  };
}

interface ProtocolStrategy {
  name: string;
  apy: number;
  risk: 'conservative' | 'moderate' | 'aggressive';
  minAmount: number;
}

interface Protocol {
  name: string;
  tvl: number;
  strategies: ProtocolStrategy[];
}

function parseCharacterKnowledge(knowledge: string[]): Map<string, {
  baseAllocation: number;
  preferredStrategies: string[];
  minTvl: number;
}> {
  const protocolInfo = new Map();
  
  knowledge.forEach(entry => {
    // Parse protocol allocation info from knowledge strings
    // Example: "Portfolio Allocation: 30% lending (Nostra/zkLend), 30% DEX LP (JediSwap/Ekubo)..."
    if (entry.startsWith('Portfolio Allocation:')) {
      const allocations = entry.split(':')[1].split(',');
      allocations.forEach(allocation => {
        const [percentage, rest] = allocation.trim().split('%');
        const protocols = rest.match(/\((.*?)\)/)[1].split('/');
        const baseAllocation = parseInt(percentage) / protocols.length;
        
        protocols.forEach(protocol => {
          protocolInfo.set(protocol.trim(), {
            baseAllocation,
            preferredStrategies: [],
            minTvl: 0
          });
        });
      });
    }
    
    // Parse risk management info
    // Example: "Risk Management: 25-30% allocation per protocol, minimum $2M TVL..."
    if (entry.startsWith('Risk Management:')) {
      const tvlMatch = entry.match(/minimum \$(\d+)M TVL/);
      const minTvl = tvlMatch ? parseInt(tvlMatch[1]) * 1000000 : 0;
      
      protocolInfo.forEach(info => {
        info.minTvl = minTvl;
      });
    }
  });
  
  return protocolInfo;
}

function getProtocolAllocations(
  amount: number,
  riskLevel: 'conservative' | 'moderate' | 'aggressive',
  marketConditions: { trend: string },
  protocolData: Record<string, {
    tvl: number;
    strategies: Record<string, ProtocolStrategy>;
  }>,
  characterKnowledge: string[]
): Array<{
  protocol: string;
  amount: number;
  strategy: string;
  expectedApy: number;
}> {
  const allocations = [];
  const protocolPreferences = parseCharacterKnowledge(characterKnowledge);
  
  // Convert protocol data to typed array
  const availableProtocols: Protocol[] = Object.entries(protocolData).map(([name, data]) => ({
    name,
    tvl: data.tvl,
    strategies: Object.entries(data.strategies)
      .map(([stratName, strat]) => ({
        name: stratName,
        ...strat
      }))
      .filter(strat => strat.risk === riskLevel)
  }));

  // Sort by TVL and filter by minimum TVL requirements
  const filteredProtocols = availableProtocols
    .filter(p => {
      const preferences = protocolPreferences.get(p.name);
      return preferences && p.tvl >= preferences.minTvl;
    })
    .sort((a, b) => b.tvl - a.tvl);

  let remainingAmount = amount;
  
  for (const protocol of filteredProtocols) {
    const preferences = protocolPreferences.get(protocol.name);
    if (!preferences) continue;

    const allocationAmount = Math.min(
      remainingAmount * (preferences.baseAllocation / 100),
      remainingAmount
    );

    if (allocationAmount < Math.min(...protocol.strategies.map(s => s.minAmount))) {
      continue;
    }

    // Select best strategy based on market conditions and character preferences
    const bestStrategy = protocol.strategies
      .reduce((best, current) => {
        const isBullish = marketConditions.trend === 'bullish';
        return (isBullish ? current.apy > best.apy : current.apy < best.apy) ? current : best;
      });

    allocations.push({
      protocol: protocol.name,
      amount: allocationAmount,
      strategy: bestStrategy.name,
      expectedApy: bestStrategy.apy
    });

    remainingAmount -= allocationAmount;
    if (remainingAmount <= 0) break;
  }

  return allocations;
}

interface SmartContractData {
    totalFunds: number;
    currentPositions: {
        protocol: string;
        amount: number;
        entryTime: number;
    }[];
}

interface MarketConditions {
  tokenPrices: {[key: string]: number};
  volatility: {[key: string]: number};
  tvl: {[key: string]: number};
  apyRanges: {[key: string]: {min: number; max: number}};
}

interface AllocationStrategy {
  totalAmount: number;
  allocations: {
    protocol: string;
    amount: number;
    strategy: string;
    expectedApy: number;
  }[];
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  marketConditions: string; // e.g. "bullish", "bearish", "neutral"
  reasoning: string;
}

// Evaluator for investment strategy analysis
export const strategyEvaluator: Evaluator = {
    name: "STRATEGY_EVALUATOR",
    similes: ["INVESTMENT_STRATEGY", "PORTFOLIO_STRATEGY"],
    description: "Analyzes current funds and generates investment strategy",
    validate: async (runtime: IAgentRuntime, message: Memory) => true,
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            // Extract amount from message
            const messageContent = message.content.text;
            const amountMatch = messageContent.match(/\$?\d+/);
            if (!amountMatch) {
                return {
                    ...message,
                    content: {
                        text: "Please specify an amount to invest (e.g. $100)"
                    }
                };
            }
            const amount = parseInt(amountMatch[0].replace('$', ''));

            // Get market conditions from provider data
            const marketData = message.context?.marketData;
            const protocolData = message.context?.protocolData;
            
            // Determine risk level from character name
            const characterName = message.context?.character?.name?.toLowerCase() || '';
            const riskLevel = characterName.includes('conservative') ? 'conservative' 
              : characterName.includes('aggressive') ? 'aggressive' 
              : 'moderate';

            // Build allocation strategy based on risk level and market conditions
            const strategy = buildAllocationStrategy(amount, marketData, protocolData, riskLevel);

            return {
                ...message,
                content: {
                    text: `Generated investment strategy for $${amount}`,
                    strategy
                }
            };
        } catch (error) {
            console.error('Error in strategy evaluator:', error);
            return {
                ...message,
                content: {
                    text: "Error generating investment strategy"
                }
            };
        }
    },
    examples: []
};

function buildAllocationStrategy(
  amount: number,
  marketData: any,
  protocolData: any,
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
): AllocationStrategy {
  // Analyze market conditions
  const marketConditions = analyzeMarketConditions(marketData);
  
  // Get character knowledge from market data context
  const characterKnowledge = marketData?.character?.knowledge || [];
  
  // Get protocol allocations based on risk level and market conditions
  const allocations = getProtocolAllocations(amount, riskLevel, marketConditions, protocolData, characterKnowledge);

  return {
    totalAmount: amount,
    allocations,
    riskLevel,
    marketConditions: marketConditions.trend,
    reasoning: marketConditions.reasoning
  };
}

function analyzeMarketConditions(marketData: any) {
  // Analyze price trends, volatility, TVL changes
  const ethTrend = marketData?.tokens?.ETH?.priceChange24h || 0;
  const tvlTrend = marketData?.protocols?.totalTvlChange24h || 0;
  const volatility = marketData?.volatilityIndex || 0;

  let trend = 'neutral';
  let reasoning = '';

  if (ethTrend > 5 && tvlTrend > 0) {
    trend = 'bullish';
    reasoning = 'Positive price action and TVL growth indicate bullish conditions';
  } else if (ethTrend < -5 || tvlTrend < -10) {
    trend = 'bearish';
    reasoning = 'Negative price action and TVL decline indicate bearish conditions';
  } else {
    reasoning = 'Market showing neutral conditions with moderate volatility';
  }

  return { trend, reasoning };
}

// Position tracking evaluator
export const positionEvaluator: Evaluator = {
    name: "POSITION_EVALUATOR",
    similes: ["POSITION_TRACKING", "INVESTMENT_TRACKING"],
    description: "Tracks current investment positions and their performance",
    validate: async (runtime: IAgentRuntime, message: Memory) => true,
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        // Get current positions
        const contractProvider = runtime.providers.find((p): p is Provider => 'name' in p && p.name === "smart_contract");
        if (!contractProvider) return null;

        const contractData = JSON.parse(await contractProvider.get(runtime, message, state)) as SmartContractData;
        
        // Get protocol data for APY comparison
        const protocolProvider = runtime.providers.find((p): p is Provider => 'name' in p && p.name === "protocol");
        if (!protocolProvider) return null;

        const protocolData = await protocolProvider.get(runtime, message, state);
        const protocols = JSON.parse(protocolData);

        // Calculate position metrics
        const positions = contractData.currentPositions.map(position => {
            const protocol = protocols[position.protocol];
            const holdingTime = (Date.now() - position.entryTime) / (1000 * 60 * 60 * 24); // days

            return {
                ...position,
                currentApy: protocol?.apy || 0,
                holdingTime,
                value: position.amount // In a real implementation, calculate current value
            };
        });

        const positionData = {
            positions,
            totalValue: positions.reduce((sum, pos) => sum + pos.value, 0),
            lastUpdated: Date.now()
        };

        // Store position data
        const positionId = stringToUuid(`position-${runtime.agentId}-${Date.now()}`);
        await runtime.messageManager.createMemory({
            id: positionId,
            content: {
                text: `Current Positions:\n${JSON.stringify(positionData, null, 2)}`,
                positions: positionData
            },
            userId: message.userId,
            roomId: message.roomId,
            agentId: runtime.agentId,
        });

        return positionData;
    },
    examples: []
};

export const defiEvaluators = [
    strategyEvaluator,
    positionEvaluator
]; 