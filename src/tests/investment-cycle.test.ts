import { IAgentRuntime, Memory, Character, ModelProviderName } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { defiProviders } from "../providers";
import { defiEvaluators } from "../evaluators";
import { defiActions } from "../actions";

// Mock runtime for testing
const mockRuntime: Partial<IAgentRuntime> = {
    agentId: stringToUuid("test-agent"),
    character: {
        name: "StarkNet Aggressive",
        id: stringToUuid("test-character"),
        modelProvider: ModelProviderName.OPENAI,
        bio: ["Aggressive StarkNet DeFi investor"],
        lore: ["Made significant returns in StarkNet protocols"],
        messageExamples: [],
        postExamples: [],
        topics: ["DeFi", "StarkNet", "Investing"],
        style: { all: [], chat: [], post: [] },
        plugins: [],
        clients: [],
        settings: {
            secrets: {}
        },
        adjectives: ["aggressive", "risk-taking", "analytical"]
    } as Character,
    providers: defiProviders,
    evaluators: defiEvaluators,
    actions: defiActions
};

// Test message
const testMessage: Memory = {
    id: stringToUuid("test-message"),
    userId: stringToUuid("test-user"),
    roomId: stringToUuid("test-room"),
    agentId: stringToUuid("test-agent"),
    content: {
        text: "AUTO_INVESTMENT_CYCLE"
    }
};

async function testInvestmentCycle() {
    console.log("\n=== Starting Investment Cycle Test ===\n");

    try {
        // 1. Test Strategy Generation
        console.log("Testing Strategy Generation...");
        const strategy = await defiEvaluators[0].handler(mockRuntime as IAgentRuntime, testMessage);
        console.log("\nStrategy Result:", JSON.stringify(strategy, null, 2));

        // 2. Test Position Tracking
        console.log("\nTesting Position Tracking...");
        const positions = await defiEvaluators[1].handler(mockRuntime as IAgentRuntime, testMessage);
        console.log("\nPositions Result:", JSON.stringify(positions, null, 2));

        // 3. Test Strategy Execution
        console.log("\nTesting Strategy Execution...");
        const execution = await defiActions[0].handler(mockRuntime as IAgentRuntime, testMessage);
        console.log("\nExecution Result:", execution);

        // 4. Test Investment Monitoring
        console.log("\nTesting Investment Monitoring...");
        const monitoring = await defiActions[1].handler(mockRuntime as IAgentRuntime, testMessage);
        console.log("\nMonitoring Result:", monitoring);

        console.log("\n=== Investment Cycle Test Completed Successfully ===");
    } catch (error) {
        console.error("\n=== Test Failed ===");
        console.error("Error:", error);
    }
}

// Run the test
testInvestmentCycle(); 