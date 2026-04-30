import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockContext } from "../test-helpers/mock-context.js";

describe("system-prompt-template", () => {
	async function setup() {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/system-prompt-template/index.js");
		mod.default(pi);
		return { pi };
	}

	describe("registration", () => {
		it("registers the /reppi command", async () => {
			const { pi } = await setup();
			const cmds = pi._calls.registerCommand;
			expect(cmds.some((c: any) => c.name === "reppi")).toBe(true);
		});

		it("registers a before_agent_start event handler", async () => {
			const { pi } = await setup();
			const handlers = pi._calls.on.filter((h: any) => h.event === "before_agent_start");
			expect(handlers.length).toBeGreaterThan(0);
		});
	});

	describe("before_agent_start handler", () => {
		it("returns undefined when state is disabled", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: false } },
					],
				},
			} as any);

			const event = { systemPrompt: "original prompt", systemPromptOptions: {} };
			const result = await pi._fire("before_agent_start", event, ctx);
			expect(result).toBeUndefined();
		});

		it("returns undefined when no template is found", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [],
				},
			} as any);

			const event = { systemPrompt: "original prompt", systemPromptOptions: {} };
			const result = await pi._fire("before_agent_start", event, ctx);
			expect(result).toBeUndefined();
		});

		it("resolves template from branch entry when state is enabled", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: true } },
						{ type: "custom", customType: "reppi", data: "Hello {{cwd}}" },
					],
				},
			} as any);

			const event = { systemPrompt: "original prompt", systemPromptOptions: {} };
			const result = await pi._fire("before_agent_start", event, ctx);
			expect(result).toBeDefined();
			expect(result.systemPrompt).toContain("Current date:");
			expect(result.systemPrompt).toContain("Current working directory:");
		});

		it("substitutes {{tools}} from event data", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: true } },
						{ type: "custom", customType: "reppi", data: "Tools: {{tools}}" },
					],
				},
			} as any);

			pi.getActiveTools = () => ["read", "bash"];
			const event = {
				systemPrompt: "original",
				systemPromptOptions: {
					selectedTools: ["read", "bash"],
					toolSnippets: { read: "Read files", bash: "Run commands" },
				},
			};
			const result = await pi._fire("before_agent_start", event, ctx);
			expect(result.systemPrompt).toContain("read:");
			expect(result.systemPrompt).toContain("bash:");
		});

		it("handles {{#if var}}...{{/if}} conditional blocks", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: true } },
						{ type: "custom", customType: "reppi", data: "Hello{{#if tools}}\nTools: {{tools}}{{/if}}" },
					],
				},
			} as any);

			// With tools present
			const event1 = {
				systemPrompt: "original",
				systemPromptOptions: {
					selectedTools: ["read"],
					toolSnippets: { read: "Read files" },
				},
			};
			const result1 = await pi._fire("before_agent_start", event1, ctx);
			expect(result1.systemPrompt).toContain("Tools:");

			// Without tools
			const event2 = {
				systemPrompt: "original",
				systemPromptOptions: { selectedTools: [] },
			};
			const result2 = await pi._fire("before_agent_start", event2, ctx);
			// {{tools}} will be "(none)" when no tools, but {{#if tools}} checks trim
			// "(none)" is non-empty, so the block should still appear
			expect(result2.systemPrompt).toContain("Tools:");
		});

		it("removes {{#if var}} block when variable is empty", async () => {
			const { pi } = await setup();
			const ctx = createMockContext({
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: true } },
						{ type: "custom", customType: "reppi", data: "Hello{{#if tool_guidelines}}\nGuidelines here{{/if}} end" },
					],
				},
			} as any);

			const event = {
				systemPrompt: "original",
				systemPromptOptions: { promptGuidelines: [] },
			};
			const result = await pi._fire("before_agent_start", event, ctx);
			expect(result.systemPrompt).not.toContain("Guidelines here");
			expect(result.systemPrompt).toContain("Hello");
			expect(result.systemPrompt).toContain("end");
		});
	});

	describe("/reppi command", () => {
		it("status subcommand notifies when disabled", async () => {
			const { pi } = await setup();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [
						{ type: "custom", customType: "reppi-state", data: { enabled: false } },
					],
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("status", ctx);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("disabled"), "info");
		});

		it("status subcommand notifies when no template found", async () => {
			const { pi } = await setup();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [],
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("status", ctx);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("none"), "info");
		});

		it("show subcommand warns when no template found", async () => {
			const { pi } = await setup();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [],
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("show", ctx);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("No REPPI template"), "warning");
		});

		it("unknown subcommand shows usage help", async () => {
			const { pi } = await setup();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("unknown-arg", ctx);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "info");
		});

		it("on subcommand calls addCustomEntry with enabled=true", async () => {
			const { pi } = await setup();
			const addCustomEntry = vi.fn();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					addCustomEntry,
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("on", ctx);
			expect(addCustomEntry).toHaveBeenCalledWith("reppi-state", { enabled: true });
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("enabled"), "info");
		});

		it("off subcommand calls addCustomEntry with enabled=false", async () => {
			const { pi } = await setup();
			const addCustomEntry = vi.fn();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					addCustomEntry,
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("off", ctx);
			expect(addCustomEntry).toHaveBeenCalledWith("reppi-state", { enabled: false });
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("disabled"), "info");
		});

		it("default (no args) is treated as status", async () => {
			const { pi } = await setup();
			const notify = vi.fn();
			const ctx = createMockContext({
				ui: { ...createMockContext().ui, notify },
				sessionManager: {
					...createMockContext().sessionManager,
					getBranch: () => [],
				},
			} as any);

			const cmd = pi._calls.registerCommand.find((c: any) => c.name === "reppi");
			await cmd.options.handler("", ctx);
			// Default is 'status', should show info
			expect(notify).toHaveBeenCalled();
		});
	});
});
