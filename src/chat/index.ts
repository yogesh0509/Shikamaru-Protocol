import { Character } from "@elizaos/core";
import readline from "readline";

export function startChat(characters: Character[]) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return () => {
        rl.question('Press Ctrl+C to stop auto trading\n', async () => {
            // Keep the process running
            startChat(characters)();
        });

        rl.on('SIGINT', () => {
            console.log('\nStopping auto trading...');
            process.exit(0);
        });
    };
}
