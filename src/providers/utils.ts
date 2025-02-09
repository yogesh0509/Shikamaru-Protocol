import { IAgentRuntime, Memory, State } from "@elizaos/core";

export const STARKNET_TOKENS = {
    ETHEREUM: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    USD: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    STARKNET: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
} as const;

export enum RiskLevel {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH'
}

// StarkNet DeFi protocols configuration
export const STARKNET_PROTOCOLS = {
    EKUBO: 'Ekubo',
    ZKLEND: 'zkLend',
} as const;

export interface Provider {
    name: string;
    get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}