import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stubDir = resolve(__dirname, "tests/stubs");

export default defineConfig({
	test: {
		globalSetup: resolve(__dirname, "tests/global-setup.ts"),
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/**/live.integration.test.ts"],
		globals: true,
	},
	resolve: {
		alias: {
			"@mariozechner/pi-coding-agent": resolve(stubDir, "@mariozechner/pi-coding-agent.ts"),
			"@mariozechner/pi-ai": resolve(stubDir, "@mariozechner/pi-ai.ts"),
			"@mariozechner/pi-tui": resolve(stubDir, "@mariozechner/pi-tui.ts"),
			"@sinclair/typebox/value": resolve(stubDir, "@sinclair/typebox/value.ts"),
			"@sinclair/typebox": resolve(stubDir, "@sinclair/typebox.ts"),
			"typebox/value": resolve(stubDir, "@sinclair/typebox/value.ts"),
			"typebox": resolve(stubDir, "@sinclair/typebox.ts"),
			"@modelcontextprotocol/sdk/client/index.js": resolve(stubDir, "@modelcontextprotocol/sdk/client/index.ts"),
			"@modelcontextprotocol/sdk/client/streamableHttp.js": resolve(stubDir, "@modelcontextprotocol/sdk/client/streamableHttp.ts"),
			"@modelcontextprotocol/sdk/client/stdio.js": resolve(stubDir, "@modelcontextprotocol/sdk/client/stdio.ts"),
			"@juicesharp/rpiv-test-utils": resolve(stubDir, "@juicesharp/rpiv-test-utils.ts"),
			"@juicesharp/rpiv-i18n": resolve(stubDir, "@juicesharp/rpiv-i18n.ts"),
			"@tavily/core": resolve(stubDir, "@tavily/core.ts"),
			"temporal-polyfill": resolve(stubDir, "temporal-polyfill.ts"),
			"pino": resolve(stubDir, "pino.ts"),
		},
	},
});
