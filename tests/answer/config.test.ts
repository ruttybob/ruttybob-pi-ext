import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	loadAnswerConfig,
	parseModelRef,
	resolveExtractionModel,
} from "../../extensions/answer/config.js";

// --- parseModelRef ---

describe("parseModelRef", () => {
	it("корректный формат provider/id", () => {
		expect(parseModelRef("openai/gpt-4.1-mini")).toEqual({
			provider: "openai",
			id: "gpt-4.1-mini",
		});
	});

	it("с пробелами — обрезает", () => {
		expect(parseModelRef("  anthropic/claude-haiku-4-5  ")).toEqual({
			provider: "anthropic",
			id: "claude-haiku-4-5",
		});
	});

	it("нет слеша — null", () => {
		expect(parseModelRef("gpt-4")).toBeNull();
	});

	it("слеш в начале — null", () => {
		expect(parseModelRef("/model")).toBeNull();
	});

	it("слеш в конце — null", () => {
		expect(parseModelRef("provider/")).toBeNull();
	});
});

// --- resolveExtractionModel ---

describe("resolveExtractionModel", () => {
	const currentModel = { provider: "test", id: "current" } as any;
	const find = vi.fn();
	const getApiKeyAndHeaders = vi.fn();
	const registry = { find, getApiKeyAndHeaders };

	beforeEach(() => {
		find.mockReset();
		getApiKeyAndHeaders.mockReset();
	});

	it("нет model в конфиге — возвращает текущую модель", async () => {
		const result = await resolveExtractionModel({}, currentModel, registry);
		expect(result.model).toBe(currentModel);
		expect(result.source).toBe("session");
		expect(find).not.toHaveBeenCalled();
	});

	it("модель найдена с auth — возвращает её", async () => {
		const configured = { provider: "openai", id: "gpt-4.1-mini" };
		find.mockReturnValue(configured);
		getApiKeyAndHeaders.mockResolvedValue({ ok: true, apiKey: "k" });

		const result = await resolveExtractionModel(
			{ model: "openai/gpt-4.1-mini" },
			currentModel,
			registry,
		);
		expect(result.model).toBe(configured);
		expect(result.source).toBe("openai/gpt-4.1-mini");
	});

	it("модель не найдена в реестре — fallback на текущую", async () => {
		find.mockReturnValue(undefined);

		const result = await resolveExtractionModel(
			{ model: "unknown/model" },
			currentModel,
			registry,
		);
		expect(result.model).toBe(currentModel);
		expect(result.source).toContain("not found");
	});

	it("нет auth — fallback на текущую", async () => {
		find.mockReturnValue({ provider: "openai", id: "gpt-4.1-mini" });
		getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "no key" });

		const result = await resolveExtractionModel(
			{ model: "openai/gpt-4.1-mini" },
			currentModel,
			registry,
		);
		expect(result.model).toBe(currentModel);
		expect(result.source).toContain("no auth");
	});

	it("невалидный формат model — fallback на текущую", async () => {
		const result = await resolveExtractionModel(
			{ model: "no-slash" },
			currentModel,
			registry,
		);
		expect(result.model).toBe(currentModel);
		expect(result.source).toContain("invalid config");
	});
});

// --- loadAnswerConfig (file-based) ---

describe("loadAnswerConfig", () => {
	const tmpBase = join(tmpdir(), `answer-config-test-${process.pid}`);
	const projectDir = join(tmpBase, "project");
	const piDir = join(projectDir, ".pi");

	beforeEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
		mkdirSync(piDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
	});

	it("нет settings — пустой конфиг", () => {
		const config = loadAnswerConfig(projectDir);
		expect(config.model).toBeUndefined();
	});

	it("project settings — читает model", () => {
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({ answer: { model: "anthropic/claude-haiku-4-5" } }),
		);
		const config = loadAnswerConfig(projectDir);
		expect(config.model).toBe("anthropic/claude-haiku-4-5");
	});

	it("пустой answer — model undefined", () => {
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({ answer: {} }),
		);
		const config = loadAnswerConfig(projectDir);
		expect(config.model).toBeUndefined();
	});

	it("невалидный JSON — model undefined", () => {
		writeFileSync(join(piDir, "settings.json"), "not json");
		const config = loadAnswerConfig(projectDir);
		expect(config.model).toBeUndefined();
	});

	it("model пустая строка — undefined", () => {
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({ answer: { model: "  " } }),
		);
		const config = loadAnswerConfig(projectDir);
		expect(config.model).toBeUndefined();
	});
});
