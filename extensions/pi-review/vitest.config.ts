import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stubDir = resolve(__dirname, "../../tests/stubs");

export default defineConfig({
	test: {
		include: ["lib/**/*.test.ts"],
		globals: true,
	},
	resolve: {
		alias: {
			"@mariozechner/pi-coding-agent": resolve(stubDir, "@mariozechner/pi-coding-agent.ts"),
			"@mariozechner/pi-ai": resolve(stubDir, "@mariozechner/pi-ai.ts"),
		},
	},
});
