import { Account, AllowArray, BigNumberish, Call, CallData, Contract, hash, TransactionExecutionStatus, Provider, constants } from 'starknet';

// Sample contract addresses for StarkNet protocols
export const CONTRACTS = {
    SHIKAMARU: {
        POOL_MANAGER: ''
    }
    // AVNU: {
    //     ROUTER: '0x041fd22b238fa21cfb074f0e0fd3b92b89b993e94c0e8c33047ada8f1a0453a7',
    //     QUOTER: '0x042e7815d9e90b7ea53f4550f74dc12207ed6a0faaef57ba0dbf9a66f3762d82'
    // },
    // JEDISWAP: {
    //     ROUTER: '0x041fd22b238fa21cfb074f0e0fd3b92b89b993e94c0e8c33047ada8f1a0453a7',
    //     FACTORY: '0x00dad44c139a476c7a17fc8141e6db680e9abc9f56fe249a105094c44382c2fd'
    // },
    // NOSTRA: {
    //     LENDING_POOL: '0x042e7815d9e90b7ea53f4550f74dc12207ed6a0faaef57ba0dbf9a66f3762d82',
    //     PRICE_ORACLE: '0x0453c4c996f266c40bd80d9a6668c432a20f06c0a2fe72d3293682e8162c0d5e'
    // }
} as const;

// Function selectors for common operations
export const SELECTORS = {
    SWAP: hash.getSelectorFromName('swap'),
    ADD_LIQUIDITY: hash.getSelectorFromName('add_liquidity'),
    REMOVE_LIQUIDITY: hash.getSelectorFromName('remove_liquidity'),
    DEPOSIT: hash.getSelectorFromName('deposit'),
    WITHDRAW: hash.getSelectorFromName('withdraw'),
    BORROW: hash.getSelectorFromName('borrow'),
    REPAY: hash.getSelectorFromName('repay')
} as const;

export class StarkNetTransactionHandler {
    private account: Account;
    private provider: Provider;
    private maxRetries: number = 3;
    private retryDelay: number = 5000; // 5 seconds

    constructor(account: Account, provider: Provider) {
        this.account = account;
        this.provider = provider;
    }

    /**
     * Builds a method call for StarkNet contract interaction
     */
    async buildMethod(
        contractAddr: string,
        functionName: string,
        params: any[],
        args: string[]
    ): Promise<Call> {
        if (params.length !== args.length) {
            throw new Error('Error::Invalid Function Signature - params and args length mismatch');
        }

        const paramObj: { [key: string]: AllowArray<BigNumberish> } = {};
        params.forEach((param, index) => {
            paramObj[args[index]] = param;
        });

        return {
            contractAddress: contractAddr,
            entrypoint: functionName,
            calldata: CallData.compile(paramObj)
        };
    }

    /**
     * Executes a transaction with retry mechanism
     */
    async execute(calls: Call[]): Promise<string> {
        let retry = 0;
        while (retry < this.maxRetries) {
            try {
                const tx = await this.account.execute(calls);
                console.log(`🚧 Transaction submitted: ${this.getExplorerLink(tx.transaction_hash)}`);
                
                await this.provider.waitForTransaction(tx.transaction_hash, {
                    successStates: [TransactionExecutionStatus.SUCCEEDED],
                });
                
                console.log(`✅ Transaction confirmed: ${this.getExplorerLink(tx.transaction_hash)}`);
                return tx.transaction_hash;
            } catch (err) {
                console.warn(`Transaction failed: retry ${retry + 1}/${this.maxRetries}`);
                retry++;
                
                if (retry < this.maxRetries) {
                    await new Promise(res => setTimeout(res, this.retryDelay));
                } else {
                    throw new Error(`Transaction failed after ${this.maxRetries} retries: ${err}`);
                }
            }
        }
        throw new Error('Transaction failed: max retries exceeded');
    }

    // /**
    //  * Sample method to swap tokens using AVNU
    //  */
    // async swapTokens(
    //     tokenIn: string,
    //     tokenOut: string,
    //     amountIn: BigNumberish,
    //     minAmountOut: BigNumberish
    // ): Promise<string> {
    //     const swapCall = await this.buildMethod(
    //         CONTRACTS.AVNU.ROUTER,
    //         'swap',
    //         [tokenIn, tokenOut, amountIn, minAmountOut],
    //         ['token_in', 'token_out', 'amount_in', 'min_amount_out']
    //     );
        
    //     return this.execute([swapCall]);
    // }

    // /**
    //  * Sample method to provide liquidity to JediSwap
    //  */
    // async addLiquidity(
    //     tokenA: string,
    //     tokenB: string,
    //     amountA: BigNumberish,
    //     amountB: BigNumberish,
    //     minLiquidity: BigNumberish
    // ): Promise<string> {
    //     const addLiquidityCall = await this.buildMethod(
    //         CONTRACTS.JEDISWAP.ROUTER,
    //         'add_liquidity',
    //         [tokenA, tokenB, amountA, amountB, minLiquidity],
    //         ['token_a', 'token_b', 'amount_a', 'amount_b', 'min_liquidity']
    //     );
        
    //     return this.execute([addLiquidityCall]);
    // }

    // /**
    //  * Sample method to deposit into Nostra lending pool
    //  */
    // async depositToLending(
    //     token: string,
    //     amount: BigNumberish
    // ): Promise<string> {
    //     const depositCall = await this.buildMethod(
    //         CONTRACTS.NOSTRA.LENDING_POOL,
    //         'deposit',
    //         [token, amount],
    //         ['token', 'amount']
    //     );
        
    //     return this.execute([depositCall]);
    // }

    private getExplorerLink(txHash: string): string {
        return `https://starkscan.co/tx/${txHash}`;
    }
}

// Example usage:
/*
const handler = new StarkNetTransactionHandler(account, provider);

// Swap tokens
await handler.swapTokens(
    '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // ETH
    '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8', // USDC
    '1000000000000000000', // 1 ETH
    '1800000000' // Min 1800 USDC
);

// Add liquidity
await handler.addLiquidity(
    '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // ETH
    '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8', // USDC
    '1000000000000000000', // 1 ETH
    '1850000000', // 1850 USDC
    '100000000' // Min LP tokens
);
*/

// const config = {
//     STARKNET_ADDRESS:
//         runtime.getSetting("STARKNET_ADDRESS") ||
//         process.env.STARKNET_ADDRESS,
//     STARKNET_PRIVATE_KEY:
//         runtime.getSetting("STARKNET_PRIVATE_KEY") ||
//         process.env.STARKNET_PRIVATE_KEY,
//     STARKNET_RPC_URL:
//         runtime.getSetting("STARKNET_RPC_URL") ||
//         process.env.STARKNET_RPC_URL ||
//         STARKNET_PUBLIC_RPC,
// };