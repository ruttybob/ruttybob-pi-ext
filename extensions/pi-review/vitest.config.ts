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
			"@earendil-works/pi-coding-agent": resolve(stubDir, "@earendil-works/pi-coding-agent.ts"),
			"@earendil-works/pi-ai": resolve(stubDir, "@earendil-works/pi-ai.ts"),
		},
	},
});
