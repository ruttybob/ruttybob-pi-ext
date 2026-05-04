import { describe, it, expect, vi, beforeEach } from "vitest";
import piAutoRename from "../../extensions/pi-auto-rename/index.js";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockCommandContext } from "../test-helpers/mock-context.js";

// Мокаем shared fs чтобы не писать реальный конфиг
vi.mock("../../extensions/shared/fs.js", () => ({
	tryRead: vi.fn(async () => undefined),
	readJsonFile: vi.fn(async () => null),
	atomicWrite: vi.fn(async () => {}),
	fileExists: vi.fn(async () => false),
	ensureDir: vi.fn(async () => {}),
}));

vi.mock("node:os", () => ({
	homedir: () => "/tmp/test-home",
}));

describe("pi-auto-rename extension", () => {
	let api: ReturnType<typeof createMockExtensionAPI>;

	beforeEach(() => {
		api = createMockExtensionAPI();
	});

	it("регистрирует команду /rename", () => {
		piAutoRename(api);
		expect(api._calls.registerCommand).toHaveLength(1);
		expect(api._calls.registerCommand[0].name).toBe("rename");
	});

	it("подписывается на session lifecycle events", () => {
		piAutoRename(api);
		const events = api._calls.on.map((c: any) => c.event);
		expect(events).toContain("session_start");
		expect(events).toContain("message_end");
		expect(events).toContain("agent_end");
	});

	describe("/rename handler", () => {
		let handler: Function;

		beforeEach(() => {
			api = createMockExtensionAPI();
			piAutoRename(api);
			const cmd = api._calls.registerCommand[0];
			handler = cmd.options.handler;
		});

		it("показывает help", async () => {
			const ctx = createMockCommandContext();
			(ctx.ui.notify as any) = vi.fn();
			await handler("help", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Usage"),
				"info",
			);
		});

		it("включает auto-rename (/rename on)", async () => {
			const ctx = createMockCommandContext();
			(ctx.ui.notify as any) = vi.fn();
			await handler("on", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("enabled"),
				"info",
			);
		});

		it("выключает auto-rename (/rename off)", async () => {
			const ctx = createMockCommandContext();
			(ctx.ui.notify as any) = vi.fn();
			await handler("off", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("disabled"),
				"info",
			);
		});

		it("показывает статус (/rename show)", async () => {
			const ctx = createMockCommandContext();
			(ctx.ui.notify as any) = vi.fn();
			await handler("show", ctx);
			const call = (ctx.ui.notify as any).mock.calls[0];
			expect(call[0]).toContain("anthropic/claude-haiku-4-5");
			expect(call[0]).toContain("on");
		});

		it("показывает неизвестную подкоманду", async () => {
			const ctx = createMockCommandContext();
			(ctx.ui.notify as any) = vi.fn();
			await handler("unknown", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Usage"),
				"warning",
			);
		});
	});
});
