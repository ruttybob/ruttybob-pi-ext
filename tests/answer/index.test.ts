import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockExtensionAPI, createMockContext } from "../test-helpers/mock-api.js";

async function getHandler(): Promise<(args: string, ctx: any) => Promise<void>> {
	const pi = createMockExtensionAPI();
	const mod = await import("../../extensions/answer/index.js");
	mod.default(pi);
	const cmd = pi._calls.registerCommand.find(
		(c: any) => c.name === "answer",
	);
	return cmd!.options.handler;
}

describe("answer — регистрация", () => {
	it("регистрирует команду /answer", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/answer/index.js");
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "answer",
		);
		expect(cmd).toBeDefined();
		expect(cmd!.options.description).toContain("question");
	});

	it("регистрирует шорткат ctrl+.", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/answer/index.js");
		mod.default(pi);

		const shortcut = pi._calls.registerShortcut.find(
			(s: any) => s.shortcut === "ctrl+.",
		);
		expect(shortcut).toBeDefined();
		expect(shortcut!.options.description).toContain("question");
	});
});

describe("answer — handler guards", () => {
	it("notify при hasUI: false", async () => {
		const handler = await getHandler();
		const ctx = createMockContext({ hasUI: false });

		await handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("interactive"),
			"error",
		);
	});

	it("notify при отсутствии модели", async () => {
		const handler = await getHandler();
		const ctx = createMockContext({ model: undefined });

		await handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("No model"),
			"error",
		);
	});

	it("notify при отсутствии ассистент-сообщений", async () => {
		const handler = await getHandler();
		const ctx = createMockContext();

		await handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("No assistant messages"),
			"error",
		);
	});

	it("shortcut handler — тот же guard при hasUI: false", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/answer/index.js");
		mod.default(pi);
		const shortcut = pi._calls.registerShortcut.find(
			(s: any) => s.shortcut === "ctrl+.",
		);

		const ctx = createMockContext({ hasUI: false });

		await shortcut!.options.handler(ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("interactive"),
			"error",
		);
	});
});

describe("answer — parseExtractionResult", () => {
	let parseExtractionResult: (text: string) => any;

	beforeAll(async () => {
		const mod = await import("../../extensions/answer/index.js");
		parseExtractionResult = mod.parseExtractionResult;
	});

	it("корректный JSON — возвращает вопросы", () => {
		const result = parseExtractionResult(
			JSON.stringify({
				questions: [
					{ question: "What is your name?", context: "Personal info" },
				],
			}),
		);
		expect(result).not.toBeNull();
		expect(result.questions).toHaveLength(1);
		expect(result.questions[0].question).toBe("What is your name?");
		expect(result.questions[0].context).toBe("Personal info");
	});

	it("JSON в markdown code block — извлекается", () => {
		const text = '```json\n{"questions": [{"question": "Q1"}]}\n```';
		const result = parseExtractionResult(text);
		expect(result).not.toBeNull();
		expect(result.questions).toHaveLength(1);
		expect(result.questions[0].question).toBe("Q1");
	});

	it("JSON в code block без указания языка — извлекается", () => {
		const text = '```\n{"questions": [{"question": "Q?"}]}\n```';
		const result = parseExtractionResult(text);
		expect(result).not.toBeNull();
		expect(result.questions).toHaveLength(1);
	});

	it("пустой массив вопросов — questions.length === 0", () => {
		const result = parseExtractionResult('{"questions": []}');
		expect(result).not.toBeNull();
		expect(result.questions).toHaveLength(0);
	});

	it("невалидный JSON — возвращает null", () => {
		expect(parseExtractionResult("not json at all")).toBeNull();
	});

	it("JSON без поля questions — возвращает null", () => {
		expect(parseExtractionResult('{"other": []}')).toBeNull();
	});

	it("questions не массив — возвращает null", () => {
		expect(parseExtractionResult('{"questions": "not-array"}')).toBeNull();
	});
});

describe("answer — model from config", () => {
	const tmpBase = join(tmpdir(), `answer-handler-test-${process.pid}`);
	const projectDir = join(tmpBase, "project");
	const piDir = join(projectDir, ".pi");

	beforeEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
		mkdirSync(piDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpBase, { recursive: true, force: true });
	});

	it("использует ctx.model когда нет конфига", async () => {
		const handler = await getHandler();
		const custom = vi.fn().mockResolvedValue(null);
		const ctx = createMockContext({
			cwd: projectDir,
			ui: { notify: vi.fn(), custom },
			sessionManager: {
				getBranch: () => [
					{
						type: "message",
						message: {
							role: "assistant",
							stopReason: "stop",
							content: [{ type: "text", text: "What is your name?" }],
						},
					},
				],
			},
		});

		await handler("", ctx);
		expect(custom).toHaveBeenCalled();
	});

	it("использует модель из project settings", async () => {
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({ answer: { model: "openai/gpt-4.1-mini" } }),
		);

		const handler = await getHandler();
		const configured = { provider: "openai", id: "gpt-4.1-mini" };
		const find = vi.fn().mockReturnValue(configured);
		const getApiKeyAndHeaders = vi.fn().mockResolvedValue({
				ok: true,
				apiKey: "test-key",
			});

		const custom = vi.fn().mockResolvedValue(null);
		const ctx = createMockContext({
			model: { provider: "test", id: "current-model" },
			cwd: projectDir,
			modelRegistry: { find, getApiKeyAndHeaders },
			ui: { notify: vi.fn(), custom },
			sessionManager: {
				getBranch: () => [
					{
						type: "message",
						message: {
							role: "assistant",
							stopReason: "stop",
							content: [{ type: "text", text: "What is your name?" }],
						},
					},
				],
			},
		});

		await handler("", ctx);

		// find был вызван с моделью из конфига
		expect(find).toHaveBeenCalledWith("openai", "gpt-4.1-mini");
		// custom вызван (extraction запущен)
		expect(custom).toHaveBeenCalled();
	});
});
