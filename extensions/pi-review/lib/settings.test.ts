/**
 * Тесты для lib/settings.ts — parseModelId, validateThinkingLevel, loadReviewConfig
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем @earendil-works/pi-coding-agent (getAgentDir)
vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => "/tmp/test-pi-agent",
}));

// Мокаем fs
const mockFiles: Record<string, string> = {};
vi.mock("node:fs", () => ({
	existsSync: (path: string) => path in mockFiles,
	readFileSync: (path: string) => {
		if (path in mockFiles) return mockFiles[path];
		throw new Error(`File not found: ${path}`);
	},
}));

import { parseModelId, validateThinkingLevel, loadReviewConfig } from "./settings.js";

beforeEach(() => {
	// Очищаем мок-файловую систему
	for (const key of Object.keys(mockFiles)) delete mockFiles[key];
});

describe("parseModelId", () => {
	it("парсит provider/model", () => {
		expect(parseModelId("anthropic/claude-sonnet-4-5")).toEqual({
			provider: "anthropic",
			modelId: "claude-sonnet-4-5",
		});
	});

	it("парсит provider/namespace/model", () => {
		expect(parseModelId("openrouter/deepseek/deepseek-v4-pro")).toEqual({
			provider: "openrouter",
			modelId: "deepseek/deepseek-v4-pro",
		});
	});

	it("возвращает null для строки без /", () => {
		expect(parseModelId("claude-sonnet-4-5")).toBeNull();
	});

	it("возвращает null для пустой строки", () => {
		expect(parseModelId("")).toBeNull();
	});

	it("возвращает null для строки начинающейся с /", () => {
		expect(parseModelId("/model")).toBeNull();
	});

	it("возвращает null для строки заканчивающейся на /", () => {
		expect(parseModelId("provider/")).toBeNull();
	});
});

describe("validateThinkingLevel", () => {
	it("возвращает валидное значение", () => {
		expect(validateThinkingLevel("high")).toBe("high");
		expect(validateThinkingLevel("off")).toBe("off");
		expect(validateThinkingLevel("xhigh")).toBe("xhigh");
	});

	it("возвращает fallback при опечатке", () => {
		expect(validateThinkingLevel("hgh")).toBe("high");
		expect(validateThinkingLevel("invalid")).toBe("high");
	});

	it("возвращает fallback при undefined", () => {
		expect(validateThinkingLevel(undefined)).toBe("high");
	});

	it("кастомный fallback", () => {
		expect(validateThinkingLevel(undefined, "off")).toBe("off");
		expect(validateThinkingLevel("typo", "medium")).toBe("medium");
	});
});

describe("loadReviewConfig", () => {
	it("возвращает пустой конфиг при отсутствии файлов", () => {
		const config = loadReviewConfig("/tmp/nonexistent");
		expect(config.model).toBeUndefined();
		expect(config.thinkingLevel).toBeUndefined();
	});

	it("читает глобальный конфиг", () => {
		mockFiles["/tmp/test-pi-agent/settings.json"] = JSON.stringify({
			review: { model: "openrouter/deepseek/deepseek-v4-pro", thinkingLevel: "high" },
		});
		const config = loadReviewConfig("/tmp/nonexistent");
		expect(config.model).toBe("openrouter/deepseek/deepseek-v4-pro");
		expect(config.thinkingLevel).toBe("high");
	});

	it("проектный конфиг переопределяет глобальный", () => {
		mockFiles["/tmp/test-pi-agent/settings.json"] = JSON.stringify({
			review: { model: "anthropic/claude-sonnet-4-5", thinkingLevel: "high" },
		});
		mockFiles["/tmp/project/.pi/settings.json"] = JSON.stringify({
			review: { thinkingLevel: "off" },
		});
		const config = loadReviewConfig("/tmp/project");
		expect(config.model).toBe("anthropic/claude-sonnet-4-5"); // из глобального
		expect(config.thinkingLevel).toBe("off"); // переопределено проектным
	});

	it("склеивает provider + model из устаревшего формата", () => {
		mockFiles["/tmp/test-pi-agent/settings.json"] = JSON.stringify({
			review: { provider: "anthropic", model: "claude-sonnet-4-5" },
		});
		const config = loadReviewConfig("/tmp/nonexistent");
		expect(config.model).toBe("anthropic/claude-sonnet-4-5");
	});

	it("читает includeDiff и diffMaxLines", () => {
		mockFiles["/tmp/test-pi-agent/settings.json"] = JSON.stringify({
			review: { includeDiff: false, diffMaxLines: 500 },
		});
		const config = loadReviewConfig("/tmp/nonexistent");
		expect(config.includeDiff).toBe(false);
		expect(config.diffMaxLines).toBe(500);
	});
});
