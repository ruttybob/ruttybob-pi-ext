import { describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockContext, createMockCommandContext } from "../test-helpers/mock-context.js";
import toolsExtension, { restoreFromBranch } from "../../extensions/tools/index.js";
import * as ignoreModule from "../../extensions/tools/ignore.js";
import * as groupsModule from "../../extensions/tools/groups.js";
const { matchesPattern, loadIgnorePatterns, resolveIgnoredTools, loadDisabledPatterns } = ignoreModule;

// ---------------------------------------------------------------------------
// matchesPattern
// ---------------------------------------------------------------------------

describe("matchesPattern", () => {
	it("exact match", () => {
		expect(matchesPattern("bash", "bash")).toBe(true);
		expect(matchesPattern("bash", "read")).toBe(false);
	});

	it("trailing wildcard *", () => {
		expect(matchesPattern("mesh_peers", "mesh_*")).toBe(true);
		expect(matchesPattern("mesh_send", "mesh_*")).toBe(true);
		expect(matchesPattern("mesh_", "mesh_*")).toBe(true);
		expect(matchesPattern("mesh", "mesh*")).toBe(true);
		expect(matchesPattern("read", "mesh_*")).toBe(false);
	});

	it("leading wildcard *", () => {
		expect(matchesPattern("web_search", "*_search")).toBe(true);
		expect(matchesPattern("zread_search", "*_search")).toBe(true);
		expect(matchesPattern("search", "*_search")).toBe(false);
	});

	it("middle wildcard *", () => {
		expect(matchesPattern("web_search_prime", "web_*_prime")).toBe(true);
		expect(matchesPattern("web__prime", "web_*_prime")).toBe(true);
		expect(matchesPattern("webprime", "web*prime")).toBe(true);
	});

	it("* matches empty string", () => {
		expect(matchesPattern("bash", "*")).toBe(true);
		expect(matchesPattern("", "*")).toBe(true);
	});

	it("? matches exactly one character", () => {
		expect(matchesPattern("foo_bar", "foo?bar")).toBe(true);
		expect(matchesPattern("foobar", "foo?bar")).toBe(false);
		expect(matchesPattern("foo__bar", "foo?bar")).toBe(false);
	});

	it("escapes regex special characters", () => {
		expect(matchesPattern("web.search", "web.search")).toBe(true);
		expect(matchesPattern("webXsearch", "web.search")).toBe(false);
		expect(matchesPattern("tool+v2", "tool+v2")).toBe(true);
	});

	it("empty pattern matches only empty string", () => {
		expect(matchesPattern("", "")).toBe(true);
		expect(matchesPattern("bash", "")).toBe(false);
	});

	it("multiple * wildcards", () => {
		expect(matchesPattern("a_b_c", "a*b*c")).toBe(true);
		expect(matchesPattern("abc", "a*b*c")).toBe(true);
		expect(matchesPattern("a_c", "a*b*c")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// resolveIgnoredTools
// ---------------------------------------------------------------------------

describe("resolveIgnoredTools", () => {
	it("returns empty set for no patterns", () => {
		const result = resolveIgnoredTools(["read", "bash"], []);
		expect(result).toEqual(new Set());
	});

	it("matches tools against patterns", () => {
		const result = resolveIgnoredTools(
			["mesh_peers", "mesh_send", "read", "bash"],
			["mesh_*"],
		);
		expect(result).toEqual(new Set(["mesh_peers", "mesh_send"]));
	});

	it("ignores non-matching patterns", () => {
		const result = resolveIgnoredTools(
			["mesh_peers", "read"],
			["holo", "jot"],
		);
		expect(result).toEqual(new Set());
	});

	it("handles multiple patterns", () => {
		const result = resolveIgnoredTools(
			["mesh_peers", "mesh_send", "holo", "jot", "read"],
			["mesh_*", "holo", "jot"],
		);
		expect(result).toEqual(new Set(["mesh_peers", "mesh_send", "holo", "jot"]));
	});
});

// ---------------------------------------------------------------------------
// restoreFromBranch with ignore
// ---------------------------------------------------------------------------

describe("restoreFromBranch with ignore", () => {
	it("does NOT force ignored tools into enabled set on restore", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "mesh_peers" },
			{ name: "mesh_send" },
		]);

		// Имитируем сохранённое состояние без mesh-инструментов
		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read"] } },
				],
			},
		} as any);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue(["mesh_*"]);

		const result = restoreFromBranch(pi, ctx);
		expect(result.has("mesh_peers")).toBe(false);
		expect(result.has("mesh_send")).toBe(false);
		expect(result.has("read")).toBe(true);

		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).not.toContain("mesh_peers");
		expect(lastCall).not.toContain("mesh_send");
		expect(lastCall).toContain("read");

		vi.restoreAllMocks();
	});

	it("does NOT add ignored tools when no saved state exists", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "mesh_peers" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [],
			},
		} as any);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue(["mesh_*"]);

		// No saved state → enabledTools = getActiveTools() minus disabled
		// mesh_peers не в disabled → останется, потому что getActiveTools() его вернёт
		// Это правильное поведение: ignore не вмешивается в activeTools
		const result = restoreFromBranch(pi, ctx);
		expect(result.has("read")).toBe(true);
		expect(result.has("bash")).toBe(true);
		expect(result.has("mesh_peers")).toBe(true);

		vi.restoreAllMocks();
	});

	it("keeps existing restore behaviour when no ignore patterns", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read"] } },
				],
			},
		} as any);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read"]));

		vi.restoreAllMocks();
	});
});

// ---------------------------------------------------------------------------
// /tools command with ignore
// ---------------------------------------------------------------------------

describe("/tools command with ignore", () => {
	it("скрывает locked-инструменты из ToolSelector", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "mesh_peers" },
			{ name: "mesh_send" },
		]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue(["mesh_*"]);

		let capturedComponent: any;
		const customFn = vi.fn(async (factory) => {
			const mockTui = { requestRender: vi.fn() };
			const mockTheme = {
				fg: (_c: string, t: string) => t,
				bold: (t: string) => t,
			};
			capturedComponent = factory(mockTui, mockTheme, {}, () => {});
		});

		const ctx = createMockCommandContext({
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find(c => c.name === "tools");
		await cmd.options.handler("", ctx);

		expect(customFn).toHaveBeenCalledTimes(1);

		// Locked-инструменты НЕ видны в render
		const lines = capturedComponent.render(60);
		const meshLine = lines.find((l: string) => l.includes("mesh_peers"));
		expect(meshLine).toBeUndefined();

		// Обычные инструменты видны
		const readLine = lines.find((l: string) => l.includes("read"));
		expect(readLine).toBeDefined();

		vi.restoreAllMocks();
	});

	it("toggle вызывает setActiveTools и persistState", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		let capturedComponent: any;
		const customFn = vi.fn(async (factory) => {
			const mockTui = { requestRender: vi.fn() };
			capturedComponent = factory(mockTui, {}, {}, () => {});
		});

		const ctx = createMockCommandContext({
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find(c => c.name === "tools");
		await cmd.options.handler("", ctx);

		// Toggle: включаем bash (enabledTools пустой → bash disabled → space включает)
		capturedComponent.handleInput(" "); // space toggle

		// Проверяем что setActiveTools вызван с обновлённым списком
		const lastToolsCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastToolsCall).toContain("bash"); // bash toggled ON

		// Проверяем что persistState вызван
		const lastEntry = pi._calls.appendEntry[pi._calls.appendEntry.length - 1];
		expect(lastEntry.type).toBe("tools-config");
		expect(lastEntry.data.enabledTools).toContain("bash");

		vi.restoreAllMocks();
	});
});
// ---------------------------------------------------------------------------

describe("tools extension (existing)", () => {
	function setup() {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read", description: "Read files" },
			{ name: "bash", description: "Run commands" },
			{ name: "edit", description: "Edit files" },
		]);
		toolsExtension(pi);
		return { pi };
	}

	describe("registration", () => {
		it("registers /tools command", () => {
			const { pi } = setup();
			const cmds = pi._calls.registerCommand;
			expect(cmds.some(c => c.name === "tools")).toBe(true);
		});

		it("registers session_start handler", () => {
			const { pi } = setup();
			const handlers = pi._calls.on.filter(h => h.event === "session_start");
			expect(handlers.length).toBeGreaterThan(0);
		});

		it("registers session_tree handler", () => {
			const { pi } = setup();
			const handlers = pi._calls.on.filter(h => h.event === "session_tree");
			expect(handlers.length).toBeGreaterThan(0);
		});
	});
});

describe("restoreFromBranch (existing)", () => {
	it("restores enabled tools from session branch", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "edit" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read", "bash"] } },
				],
			},
		} as any);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read", "bash"]));
		expect(pi._calls.setActiveTools).toHaveLength(1);
		expect(pi._calls.setActiveTools[0]).toEqual(["read", "bash"]);

		vi.restoreAllMocks();
	});

	it("uses last tools-config entry in branch (later entries win)", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "edit" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read"] } },
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read", "edit"] } },
				],
			},
		} as any);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read", "edit"]));

		vi.restoreAllMocks();
	});

	it("filters out tools that no longer exist", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read", "edit", "gone_tool"] } },
				],
			},
		} as any);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read"]));

		vi.restoreAllMocks();
	});

	it("returns current active tools when no saved state exists", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [],
			},
		} as any);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read", "bash"]));

		vi.restoreAllMocks();
	});

	it("ignores custom entries with wrong customType", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "other-extension", data: {} },
				],
			},
		} as any);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const result = restoreFromBranch(pi, ctx);
		expect(result).toEqual(new Set(["read"]));

		vi.restoreAllMocks();
	});
});

describe("/tools command (existing)", () => {
	it("calls ctx.ui.custom to show tool selector", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);
		toolsExtension(pi);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const customFn = vi.fn().mockResolvedValue(undefined);
		const ctx = createMockCommandContext({
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find(c => c.name === "tools");
		await cmd.options.handler("", ctx);

		expect(customFn).toHaveBeenCalledTimes(1);

		vi.restoreAllMocks();
	});

	it("renders a component with render/invalidate/handleInput", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);
		toolsExtension(pi);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const customFn = vi.fn(async (factory) => {
			const mockTui = { requestRender: vi.fn() };
			const mockTheme = {
				fg: (_c: string, t: string) => t,
				bold: (t: string) => t,
			};
			const component = factory(mockTui, mockTheme, {}, () => {});
			expect(component).toHaveProperty("render");
			expect(component).toHaveProperty("invalidate");
			expect(component).toHaveProperty("handleInput");
		});

		const ctx = createMockCommandContext({
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find(c => c.name === "tools");
		await cmd.options.handler("", ctx);

		expect(customFn).toHaveBeenCalled();

		vi.restoreAllMocks();
	});
});

describe("session events restore state (existing)", () => {
	it("session_start restores tools from branch", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "edit" },
		]);
		toolsExtension(pi);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read"] } },
				],
			},
		} as any);

		await pi._fire("session_start", {}, ctx);

		expect(pi._calls.setActiveTools.length).toBeGreaterThan(0);
		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).toEqual(["read"]);

		vi.restoreAllMocks();
	});

	it("session_tree restores tools from branch", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
		]);
		toolsExtension(pi);

		// ignore module already imported
		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["bash"] } },
				],
			},
		} as any);

		await pi._fire("session_tree", {}, ctx);

		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).toEqual(["bash"]);

		vi.restoreAllMocks();
	});
});

// ---------------------------------------------------------------------------
// loadDisabledPatterns
// ---------------------------------------------------------------------------

describe("loadDisabledPatterns", () => {
	it("returns empty array when tools.disabled is not set", () => {
		const result = loadDisabledPatterns("/nonexistent/path");
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// restoreFromBranch with disabled config
// ---------------------------------------------------------------------------

describe("restoreFromBranch with disabled config", () => {
	it("removes disabled tools from initial set when no saved state", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "web_search" },
			{ name: "web_fetch" },
		]);

		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [],
			},
		} as any);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue(["web_*"]);

		const result = restoreFromBranch(pi, ctx);
		expect(result.has("read")).toBe(true);
		expect(result.has("bash")).toBe(true);
		expect(result.has("web_search")).toBe(false);
		expect(result.has("web_fetch")).toBe(false);

		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).not.toContain("web_search");
		expect(lastCall).not.toContain("web_fetch");
		expect(lastCall).toContain("read");
		expect(lastCall).toContain("bash");

		vi.restoreAllMocks();
	});

	it("preserves saved state even for tools listed as disabled", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "web_search" },
		]);

		// Пользователь явно включил web_search через /tools
		const ctx = createMockContext({
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [
					{ type: "custom", customType: "tools-config", data: { enabledTools: ["read", "web_search"] } },
				],
			},
		} as any);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue(["web_search"]);

		const result = restoreFromBranch(pi, ctx);
		expect(result.has("read")).toBe(true);
		expect(result.has("web_search")).toBe(true); // saved state overrides disabled config

		vi.restoreAllMocks();
	});


});

// ---------------------------------------------------------------------------
// /tools <group> — toggle группы
// ---------------------------------------------------------------------------

describe("/tools <group> toggle", () => {
	it("toggle группы выключает инструменты", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "bash" },
			{ name: "zai_web_search" },
			{ name: "zai_vision" },
		]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue([]);
		vi.spyOn(groupsModule, "loadGroups").mockReturnValue([
			{ name: "zai", pattern: "zai_*" },
		]);

		// Инициализируем enabledTools через session_start
		const restoreCtx = createMockContext({
			cwd: "/test",
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [],
			},
		} as any);
		await pi._fire("session_start", {}, restoreCtx);

		const notify = vi.fn();
		const ctx = createMockCommandContext({
			cwd: "/test",
			ui: {
				...createMockContext().ui,
				notify,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools");
		await cmd.options.handler("zai", ctx);

		// zai-инструменты должны быть выключены
		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).not.toContain("zai_web_search");
		expect(lastCall).not.toContain("zai_vision");
		expect(lastCall).toContain("read");
		expect(lastCall).toContain("bash");

		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("zai"),
			"info",
		);

		vi.restoreAllMocks();
	});

	it("toggle группы включает инструменты", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([
			{ name: "read" },
			{ name: "zai_web_search" },
			{ name: "zai_vision" },
		]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue([]);
		vi.spyOn(groupsModule, "loadGroups").mockReturnValue([
			{ name: "zai", pattern: "zai_*" },
		]);

		// Инициализируем enabledTools через session_start
		const restoreCtx = createMockContext({
			cwd: "/test",
			sessionManager: {
				...createMockContext().sessionManager,
				getBranch: () => [],
			},
		} as any);
		await pi._fire("session_start", {}, restoreCtx);

		const notify = vi.fn();
		const ctx = createMockCommandContext({
			cwd: "/test",
			ui: {
				...createMockContext().ui,
				notify,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools");

		// Первый вызов — выключает
		await cmd.options.handler("zai", ctx);
		// Второй вызов — включает
		await cmd.options.handler("zai", ctx);

		const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
		expect(lastCall).toContain("zai_web_search");
		expect(lastCall).toContain("zai_vision");
		expect(lastCall).toContain("read");

		vi.restoreAllMocks();
	});

	it("показывает ошибку для несуществующей группы", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue([]);
		vi.spyOn(groupsModule, "loadGroups").mockReturnValue([]);

		const notify = vi.fn();
		const ctx = createMockCommandContext({
			cwd: "/test",
			ui: {
				...createMockContext().ui,
				notify,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools");
		await cmd.options.handler("nonexistent", ctx);

		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("not found"),
			"error",
		);

		vi.restoreAllMocks();
	});

	it("показывает warning для группы без инструментов", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue([]);
		vi.spyOn(groupsModule, "loadGroups").mockReturnValue([
			{ name: "zai", pattern: "zai_*" },
		]);

		const notify = vi.fn();
		const ctx = createMockCommandContext({
			cwd: "/test",
			ui: {
				...createMockContext().ui,
				notify,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools");
		await cmd.options.handler("zai", ctx);

		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("no matching tools"),
			"warning",
		);

		vi.restoreAllMocks();
	});
});

// ---------------------------------------------------------------------------
// /tools-group — управление группами
// ---------------------------------------------------------------------------

describe("/tools-group command", () => {
	it("регистрирует команду /tools-group", () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }]);
		toolsExtension(pi);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools-group");
		expect(cmd).toBeDefined();
		expect(cmd.options.description).toContain("group");
	});

	it("открывает TUI с GroupManager", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);
		vi.spyOn(ignoreModule, "loadDisabledPatterns").mockReturnValue([]);
		vi.spyOn(groupsModule, "loadGroups").mockReturnValue([
			{ name: "zai", pattern: "zai_*", description: "ZAI tools" },
		]);

		let capturedComponent: any;
		const customFn = vi.fn(async (factory) => {
			const mockTui = { requestRender: vi.fn() };
			capturedComponent = factory(mockTui, {}, {}, () => {});
		});

		const ctx = createMockCommandContext({
			cwd: "/test",
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools-group");
		await cmd.options.handler("", ctx);

		expect(customFn).toHaveBeenCalledTimes(1);
		expect(capturedComponent).toHaveProperty("render");
		expect(capturedComponent).toHaveProperty("handleInput");

		const lines = capturedComponent.render(80);
		const titleLine = lines.find((l: string) => l.includes("Tool Groups"));
		expect(titleLine).toBeDefined();

		vi.restoreAllMocks();
	});

	it("/tools без аргументов открывает TUI-селектор (обратная совместимость)", async () => {
		const pi = createMockExtensionAPI();
		pi._setAllTools([{ name: "read" }, { name: "bash" }]);
		toolsExtension(pi);

		vi.spyOn(ignoreModule, "loadIgnorePatterns").mockReturnValue([]);

		const customFn = vi.fn().mockResolvedValue(undefined);
		const ctx = createMockCommandContext({
			ui: {
				...createMockContext().ui,
				custom: customFn,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c) => c.name === "tools");
		await cmd.options.handler("", ctx);

		expect(customFn).toHaveBeenCalledTimes(1);

		vi.restoreAllMocks();
	});
});
