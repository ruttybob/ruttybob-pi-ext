/**
 * Тесты для slash-команд /subagents:list и /subagents:spawn.
 *
 * Мокается discoverAgents, loadSubagentConfig и ExtensionAPI.
 * Проверяем: парсинг args, autocomplete, валидацию, sendUserMessage.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockCommandContext } from "../test-helpers/mock-context.js";

// --- Моки модулей ---

const mockAgents = [
	{ name: "scout", description: "Research agent", source: "user" as const, filePath: "/agents/scout.md", systemPrompt: "" },
	{ name: "planner", description: "Planning agent", source: "user" as const, filePath: "/agents/planner.md", systemPrompt: "" },
	{ name: "worker", description: "Worker agent", source: "user" as const, filePath: "/agents/worker.md", systemPrompt: "" },
	{ name: "reviewer", description: "Review agent", source: "user" as const, filePath: "/agents/reviewer.md", systemPrompt: "" },
];

vi.mock("../../extensions/subagent/agents.js", () => ({
	discoverAgents: vi.fn(),
	AgentScope: {},
}));

vi.mock("../../extensions/subagent/config.js", () => ({
	loadSubagentConfig: vi.fn(),
	DEFAULT_CONFIG: {},
}));

vi.mock("../../extensions/subagent/schema.js", () => ({
	buildSchema: () => ({}),
	buildDescription: () => "test",
}));

vi.mock("../../extensions/subagent/runner.js", () => ({
	runSingleAgent: vi.fn(),
	mapWithConcurrencyLimit: vi.fn(),
}));

vi.mock("../../extensions/subagent/render.js", () => ({
	renderCall: () => "",
	renderResult: () => "",
}));

vi.mock("../../extensions/subagent/utils.js", () => ({
	getFinalOutput: () => "",
}));

import { discoverAgents } from "../../extensions/subagent/agents.js";
import { loadSubagentConfig } from "../../extensions/subagent/config.js";
import subagentExtension from "../../extensions/subagent/index.js";

const mockedDiscoverAgents = discoverAgents as ReturnType<typeof vi.fn>;
const mockedLoadConfig = loadSubagentConfig as ReturnType<typeof vi.fn>;

describe("subagent commands > /subagents:list", () => {
	let api: ReturnType<typeof createMockExtensionAPI>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createMockExtensionAPI();
		mockedLoadConfig.mockReturnValue({ agentScope: "user" });
		mockedDiscoverAgents.mockReturnValue({ agents: mockAgents, projectAgentsDir: null });
		subagentExtension(api);
	});

	it("регистрирует команду subagents:list", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:list");
		expect(cmd).toBeDefined();
		expect(cmd.options.description).toBe("List available subagents");
	});

	it("показывает список агентов через notify", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:list");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: true, ui: { notify } } as any);

		await cmd.options.handler("", ctx);

		expect(notify).toHaveBeenCalledTimes(1);
		const text = notify.mock.calls[0][0];
		expect(text).toContain("scout (user): Research agent");
		expect(text).toContain("worker (user): Worker agent");
	});

	it("показывает 'No subagents available' когда агентов нет", async () => {
		mockedDiscoverAgents.mockReturnValue({ agents: [], projectAgentsDir: null });
		// Перерегистрируем, чтобы подхватить новый мок
		const freshApi = createMockExtensionAPI();
		subagentExtension(freshApi);

		const cmd = freshApi._calls.registerCommand.find((c: any) => c.name === "subagents:list");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: true, ui: { notify } } as any);

		await cmd.options.handler("", ctx);

		expect(notify).toHaveBeenCalledWith("No subagents available.", "info");
	});

	it("не делает ничего если hasUI = false", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:list");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: false, ui: { notify } } as any);

		await cmd.options.handler("", ctx);

		expect(notify).not.toHaveBeenCalled();
	});
});

describe("subagent commands > /subagents:spawn", () => {
	let api: ReturnType<typeof createMockExtensionAPI>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createMockExtensionAPI();
		mockedLoadConfig.mockReturnValue({ agentScope: "user" });
		mockedDiscoverAgents.mockReturnValue({ agents: mockAgents, projectAgentsDir: null });
		subagentExtension(api);
	});

	it("регистрирует команду subagents:spawn", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		expect(cmd).toBeDefined();
		expect(cmd.options.description).toBe("Spawn a subagent: /subagents:spawn <agent> <task>");
	});

	it("отправляет sendUserMessage с правильной инструкцией", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const ctx = createMockCommandContext({ hasUI: true });

		await cmd.options.handler("worker fix the bug", ctx);

		expect(api._calls.sendUserMessage).toHaveLength(1);
		expect(api._calls.sendUserMessage[0].content).toBe(
			'Use the subagent tool with agent "worker" and task: fix the bug',
		);
	});

	it("показывает warning при пустых args", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: true, ui: { notify } } as any);

		await cmd.options.handler("", ctx);

		expect(notify).toHaveBeenCalledWith("Usage: /subagents:spawn <agent> <task>", "warning");
		expect(api._calls.sendUserMessage).toHaveLength(0);
	});

	it("показывает warning при отсутствии task", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: true, ui: { notify } } as any);

		await cmd.options.handler("worker", ctx);

		expect(notify).toHaveBeenCalledWith("Usage: /subagents:spawn <agent> <task>", "warning");
		expect(api._calls.sendUserMessage).toHaveLength(0);
	});

	it("показывает error при неизвестном агенте", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const notify = vi.fn();
		const ctx = createMockCommandContext({ hasUI: true, ui: { notify } } as any);

		await cmd.options.handler("unknown do something", ctx);

		expect(notify).toHaveBeenCalledWith(
			'Unknown agent "unknown". Available: scout, planner, worker, reviewer',
			"error",
		);
		expect(api._calls.sendUserMessage).toHaveLength(0);
	});

	it("не делает ничего если hasUI = false", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const ctx = createMockCommandContext({ hasUI: false });

		await cmd.options.handler("worker fix bug", ctx);

		expect(api._calls.sendUserMessage).toHaveLength(0);
	});

	it("корректно парсит агент с пробелами в task", async () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const ctx = createMockCommandContext({ hasUI: true });

		await cmd.options.handler("  scout   research the codebase structure  ", ctx);

		expect(api._calls.sendUserMessage[0].content).toBe(
			'Use the subagent tool with agent "scout" and task: research the codebase structure',
		);
	});
});

describe("subagent commands > autocomplete", () => {
	let api: ReturnType<typeof createMockExtensionAPI>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createMockExtensionAPI();
		mockedLoadConfig.mockReturnValue({ agentScope: "user" });
		mockedDiscoverAgents.mockReturnValue({ agents: mockAgents, projectAgentsDir: null });
		subagentExtension(api);
	});

	it("возвращает всех агентов при пустом prefix", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const result = cmd.options.getArgumentCompletions("");

		expect(result).toHaveLength(4);
		const names = result.map((i: any) => i.value);
		expect(names).toContain("scout");
		expect(names).toContain("planner");
		expect(names).toContain("worker");
		expect(names).toContain("reviewer");
	});

	it("фильтрует агентов по prefix", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const result = cmd.options.getArgumentCompletions("sc");

		expect(result).toHaveLength(1);
		expect(result[0].value).toBe("scout");
		expect(result[0].description).toBe("Research agent");
	});

	it("возвращает пустой массив если нет совпадений", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const result = cmd.options.getArgumentCompletions("xyz");

		expect(result).toHaveLength(0);
	});

	it("возвращает каждый элемент с value, label, description", () => {
		const cmd = api._calls.registerCommand.find((c: any) => c.name === "subagents:spawn");
		const result = cmd.options.getArgumentCompletions("wo");

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			value: "worker",
			label: "worker",
			description: "Worker agent",
		});
	});
});
