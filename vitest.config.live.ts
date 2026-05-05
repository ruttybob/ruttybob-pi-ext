/**
 * Vitest-конфигурация для live-интеграционных тестов.
 *
 * Не подменяет модули stub'ами — тесты ходят к реальным API.
 * Использование: npx vitest run --config vitest.config.live.ts
 */
import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const stubDir = resolve(__dirname, "tests/stubs");

export default defineConfig({
	test: {
		globalSetup: resolve(__dirname, "tests/global-setup.ts"),
		include: ["tests/**/*live.integration.test.ts"],
		globals: true,
	},
	resolve: {
		alias: {
			// Только pi-специфичные stub'ы — MCP SDK не подменяем
			"@mariozechner/pi-coding-agent": resolve(stubDir, "@mariozechner/pi-coding-agent.ts"),
			"@mariozechner/pi-ai": resolve(stubDir, "@mariozechner/pi-ai.ts"),
			"@mariozechner/pi-tui": resolve(stubDir, "@mariozechner/pi-tui.ts"),
			"@sinclair/typebox/value": resolve(stubDir, "@sinclair/typebox/value.ts"),
			"@sinclair/typebox": resolve(stubDir, "@sinclair/typebox.ts"),
			"typebox": resolve(stubDir, "@sinclair/typebox.ts"),
			"@tavily/core": resolve(stubDir, "@tavily/core.ts"),
			"temporal-polyfill": resolve(stubDir, "temporal-polyfill.ts"),
			"@juicesharp/rpiv-test-utils": resolve(stubDir, "@juicesharp/rpiv-test-utils.ts"),
		},
	},
});
