import { Provider } from "@elizaos/core";
import { Contract, RpcProvider } from "starknet";

// StarkNet contract configuration
const INVESTMENT_CONTRACT_ADDRESS = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // Replace with actual contract address
const STARKNET_RPC = "https://starknet-mainnet.public.blastapi.io";

const ABI = [
    {
        "name": "get_total_investment_amount",
        "type": "function",
        "inputs": [],
        "outputs": [
            {
                "name": "amount",
                "type": "felt"
            }
        ],
        "stateMutability": "view"
    }
] as const;

interface InvestmentData {
    totalAmount: number;
    timestamp: number;
}

// Fallback data for when contract call fails
const fallbackData: InvestmentData = {
    totalAmount: 100000, // Default 100k USD
    timestamp: Date.now()
};

export const investmentProvider: Provider = {
    get: async (): Promise<string> => {
        try {
            // Initialize StarkNet provider and contract
            const provider = new RpcProvider({ nodeUrl: STARKNET_RPC });
            const contract = new Contract(ABI, INVESTMENT_CONTRACT_ADDRESS, provider);

            try {
                // Call the contract to get total investment amount
                const result = await contract.get_total_investment_amount();
                const amount = Number(result.amount) / 1e18; // Convert from wei to ETH

                return JSON.stringify({
                    totalAmount: amount,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.warn("Error calling investment contract, using fallback data:", error);
                return JSON.stringify(fallbackData);
            }
        } catch (error) {
            console.error("Error in investment provider:", error);
            throw error;
        }
    }
}; 