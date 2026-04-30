import { describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockCommandContext } from "../test-helpers/mock-context.js";

vi.mock("@mariozechner/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mariozechner/pi-coding-agent")>();
	return {
		...actual,
		SessionManager: {
			forkFrom: vi.fn().mockReturnValue({
				getSessionFile: () => "/tmp/forked-session.jsonl",
			}),
		},
	};
});

vi.mock("node:fs", () => ({
	unlinkSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

describe("fork-to-back — fork-to.ts", () => {
	async function setupForkTo() {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/fork-to-back/fork-to.js");
		mod.default(pi);
		return { pi };
	}

	it("registers /fork-to command", async () => {
		const { pi } = await setupForkTo();
		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-to");
		expect(cmd).toBeDefined();
		expect(cmd!.options.description).toContain("Copy");
	});

	it("shows error when no args provided", async () => {
		const { pi } = await setupForkTo();
		const notify = vi.fn();
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify },
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-to");
		await cmd.options.handler("", ctx);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "error");
	});

	it("shows error when session is ephemeral (no file)", async () => {
		const { pi } = await setupForkTo();
		const notify = vi.fn();
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify },
			sessionManager: {
				...createMockCommandContext().sessionManager,
				getSessionFile: () => null,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-to");
		await cmd.options.handler("~/target", ctx);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("ephemeral"),
			"error",
		);
	});

	it("does not fork when user cancels confirm", async () => {
		const { pi } = await setupForkTo();
		const notify = vi.fn();
		const confirm = vi.fn().mockResolvedValue(false);
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify, confirm },
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-to");
		await cmd.options.handler("~/target", ctx);
		// Should not call notify with success message
		expect(notify).not.toHaveBeenCalled();
	});
});

describe("fork-to-back — fork-back.ts", () => {
	async function setupForkBack() {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/fork-to-back/fork-back.js");
		mod.default(pi);
		return { pi };
	}

	it("registers /fork-back command", async () => {
		const { pi } = await setupForkBack();
		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		expect(cmd).toBeDefined();
		expect(cmd!.options.description).toContain("parent");
	});

	it("shows error when no parent session", async () => {
		const { pi } = await setupForkBack();
		const notify = vi.fn();
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify },
			sessionManager: {
				...createMockCommandContext().sessionManager,
				getHeader: () => ({}),
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		await cmd.options.handler("", ctx);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("No parent"),
			"error",
		);
	});

	it("shows error when session is ephemeral (no file)", async () => {
		const { pi } = await setupForkBack();
		const notify = vi.fn();
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify },
			sessionManager: {
				...createMockCommandContext().sessionManager,
				getHeader: () => ({ parentSession: "/parent.jsonl" }),
				getSessionFile: () => null,
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		await cmd.options.handler("", ctx);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("ephemeral"),
			"error",
		);
	});

	it("does not go back when user cancels confirm", async () => {
		const { pi } = await setupForkBack();
		const notify = vi.fn();
		const confirm = vi.fn().mockResolvedValue(false);
		const ctx = createMockCommandContext({
			ui: { ...createMockCommandContext().ui, notify, confirm },
			sessionManager: {
				...createMockCommandContext().sessionManager,
				getHeader: () => ({ parentSession: "/parent.jsonl" }),
			},
		} as any);

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		await cmd.options.handler("", ctx);
		expect(notify).not.toHaveBeenCalled();
	});

	it("switches to parent session and deletes fork on confirm", async () => {
		const { unlinkSync } = await import("node:fs");
		const { pi } = await setupForkBack();
		const notify = vi.fn();
		const confirm = vi.fn().mockResolvedValue(true);
		const switchSession = vi.fn().mockImplementation(async (_path: string, opts: any) => {
			await opts.withSession({ ui: { notify } });
		});

		const baseCtx = createMockCommandContext();
		const ctx = {
			...baseCtx,
			ui: { ...baseCtx.ui, notify, confirm },
			sessionManager: {
				...baseCtx.sessionManager,
				getHeader: () => ({ parentSession: "/parent.jsonl" }),
				getSessionFile: () => "/tmp/current-fork.jsonl",
			},
			switchSession,
		} as any;

		const cmd = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		await cmd.options.handler("", ctx);

		expect(switchSession).toHaveBeenCalledWith("/parent.jsonl", expect.any(Object));
		expect(unlinkSync).toHaveBeenCalledWith("/tmp/current-fork.jsonl");
	});
});
