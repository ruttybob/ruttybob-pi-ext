import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockContext } from "../test-helpers/mock-context.js";

// Мокаем spawnChildSession чтобы не спавнить реальный pi-процесс
vi.mock(
	"../../extensions/pi-ralph-wiggum/child-session.js",
	() => ({
		spawnChildSession: vi.fn().mockResolvedValue({
			exitCode: 0,
			output: "iteration output",
			stderr: "",
			complete: false,
			events: [],
		}),
		getPiInvocation: vi.fn().mockReturnValue({
			command: "echo",
			args: [],
		}),
		parseJsonLines: vi.fn().mockReturnValue([]),
	}),
);

// Не используем vi.resetModules() — он ломает модуль-кэш для других тестов.
// Вместо этого каждый тест использует уникальный cwd чтобы избежать конфликтов
// state-файлов между тестами.

describe("ralph-wiggum — registration", () => {
	it("регистрирует /ralph команду", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "ralph",
		);
		expect(cmd).toBeDefined();
	});

	it("регистрирует /ralph-stop команду", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "ralph-stop",
		);
		expect(cmd).toBeDefined();
	});

	it("регистрирует ralph_start tool", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_start",
		);
		expect(tool).toBeDefined();
	});

	it("не регистрирует ralph_done tool", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_done",
		);
		expect(tool).toBeUndefined();
	});

	it("подписывается на session_start", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const handlers = pi._calls.on.filter(
			(h: any) => h.event === "session_start",
		);
		expect(handlers.length).toBeGreaterThan(0);
	});

	it("подписывается на session_shutdown", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const handlers = pi._calls.on.filter(
			(h: any) => h.event === "session_shutdown",
		);
		expect(handlers.length).toBeGreaterThan(0);
	});

	it("не подписывается на before_agent_start", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const handlers = pi._calls.on.filter(
			(h: any) =>
				h.event === "before_agent_start",
		);
		expect(handlers).toHaveLength(0);
	});

	it("не подписывается на agent_end", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const handlers = pi._calls.on.filter(
			(h: any) => h.event === "agent_end",
		);
		expect(handlers).toHaveLength(0);
	});
});

describe("ralph-wiggum — ralph_start tool", () => {
	let mockSpawn: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		// Получить ссылку на мок-функцию
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/child-session.js"
		);
		mockSpawn = mod.spawnChildSession as any;
		mockSpawn.mockReset();
	});

	it("создаёт state, task, progress и reflection файлы и завершает цикл", async () => {
		// Мок: первая итерация завершена, COMPLETE_MARKER найден
		mockSpawn.mockResolvedValueOnce({
			exitCode: 0,
			output: "iteration output with <promise>COMPLETE</promise>",
			stderr: "",
			complete: true,
			events: [],
		});

		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_start",
		);

		const tmpCwd = `/tmp/ralph-test-start-${Date.now()}`;
		const baseCtx = createMockContext({ cwd: tmpCwd });
		const ctx = {
			...baseCtx,
			ui: {
				...baseCtx.ui,
				theme: {
					fg: (_c: string, t: string) => t,
					bold: (t: string) => t,
				},
				setStatus: () => {},
				setWidget: () => {},
			},
		};
		const result = await tool.execute(
			"call-1",
			{
				name: "my-loop",
				taskContent: "# Task\n- [ ] Item 1",
				maxIterations: 10,
			},
			undefined,
			undefined,
			ctx,
		);

		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toContain(
			"RALPH LOOP COMPLETE",
		);
		expect(result.content[0].text).toContain(
			"my-loop",
		);
		// terminate не true — агент делает follow-up
		expect(result.terminate).toBeFalsy();
		// spawnChildSession был вызван ровно 1 раз
		expect(mockSpawn).toHaveBeenCalledTimes(1);
	});

	it("не вызывает sendUserMessage внутри execute", async () => {
		mockSpawn.mockResolvedValueOnce({
			exitCode: 0,
			output: "<promise>COMPLETE</promise>",
			stderr: "",
			complete: true,
			events: [],
		});

		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_start",
		);

		const tmpCwd = `/tmp/ralph-test-no-sum-${Date.now()}`;
		const ctx = createMockContext({ cwd: tmpCwd });
		ctx.ui = {
			...ctx.ui,
			theme: {
				fg: (_c: string, t: string) => t,
				bold: (t: string) => t,
			},
			setStatus: () => {},
			setWidget: () => {},
		};

		await tool.execute(
			"call-2",
			{
				name: "no-sum",
				taskContent: "# Task",
				maxIterations: 5,
			},
			undefined,
			undefined,
			ctx,
		);

		// pi.sendUserMessage НЕ должен был вызываться
		expect(
			pi._calls.sendUserMessage,
		).toHaveLength(0);
	});

	it("прокидывает onUpdate как промежуточный прогресс", async () => {
		// Итерация 1: не complete → iteration++ → maxIterations=1 → stop
		mockSpawn.mockResolvedValueOnce({
			exitCode: 0,
			output: "normal output",
			stderr: "",
			complete: false,
			events: [],
		});

		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_start",
		);

		const tmpCwd = `/tmp/ralph-test-onupdate-${Date.now()}`;
		const ctx = createMockContext({ cwd: tmpCwd });
		ctx.ui = {
			...ctx.ui,
			theme: {
				fg: (_c: string, t: string) => t,
				bold: (t: string) => t,
			},
			setStatus: () => {},
			setWidget: () => {},
		};

		const updates: any[] = [];
		const onUpdate = (update: any) => updates.push(update);

		const result = await tool.execute(
			"call-3",
			{
				name: "onupdate-test",
				taskContent: "# Task",
				maxIterations: 1, // остановится после 1-й итерации
			},
			undefined,
			onUpdate,
			ctx,
		);

		expect(result.terminate).toBeFalsy();
		expect(result.content[0].text).toContain(
			"Max iterations",
		);
	});

	it("прерывается по signal (abort)", async () => {
		// Мок, который бросает aborted-ошибку
		mockSpawn.mockRejectedValueOnce(
			new Error("Child session was aborted"),
		);

		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const tool = pi._calls.registerTool.find(
			(t: any) => t.name === "ralph_start",
		);

		const tmpCwd = `/tmp/ralph-test-abort-${Date.now()}`;
		const ctx = createMockContext({ cwd: tmpCwd });
		ctx.ui = {
			...ctx.ui,
			theme: {
				fg: (_c: string, t: string) => t,
				bold: (t: string) => t,
			},
			setStatus: () => {},
			setWidget: () => {},
		};

		const result = await tool.execute(
			"call-4",
			{
				name: "abort-test",
				taskContent: "# Task",
				maxIterations: 10,
			},
			undefined,
			undefined,
			ctx,
		);

		expect(result.content[0].text).toContain(
			"interrupted",
		);
		expect(result.details.status).toBe("paused");
	});
});

describe("ralph-wiggum — /ralph command", () => {
	it("показывает help для неизвестной подкоманды", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import(
			"../../extensions/pi-ralph-wiggum/index.js"
		);
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "ralph",
		);

		const notifyMock = vi.fn();
		const ctx = createMockContext({
			ui: {
				...createMockContext().ui,
				notify: notifyMock,
			},
		});

		await cmd.options.handler("unknown-cmd", ctx);

		expect(notifyMock).toHaveBeenCalled();
		const [msg] = notifyMock.mock.calls[0];
		expect(msg).toContain("Ralph Wiggum");
	});
});
