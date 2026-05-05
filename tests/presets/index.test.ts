import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockCommandContext } from "../test-helpers/mock-context.js";
import presetsExtension, {
	loadPresets,
	expandToolMasks,
	globPathToRegex,
	matchesFilePath,
	normalizeToolPath,
	findPresetInBranch,
	readKeybinding,
	resolveCycleForwardShortcut,
	resolveCycleBackwardShortcut,
	DEFAULT_CYCLE_FORWARD,
	DEFAULT_CYCLE_BACKWARD,
	KB_CYCLE_FORWARD,
	KB_CYCLE_BACKWARD,
} from "../../extensions/presets/index.js";

describe("presets extension", () => {
	const testDir = join(tmpdir(), `presets-test-${process.pid}`);
	const agentDir = join(testDir, "agent");

	beforeEach(() => {
		mkdirSync(agentDir, { recursive: true });
	});
	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	function createContext(overrides?: any) {
		return createMockCommandContext({
			cwd: testDir,
			agentDir,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				setWidget: vi.fn(),
				input: vi.fn(),
			},
			...overrides,
		} as any);
	}

	function setupWithTools(tools: string[]) {
		const pi = createMockExtensionAPI();
		pi._setAllTools(tools.map((name) => ({ name })));
		presetsExtension(pi);
		return { pi };
	}

	/** Helper: fire session_start to load presets from agentDir */
	async function initSession(pi: any, ctx: any) {
		const handler = pi._calls.on.find((h: any) => h.event === "session_start")!.handler;
		await handler({}, ctx);
	}

	// ── loadPresets ──────────────────────────────────────────

	describe("loadPresets", () => {
		it("loads global presets from agentDir", () => {
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { provider: "anthropic", model: "claude-sonnet-4-5" },
			}));

			const result = loadPresets(testDir, agentDir);
			expect(result.work).toBeDefined();
			expect(result.work.model).toBe("claude-sonnet-4-5");
		});

		it("merges project presets over global", () => {
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { provider: "anthropic", model: "old-model" },
			}));

			const projectDir = join(testDir, "project");
			mkdirSync(join(projectDir, ".pi"), { recursive: true });
			writeFileSync(join(projectDir, ".pi", "presets.json"), JSON.stringify({
				work: { provider: "anthropic", model: "new-model" },
				custom: { thinkingLevel: "high" },
			}));

			const result = loadPresets(projectDir, agentDir);
			expect(result.work.model).toBe("new-model");
			expect(result.custom.thinkingLevel).toBe("high");
		});

		it("returns empty object when no config files exist", () => {
			const result = loadPresets(testDir, agentDir);
			expect(result).toEqual({});
		});

		it("filters out preset with disabled: true", () => {
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { provider: "anthropic", model: "claude-sonnet-4-5" },
				old: { disabled: true, provider: "openai", model: "gpt-4" },
			}));

			const result = loadPresets(testDir, agentDir);
			expect(result.work).toBeDefined();
			expect(result.work.model).toBe("claude-sonnet-4-5");
			expect(result.old).toBeUndefined();
		});

		it("keeps preset with disabled: false", () => {
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { disabled: false, provider: "anthropic", model: "claude-sonnet-4-5" },
			}));

			const result = loadPresets(testDir, agentDir);
			expect(result.work).toBeDefined();
			expect(result.work.model).toBe("claude-sonnet-4-5");
		});

		it("project disabled:true hides global preset with same name", () => {
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { provider: "anthropic", model: "claude-sonnet-4-5" },
			}));

			const projectDir = join(testDir, "project");
			mkdirSync(join(projectDir, ".pi"), { recursive: true });
			writeFileSync(join(projectDir, ".pi", "presets.json"), JSON.stringify({
				work: { disabled: true },
			}));

			const result = loadPresets(projectDir, agentDir);
			expect(result.work).toBeUndefined();
		});
	});

	// ── registration ────────────────────────────────────────

	describe("registration", () => {
		it("registers /preset command", () => {
			const pi = createMockExtensionAPI();
			presetsExtension(pi);
			expect(pi._calls.registerCommand.some((c: any) => c.name === "preset")).toBe(true);
		});

		it("registers forward cycle shortcut with correct description", () => {
			const pi = createMockExtensionAPI();
			presetsExtension(pi);
			const fwd = pi._calls.registerShortcut.find(
				(s: any) => s.options.description === "Cycle presets forward",
			);
			expect(fwd).toBeDefined();
			expect(fwd.shortcut).toBe(resolveCycleForwardShortcut());
		});

		it("registers backward cycle shortcut with correct description", () => {
			const pi = createMockExtensionAPI();
			presetsExtension(pi);
			const bwd = pi._calls.registerShortcut.find(
				(s: any) => s.options.description === "Cycle presets backward",
			);
			expect(bwd).toBeDefined();
			expect(bwd.shortcut).toBe(resolveCycleBackwardShortcut());
		});

		it("registers --preset flag", () => {
			const pi = createMockExtensionAPI();
			presetsExtension(pi);
			expect(pi._calls.registerFlag.some((f: any) => f.name === "preset")).toBe(true);
		});

		it("registers session_start, before_agent_start, turn_start", () => {
			const pi = createMockExtensionAPI();
			presetsExtension(pi);
			const events = pi._calls.on.map((h: any) => h.event);
			expect(events).toContain("session_start");
			expect(events).toContain("before_agent_start");
			expect(events).toContain("turn_start");
		});
	});

	// ── tools filtering ─────────────────────────────────────

	describe("applyPreset — tools from other extensions", () => {
		it("applies all tools when all are available", async () => {
			const { pi } = setupWithTools(["read", "bash", "edit", "write", "questionnaire"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read", "bash", "questionnaire"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			expect(pi._calls.setActiveTools.length).toBeGreaterThan(0);
			const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastCall).toEqual(["read", "bash", "questionnaire"]);
			// no warning about unknown tools
			const warnings = (ctx as any).ui.notify.mock.calls.filter((c: any[]) => c[1] === "warning");
			expect(warnings).toHaveLength(0);
		});

		it("warns and filters out tools from missing extensions", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read", "questionnaire", "session_query"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			// warning about missing tools
			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("questionnaire, session_query"), "warning",
			);
			// only valid tools applied
			const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastCall).toEqual(["read"]);
		});

		it("warns when ALL tools are missing", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["foo_tool", "bar_tool"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("foo_tool, bar_tool"), "warning",
			);
			// setActiveTools NOT called since no valid tools
			const toolCalls = pi._calls.setActiveTools;
			for (const call of toolCalls) {
				expect(call).not.toEqual(["foo_tool", "bar_tool"]);
				expect(call).not.toEqual([]);
			}
		});

		it("does not touch tools when preset has no tools field", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { thinkingLevel: "high" },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			// setActiveTools should NOT be called (no tools in preset)
			expect(pi._calls.setActiveTools).toHaveLength(0);
		});
	});

	// ── /preset command ─────────────────────────────────────

	describe("/preset command", () => {
		it("errors on unknown preset name", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("nonexistent", ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Unknown preset"), "error",
			);
		});

		it("applies thinkingLevel", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { thinkingLevel: "high" },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			expect(pi._calls.setThinkingLevel).toContain("high");
		});

		it("shows selector UI when no args", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { tools: ["read"] },
			}));

			const customFn = vi.fn().mockResolvedValue(null);
			const ctx = createContext({ ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn(), input: vi.fn(), custom: customFn } });
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("", ctx);

			expect(customFn).toHaveBeenCalledTimes(1);
		});
	});

	// ── before_agent_start (instructions injection) ─────────

	describe("before_agent_start", () => {
		it("injects instructions into system prompt", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { instructions: "You are in PLANNING MODE." },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			const handler = pi._calls.on.find((h: any) => h.event === "before_agent_start")!.handler;
			const result = await handler({ systemPrompt: "Original prompt" });

			expect(result.systemPrompt).toContain("Original prompt");
			expect(result.systemPrompt).toContain("PLANNING MODE");
		});

		it("returns undefined when no active instructions", async () => {
			const { pi } = setupWithTools(["read"]);

			const handler = pi._calls.on.find((h: any) => h.event === "before_agent_start")!.handler;
			const result = await handler({ systemPrompt: "Hello" });

			expect(result).toBeUndefined();
		});
	});

	// ── turn_start (persist) ────────────────────────────────

	describe("turn_start persist", () => {
		it("appends preset-state entry", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("work", ctx);

			const handler = pi._calls.on.find((h: any) => h.event === "turn_start")!.handler;
			await handler({}, ctx);

			expect(pi._calls.appendEntry.length).toBeGreaterThan(0);
			const last = pi._calls.appendEntry[pi._calls.appendEntry.length - 1];
			expect(last.type).toBe("preset-state");
			expect(last.data.name).toBe("work");
		});

		it("does not append when no active preset", async () => {
			const { pi } = setupWithTools(["read"]);

			const handler = pi._calls.on.find((h: any) => h.event === "turn_start")!.handler;
			await handler({}, createContext());

			expect(pi._calls.appendEntry).toHaveLength(0);
		});
	});

	// ── expandToolMasks (unit) ───────────────────────────────

	describe("expandToolMasks", () => {
		it("expands zai_* mask to all zai_ tools", () => {
			const all = ["read", "bash", "zai_web_search", "zai_web_reader", "zai_zread_search_doc"];
			const { expanded, unresolved } = expandToolMasks(["zai_*"], all);
			expect(expanded).toEqual(["zai_web_search", "zai_web_reader", "zai_zread_search_doc"]);
			expect(unresolved).toEqual([]);
		});

		it("expands * mask to all tools", () => {
			const all = ["read", "bash", "edit"];
			const { expanded, unresolved } = expandToolMasks(["*"], all);
			expect(expanded).toEqual(["read", "bash", "edit"]);
		});

		it("combines exact name + mask without duplicates", () => {
			const all = ["read", "zai_web_search", "zai_web_reader"];
			const { expanded, unresolved } = expandToolMasks(["read", "zai_*", "zai_web_search"], all);
			// duplicates expected from expansion — dedup happens in applyPreset
			expect(expanded).toContain("read");
			expect(expanded).toContain("zai_web_search");
			expect(expanded).toContain("zai_web_reader");
		});

		it("reports unresolved mask when no match", () => {
			const all = ["read", "bash"];
			const { expanded, unresolved } = expandToolMasks(["zai_*"], all);
			expect(expanded).toEqual([]);
			expect(unresolved).toEqual(["zai_*"]);
		});

		it("reports unresolved exact name when missing", () => {
			const all = ["read"];
			const { expanded, unresolved } = expandToolMasks(["read", "questionnaire"], all);
			expect(expanded).toEqual(["read"]);
			expect(unresolved).toEqual(["questionnaire"]);
		});

		it("returns empty when tools array is empty", () => {
			const { expanded, unresolved } = expandToolMasks([], ["read"]);
			expect(expanded).toEqual([]);
			expect(unresolved).toEqual([]);
		});
	});

	// ── mask expansion in applyPreset (integration) ─────────

	describe("applyPreset — tool mask expansion", () => {
		it("expands zai_* in preset config", async () => {
			const { pi } = setupWithTools(["read", "bash", "zai_web_search", "zai_web_reader"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				explore: { tools: ["read", "zai_*"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("explore", ctx);

			const lastCall = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastCall).toContain("read");
			expect(lastCall).toContain("zai_web_search");
			expect(lastCall).toContain("zai_web_reader");
			expect(lastCall).toHaveLength(3); // deduplicated
		});

		it("warns when mask matches nothing", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				explore: { tools: ["read", "zai_*"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("explore", ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("zai_*"), "warning",
			);
		});
	});

	// ── cycle direction ─────────────────────────────────────

	describe("cyclePreset — direction", () => {
		it("cycles forward with Ctrl+'", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
				beta: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			// Activate alpha
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("alpha", ctx);

			// Cycle forward → beta
			const fwd = pi._calls.registerShortcut.find((s: any) => s.options.description === "Cycle presets forward")!;
			await fwd.options.handler(ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("beta"), "info",
			);
		});

		it("cycles backward with Ctrl+;", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
				beta: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			// Activate beta
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("beta", ctx);

			// Cycle backward → alpha
			const bwd = pi._calls.registerShortcut.find((s: any) => s.options.description === "Cycle presets backward")!;
			await bwd.options.handler(ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("alpha"), "info",
			);
		});

		it("wraps backward from first preset to (none)", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			// Activate alpha
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("alpha", ctx);

			// Cycle backward → (none)
			const bwd = pi._calls.registerShortcut.find((s: any) => s.options.description === "Cycle presets backward")!;
			await bwd.options.handler(ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("cleared"), "info",
			);
		});

		it("forward then backward returns to original", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
				beta: { tools: ["read"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			// Activate alpha
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("alpha", ctx);

			const fwd = pi._calls.registerShortcut.find((s: any) => s.options.description === "Cycle presets forward")!;
			const bwd = pi._calls.registerShortcut.find((s: any) => s.options.description === "Cycle presets backward")!;

			// Forward → beta
			await fwd.options.handler(ctx);
			// Backward → alpha
			await bwd.options.handler(ctx);

			expect((ctx as any).ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("alpha"), "info",
			);
		});
	});

	// ── preset-indicator widget ───────────────────────────────

	describe("preset-indicator widget", () => {
		const stubTheme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			dim: (text: string) => text,
		};

		/** Helper: create context that captures setWidget calls for inspection */
		function createWidgetContext(overrides?: any) {
			const setWidgetCalls: { id: string; factory: any; options?: any }[] = [];
			const setWidget = vi.fn((id: string, factory: any, options?: any) => {
				setWidgetCalls.push({ id, factory, options });
			});
			const ctx = createContext({
				ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget, input: vi.fn() },
				...overrides,
			});
			return { ctx, setWidgetCalls, setWidget };
		}

		it("registers preset-indicator widget with placement belowEditor", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
			}));

			const { ctx, setWidgetCalls } = createWidgetContext();
			await initSession(pi, ctx);

			const widgetCall = setWidgetCalls.find((w: any) => w.id === "preset-indicator");
			expect(widgetCall).toBeDefined();
			expect(widgetCall.options).toEqual({ placement: "belowEditor" });
		});

		it("renders all presets dim when no active preset", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
				beta: { tools: ["read"] },
			}));

			const { ctx, setWidgetCalls } = createWidgetContext();
			await initSession(pi, ctx);

			const widgetCall = setWidgetCalls.find((w: any) => w.id === "preset-indicator")!;
			const handle = widgetCall.factory(/* tui */ null, stubTheme);
			const lines = handle.render(80);

			expect(lines).toHaveLength(1);
			// Both names present, all dim (stubTheme returns text as-is)
			expect(lines[0]).toContain("alpha");
			expect(lines[0]).toContain("beta");
			// Gear present
			expect(lines[0]).toContain("⚙");
		});

		it("renders active preset name highlighted", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
				beta: { tools: ["read"] },
			}));

			const { ctx, setWidgetCalls } = createWidgetContext();
			await initSession(pi, ctx);

			// Activate alpha
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("alpha", ctx);

			const widgetCall = setWidgetCalls.find((w: any) => w.id === "preset-indicator")!;
			const handle = widgetCall.factory(/* tui */ null, stubTheme);
			const lines = handle.render(80);

			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain("alpha");
			expect(lines[0]).toContain("beta");
		});

		it("does not call setStatus", async () => {
			const { pi } = setupWithTools(["read"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				alpha: { tools: ["read"] },
			}));

			const setStatus = vi.fn();
			const ctx = createContext({ ui: { notify: vi.fn(), setStatus, setWidget: vi.fn(), input: vi.fn() } });
			await initSession(pi, ctx);

			// Activate preset via command
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("alpha", ctx);

			expect(setStatus).not.toHaveBeenCalled();
		});
	});

	// ── findPresetInBranch (unit) ────────────────────────────

	describe("findPresetInBranch", () => {
		it("returns undefined for empty branch", () => {
			expect(findPresetInBranch({ getBranch: () => [] })).toBeUndefined();
		});

		it("returns preset name from single entry", () => {
			expect(findPresetInBranch({
				getBranch: () => [
					{ type: "custom", customType: "preset-state", data: { name: "plan" } },
				],
			})).toBe("plan");
		});

		it("returns last preset name when multiple entries exist", () => {
			expect(findPresetInBranch({
				getBranch: () => [
					{ type: "custom", customType: "preset-state", data: { name: "plan" } },
					{ type: "custom", customType: "preset-state", data: { name: "act" } },
				],
			})).toBe("act");
		});

		it("falls back to getEntries when getBranch is unavailable", () => {
			expect(findPresetInBranch({
				getEntries: () => [
					{ type: "custom", customType: "preset-state", data: { name: "plan" } },
				],
			})).toBe("plan");
		});

		it("ignores entries with wrong customType", () => {
			expect(findPresetInBranch({
				getBranch: () => [
					{ type: "custom", customType: "other-state", data: { name: "plan" } },
				],
			})).toBeUndefined();
		});

		it("returns undefined when data.name is missing", () => {
			expect(findPresetInBranch({
				getBranch: () => [
					{ type: "custom", customType: "preset-state", data: {} },
				],
			})).toBeUndefined();
		});
	});

	// ── session_start restore (full applyPreset) ────────────

	describe("session_start restore", () => {
		it("restores preset with full applyPreset on session_start", async () => {
			const { pi } = setupWithTools(["read", "bash", "questionnaire"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: {
					thinkingLevel: "high",
					tools: ["read", "questionnaire"],
				},
			}));

			// Override sessionManager — preset-state lives in branch (parent session)
			const ctx = createContext({
				sessionManager: {
					getEntries: () => [],
					getBranch: () => [
						{ type: "custom", customType: "preset-state", data: { name: "plan" } },
					],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});

			await initSession(pi, ctx);

			// Verify applyPreset was called — thinkingLevel and tools set
			expect(pi._calls.setThinkingLevel).toContain("high");
			expect(pi._calls.setActiveTools.length).toBeGreaterThan(0);
			const lastTools = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastTools).toEqual(["read", "questionnaire"]);
		});

		it("skips restore when preset flag is provided", async () => {
			const { pi } = setupWithTools(["read", "bash", "questionnaire"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read"] },
				act: { tools: ["bash"] },
			}));

			// Simulate --preset act flag
			(pi as any).getFlag = (name: string) => name === "preset" ? "act" : undefined;

			const ctx = createContext({
				sessionManager: {
					getEntries: () => [],
					getBranch: () => [
						{ type: "custom", customType: "preset-state", data: { name: "plan" } },
					],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});

			await initSession(pi, ctx);

			// Flag preset "act" applied, not restore preset "plan"
			const lastTools = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastTools).toEqual(["bash"]);
		});

		it("restores preset from parent session (reload/handoff)", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				work: { tools: ["read"] },
			}));

			// Branch includes entries from parent session (after reload)
			const ctx = createContext({
				sessionManager: {
					getEntries: () => [], // current session has nothing
					getBranch: () => [
						{ type: "user", content: "hello" }, // parent session entry
						{ type: "custom", customType: "preset-state", data: { name: "work" } }, // parent preset
					],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});

			await initSession(pi, ctx);

			const lastTools = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastTools).toEqual(["read"]);
		});

		it("does not restore when preset deleted from config", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({}));

			const ctx = createContext({
				sessionManager: {
					getEntries: () => [],
					getBranch: () => [
						{ type: "custom", customType: "preset-state", data: { name: "deleted" } },
					],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});

			await initSession(pi, ctx);

			// No setActiveTools calls from preset restore
			expect(pi._calls.setActiveTools).toHaveLength(0);
		});
	});

	// ── session_tree handler ────────────────────────────────

	describe("session_tree", () => {
		it("restores preset when branch has preset-state", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read"] },
			}));

			const setWidget = vi.fn();
			const ctx = createContext({
				ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget, input: vi.fn() },
				sessionManager: {
					getBranch: () => [
						{ type: "custom", customType: "preset-state", data: { name: "plan" } },
					],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});
			await initSession(pi, ctx);

			// Fire session_tree event
			await pi._fire("session_tree", {}, ctx);

			const lastTools = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastTools).toEqual(["read"]);
		});

		it("clears preset when branch has no preset-state", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read"] },
			}));

			const setWidget = vi.fn();
			const ctx = createContext({
				ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget, input: vi.fn() },
				sessionManager: {
					getBranch: () => [],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});
			await initSession(pi, ctx);

			// Activate a preset first
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			// Navigate to branch with no preset-state
			await pi._fire("session_tree", {}, ctx);

			// Preset should be cleared — tools restored to default (all tools)
			const lastTools = pi._calls.setActiveTools[pi._calls.setActiveTools.length - 1];
			expect(lastTools).toEqual(["read", "bash"]);
		});

		it("does nothing when no preset active and branch has no state", async () => {
			const { pi } = setupWithTools(["read", "bash"]);
			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read"] },
			}));

			const setWidget = vi.fn();
			const ctx = createContext({
				ui: { notify: vi.fn(), setStatus: vi.fn(), setWidget, input: vi.fn() },
				sessionManager: {
					getBranch: () => [],
					getLeafId: () => "leaf-1",
					getSessionFile: () => "/tmp/test-session.jsonl",
				},
			});
			await initSession(pi, ctx);

			const toolsCountBefore = pi._calls.setActiveTools.length;

			await pi._fire("session_tree", {}, ctx);

			// No new setActiveTools calls
			expect(pi._calls.setActiveTools).toHaveLength(toolsCountBefore);
		});
	});

	// ── restrictWritesTo: unit tests ─────────────────────────

	describe("globPathToRegex", () => {
		it("matches single * glob", () => {
			expect(globPathToRegex("*.md").test("plan.md")).toBe(true);
			expect(globPathToRegex("*.md").test("src/plan.md")).toBe(false);
		});

		it("matches ** glob (any depth)", () => {
			expect(globPathToRegex(".plans/**").test(".plans/plan.md")).toBe(true);
			expect(globPathToRegex(".plans/**").test(".plans/sub/plan.md")).toBe(true);
			expect(globPathToRegex(".plans/**").test("src/index.ts")).toBe(false);
		});

		it("matches exact path", () => {
			expect(globPathToRegex("plan.md").test("plan.md")).toBe(true);
			expect(globPathToRegex("plan.md").test("other.md")).toBe(false);
		});

		it("matches prefix + **", () => {
			expect(globPathToRegex("src/**").test("src/index.ts")).toBe(true);
			expect(globPathToRegex("src/**").test("src/sub/deep.ts")).toBe(true);
			expect(globPathToRegex("src/**").test("lib/index.ts")).toBe(false);
		});

		it("handles ? wildcard", () => {
			expect(globPathToRegex("plan?.md").test("plan1.md")).toBe(true);
			expect(globPathToRegex("plan?.md").test("plan.md")).toBe(false);
		});
	});

	describe("matchesFilePath", () => {
		it("returns true when at least one pattern matches", () => {
			expect(matchesFilePath([".plans/**", ".pi/**"], ".plans/plan.md")).toBe(true);
			expect(matchesFilePath([".plans/**", ".pi/**"], ".pi/config.json")).toBe(true);
		});

		it("returns false when no pattern matches", () => {
			expect(matchesFilePath([".plans/**"], "src/index.ts")).toBe(false);
		});

		it("returns false for empty patterns", () => {
			expect(matchesFilePath([], "any/file.txt")).toBe(false);
		});

		it("handles backslashes in file path", () => {
			expect(matchesFilePath([".plans/**"], ".plans\\plan.md")).toBe(true);
		});
	});

	describe("normalizeToolPath", () => {
		it("returns relative path from cwd", () => {
			expect(normalizeToolPath(".plans/plan.md", "/project")).toBe(".plans/plan.md");
		});

		it("resolves absolute paths", () => {
			expect(normalizeToolPath("/project/.plans/plan.md", "/project")).toBe(".plans/plan.md");
		});

		it("resolves ./ prefix", () => {
			expect(normalizeToolPath("./.plans/plan.md", "/project")).toBe(".plans/plan.md");
		});
	});

	// ── restrictWritesTo: tool_call handler ──────────────────

	describe("restrictWritesTo — tool_call handler", () => {
		async function setupWithRestriction(
			restrictWritesTo: string[],
			tools = ["read", "write", "edit", "bash"],
		) {
			const pi = createMockExtensionAPI();
			pi._setAllTools(tools.map((name) => ({ name })));
			presetsExtension(pi);

			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools, restrictWritesTo },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			// Activate preset
			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("plan", ctx);

			return { pi, ctx };
		}

		it("allows write to matching path", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: ".plans/plan.md", content: "# Plan" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("allows edit to matching path", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "edit",
				input: { path: ".plans/plan.md", edits: [] },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("blocks write to non-matching path", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: "src/index.ts", content: "hello" },
			}, ctx);
			expect(result).toEqual({ block: true, reason: expect.stringContaining("src/index.ts") });
		});

		it("blocks edit to non-matching path", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "edit",
				input: { path: "src/index.ts", edits: [] },
			}, ctx);
			expect(result).toEqual({ block: true, reason: expect.stringContaining("src/index.ts") });
		});

		it("does not affect read tool", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "read",
				input: { path: "src/index.ts" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("does not affect bash tool", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "bash",
				input: { command: "cat src/index.ts" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("allows multiple patterns", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**", ".pi/**"]);

			const r1 = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: ".plans/plan.md", content: "" },
			}, ctx);
			expect(r1).toBeUndefined();

			const r2 = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: ".pi/config.json", content: "" },
			}, ctx);
			expect(r2).toBeUndefined();
		});

		it("does not block when preset has no restrictWritesTo", async () => {
			const pi = createMockExtensionAPI();
			pi._setAllTools(["read", "write"].map((n) => ({ name: n })));
			presetsExtension(pi);

			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				free: { tools: ["read", "write"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "preset")!;
			await cmd.options.handler("free", ctx);

			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: "src/anywhere.ts", content: "" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("does not block when no preset is active", async () => {
			const pi = createMockExtensionAPI();
			pi._setAllTools(["read", "write"].map((n) => ({ name: n })));
			presetsExtension(pi);

			writeFileSync(join(agentDir, "presets.json"), JSON.stringify({
				plan: { tools: ["read", "write"], restrictWritesTo: [".plans/**"] },
			}));

			const ctx = createContext();
			await initSession(pi, ctx);
			// No preset activated

			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: "src/anywhere.ts", content: "" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("returns undefined when input.path is missing", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { content: "no path" },
			}, ctx);
			expect(result).toBeUndefined();
		});

		it("resolves absolute paths against cwd", async () => {
			const { pi, ctx } = await setupWithRestriction([".plans/**"]);
			// ctx.cwd is testDir, so resolve(testDir, '.plans/x') should match
			const result = await pi._fire("tool_call", {
				toolName: "write",
				input: { path: join(testDir, ".plans", "plan.md"), content: "" },
			}, ctx);
			expect(result).toBeUndefined();
		});
	});
	// ── keybinding resolution ────────────────────────────────

	describe("keybinding resolution", () => {
		const kbDir = join(tmpdir(), "presets-kb-test-" + process.pid);
		const kbFile = join(kbDir, "keybindings.json");

		beforeEach(() => {
			mkdirSync(kbDir, { recursive: true });
		});
		afterEach(() => {
			rmSync(kbDir, { recursive: true, force: true });
		});

		it("returns default shortcuts when keybindings.json does not exist", () => {
			expect(resolveCycleForwardShortcut(join(kbDir, "nope.json"))).toBe(DEFAULT_CYCLE_FORWARD);
			expect(resolveCycleBackwardShortcut(join(kbDir, "nope.json"))).toBe(DEFAULT_CYCLE_BACKWARD);
		});

		it("returns default shortcuts when key is absent", () => {
			writeFileSync(kbFile, JSON.stringify({ "other.key": "alt+a" }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe(DEFAULT_CYCLE_FORWARD);
			expect(resolveCycleBackwardShortcut(kbFile)).toBe(DEFAULT_CYCLE_BACKWARD);
		});

		it("overrides forward shortcut from keybindings.json", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_FORWARD]: "ctrl+]" }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe("ctrl+]");
		});

		it("overrides backward shortcut from keybindings.json", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_BACKWARD]: "ctrl+[" }));
			expect(resolveCycleBackwardShortcut(kbFile)).toBe("ctrl+[");
		});

		it("normalizes shortcut to lowercase", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_FORWARD]: "  Ctrl+Shift+P  " }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe("ctrl+shift+p");
		});

		it("uses first entry from array value", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_FORWARD]: ["alt+1", "alt+2"] }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe("alt+1");
		});

		it("falls back to default when value is empty string", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_FORWARD]: "  " }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe(DEFAULT_CYCLE_FORWARD);
		});

		it("falls back to default when value is empty array", () => {
			writeFileSync(kbFile, JSON.stringify({ [KB_CYCLE_FORWARD]: [] }));
			expect(resolveCycleForwardShortcut(kbFile)).toBe(DEFAULT_CYCLE_FORWARD);
		});

		it("readKeybinding returns null for missing file", () => {
			expect(readKeybinding("any", join(kbDir, "missing.json"))).toBeNull();
		});

		it("readKeybinding returns null for invalid JSON", () => {
			writeFileSync(kbFile, "not json");
			expect(readKeybinding(KB_CYCLE_FORWARD, kbFile)).toBeNull();
		});
	});
});
