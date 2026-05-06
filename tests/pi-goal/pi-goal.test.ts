import { describe, it, expect } from "vitest";
import {
	CONTINUATION_MESSAGE_TYPE,
	createGoal,
	createGoalExtension,
	extractTokenUsage,
	formatGoalStatus,
	goalResponse,
	parseGoalArgs,
	readLatestGoalFromBranch,
	renderContinuationPrompt,
	shouldScheduleContinuation,
	transitionGoal,
	type ContextMessage,
	type ExtensionApi,
	type ExtensionCommandContext,
	type GoalState,
	type GoalLogger,
	type SessionEntry,
	type TextToolResult,
} from "../../extensions/pi-goal/index.ts";

type CommandHandler = {
	description?: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
};

type Handler = (event: Record<string, unknown>, ctx: ExtensionCommandContext) => unknown | Promise<unknown>;
type FakeTool = {
	name: string;
	execute(toolCallId: string, params: Record<string, unknown>): Promise<TextToolResult<unknown>>;
};
type FakeMessage = {
	customType: string;
	content: string | unknown[];
	display: boolean;
	details?: unknown;
};
type FakeSendOptions = { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" };
type NotifyLevel = "info" | "warning" | "error";
type CapturedLog = { level: "debug" | "info" | "warn" | "error"; message: string; data: Record<string, unknown> };

interface FakePi {
	pi: ExtensionApi;
	ctx: ExtensionCommandContext;
	commands: Map<string, CommandHandler>;
	tools: Map<string, FakeTool>;
	handlers: Map<string, Handler[]>;
	entries: SessionEntry[];
	branchEntries: SessionEntry[];
	sentUserMessages: Array<{ content: string | unknown[]; options?: { deliverAs?: "steer" | "followUp" } }>;
	sentMessages: Array<{
		message: { customType: string; content: string; display: boolean; details?: { goalId: string } };
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" };
	}>;
	notifications: Array<{ message: string; level: "info" | "warning" | "error" }>;
	operations: string[];
	setIdle(idle: boolean): void;
	emit(event: string, payload: Record<string, unknown>): Promise<unknown[]>;
}

function createFakePi(): FakePi {
	const commands = new Map<string, CommandHandler>();
	const tools = new Map<string, FakeTool>();
	const handlers = new Map<string, Handler[]>();
	const entries: SessionEntry[] = [];
	const sentUserMessages: FakePi["sentUserMessages"] = [];
	const sentMessages: FakePi["sentMessages"] = [];
	const notifications: FakePi["notifications"] = [];
	const branchEntries: SessionEntry[] = [];
	const operations: string[] = [];
	let idle = true;

	const pi = {
		appendEntry(customType: string, data?: unknown) {
			const entry = { type: "custom", customType, data };
			entries.push(entry);
			branchEntries.push(entry);
			operations.push(`append:${customType}`);
		},
		registerCommand(name: string, options: CommandHandler) {
			commands.set(name, options);
		},
		registerTool(tool: { name: string }) {
			tools.set(tool.name, tool as unknown as FakeTool);
		},
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		sendMessage(message: FakeMessage, options?: FakeSendOptions) {
			const content = message.content;
			if (typeof content !== "string") {
				throw new TypeError("expected fake continuation message content to be a string");
			}
			const sentMessage: FakePi["sentMessages"][number]["message"] = {
				customType: message.customType,
				content,
				display: message.display,
			};
			if (message.details) {
				sentMessage.details = message.details as unknown as { goalId: string };
			}
			const sent: FakePi["sentMessages"][number] = { message: sentMessage };
			if (options) {
				sent.options = options;
			}
			sentMessages.push(sent);
		},
		sendUserMessage(content: string | unknown[], options?: { deliverAs?: "steer" | "followUp" }) {
			const sent: FakePi["sentUserMessages"][number] = { content };
			if (options) {
				sent.options = options;
			}
			sentUserMessages.push(sent);
			operations.push("sendUserMessage");
		},
	} as unknown as ExtensionApi;

	const ctx = {
		sessionManager: {
			getBranch() {
				return branchEntries;
			},
		},
		ui: {
			notify(message: string, level: NotifyLevel = "info") {
				notifications.push({ message, level });
				operations.push("notify");
			},
		},
		isIdle() {
			return idle;
		},
	} as unknown as ExtensionCommandContext;

	return {
		pi,
		ctx,
		commands,
		tools,
		handlers,
		entries,
		branchEntries,
		sentUserMessages,
		sentMessages,
		notifications,
		operations,
		setIdle(nextIdle) {
			idle = nextIdle;
		},
		async emit(event, payload) {
			const results: unknown[] = [];
			for (const handler of handlers.get(event) ?? []) {
				results.push(await handler({ type: event, ...payload }, ctx));
			}
			return results;
		},
	};
}

function latestGoal(fake: FakePi): GoalState {
	const data = fake.entries.at(-1)?.data;
	expect(data).toBeTruthy();
	return data as GoalState;
}

function resultText(result: { content: Array<{ type: "text"; text: string }> }): string {
	const first = result.content[0];
	expect(first).toBeTruthy();
	return first.text;
}

function createCapturingLogger(logs: CapturedLog[]): GoalLogger {
	const capture =
		(level: CapturedLog["level"]) =>
		(data: Record<string, unknown>, message?: string): void => {
			logs.push({ level, message: message ?? "", data });
		};
	return {
		debug: capture("debug"),
		info: capture("info"),
		warn: capture("warn"),
		error: capture("error"),
	} as GoalLogger;
}

function messagesFor(logs: CapturedLog[], message: string): CapturedLog[] {
	return logs.filter((log) => log.message === message);
}

function firstSentMessage(fake: FakePi): FakePi["sentMessages"][number] {
	const sent = fake.sentMessages[0];
	expect(sent).toBeTruthy();
	return sent;
}

function firstContextMessage(result: { messages: ContextMessage[] }): ContextMessage {
	const message = result.messages[0];
	expect(message).toBeTruthy();
	return message;
}

describe("pi-goal", () => {
	it("goal creation normalizes objective and budget", () => {
		const goal = createGoal("  Ship the thing  ", "1000");
		expect(goal.objective).toBe("Ship the thing");
		expect(goal.status).toBe("active");
		expect(goal.tokenBudget).toBe(1000);
		expect(goal.tokensUsed).toBe(0);
		expect(goal.lastContinuationHadToolCall).toBe(true);
	});

	it("goal parser handles commands and budgets", () => {
		expect(parseGoalArgs("status")).toEqual({ action: "status" });
		expect(parseGoalArgs("pause")).toEqual({ action: "pause" });
		expect(parseGoalArgs("Do work --budget=42")).toEqual({
			action: "create",
			objective: "Do work",
			tokenBudget: 42,
			rest: ["work", "--budget=42"],
		});
		expect(parseGoalArgs("Do work --budget 42")).toEqual({
			action: "create",
			objective: "Do work",
			tokenBudget: 42,
			rest: ["work", "--budget", "42"],
		});
	});

	it("model tools enforce create and complete restrictions", async () => {
		const fake = createFakePi();
		createGoalExtension().register(fake.pi);

		const createTool = fake.tools.get("create_goal");
		const updateTool = fake.tools.get("update_goal");
		const getTool = fake.tools.get("get_goal");
		expect(createTool).toBeTruthy();
		expect(updateTool).toBeTruthy();
		expect(getTool).toBeTruthy();

		const created = await createTool!.execute("call-1", { objective: "Research Pi goals", token_budget: 50 });
		expect(resultText(created)).toMatch(/Research Pi goals/);

		const duplicate = await createTool!.execute("call-2", { objective: "Replace it" });
		expect(resultText(duplicate)).toMatch(/already has a goal/);

		const rejected = await updateTool!.execute("call-3", { status: "paused" });
		expect(resultText(rejected)).toMatch(/only mark the existing goal complete/);

		const completed = await updateTool!.execute("call-4", { status: "complete" });
		expect(resultText(completed)).toMatch(/completionBudgetReport/);

		const read = await getTool!.execute("call-5", {});
		expect(resultText(read)).toMatch(/"status": "complete"/);
	});

	it("model tools return controlled errors for invalid mutations", async () => {
		const fake = createFakePi();
		createGoalExtension().register(fake.pi);

		const createTool = fake.tools.get("create_goal");
		const updateTool = fake.tools.get("update_goal");
		expect(createTool).toBeTruthy();
		expect(updateTool).toBeTruthy();

		await expect(() => createTool!.execute("call-1", { objective: "   " })).rejects.toThrow(/goal objective is required/);
		await expect(() =>
			createTool!.execute("call-2", { objective: "Bad budget", token_budget: 0 }),
		).rejects.toThrow(/token budget must be a positive number/);

		const noGoalComplete = await updateTool!.execute("call-3", { status: "complete" });
		expect(resultText(noGoalComplete)).toMatch(/does not have an active or paused goal/);
		expect(fake.entries.length).toBe(0);
	});

	it("user command persists create, pause, resume, clear transitions", async () => {
		const fake = createFakePi();
		createGoalExtension().register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		expect(goalCommand).toBeTruthy();

		await goalCommand!.handler("Implement loop --budget 100", fake.ctx);
		expect(latestGoal(fake).status).toBe("active");
		expect(latestGoal(fake).tokenBudget).toBe(100);

		await goalCommand!.handler("pause", fake.ctx);
		expect(latestGoal(fake).status).toBe("paused");

		await goalCommand!.handler("resume", fake.ctx);
		expect(latestGoal(fake).status).toBe("active");

		await goalCommand!.handler("status", fake.ctx);
		expect(fake.notifications.at(-1)?.message ?? "").toMatch(/Tokens remaining/);

		await goalCommand!.handler("clear", fake.ctx);
		expect(latestGoal(fake).status).toBe("cleared");
	});

	it("user command auto-submits the objective after persisting a new goal", async () => {
		const fake = createFakePi();
		createGoalExtension().register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		expect(goalCommand).toBeTruthy();

		await goalCommand!.handler("Implement loop --budget 100", fake.ctx);

		expect(latestGoal(fake).objective).toBe("Implement loop");
		expect(fake.sentUserMessages).toEqual([{ content: "Implement loop" }]);
		expect(fake.operations.slice(0, 2)).toEqual(["append:pi-goal-state", "sendUserMessage"]);
	});

	it("user command traces persisted goal and objective auto-submit", async () => {
		const logs: CapturedLog[] = [];
		const fake = createFakePi();
		createGoalExtension({ logger: createCapturingLogger(logs) }).register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		expect(goalCommand).toBeTruthy();

		await goalCommand!.handler("Trace this --budget 100", fake.ctx);

		expect(messagesFor(logs, "pi-goal state changed").length).toBe(1);
		expect(messagesFor(logs, "pi-goal auto-submitting created objective").length).toBe(1);
		expect(messagesFor(logs, "pi-goal auto-submitting created objective")[0]?.data.delivery).toBe("immediate");
		expect(messagesFor(logs, "pi-goal auto-submitting created objective")[0]?.data.objectiveLength).toBe("Trace this".length);
	});

	it("user command queues the auto-submitted objective when the agent is busy", async () => {
		const fake = createFakePi();
		fake.setIdle(false);
		createGoalExtension().register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		expect(goalCommand).toBeTruthy();

		await goalCommand!.handler("Continue after current turn", fake.ctx);

		expect(fake.sentUserMessages).toEqual([{ content: "Continue after current turn", options: { deliverAs: "followUp" } }]);
	});

	it("user command does not auto-submit rejected duplicate goals", async () => {
		const fake = createFakePi();
		createGoalExtension().register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		expect(goalCommand).toBeTruthy();

		await goalCommand!.handler("First goal", fake.ctx);
		await goalCommand!.handler("Second goal", fake.ctx);

		expect(latestGoal(fake).objective).toBe("First goal");
		expect(fake.sentUserMessages.map((message) => message.content)).toEqual(["First goal"]);
	});

	it("clearing a goal removes get_goal state and prevents continuation", async () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn) });
		extension.register(fake.pi);
		const goalCommand = fake.commands.get("goal");
		const getTool = fake.tools.get("get_goal");
		expect(goalCommand).toBeTruthy();
		expect(getTool).toBeTruthy();

		await goalCommand!.handler("Implement then clear", fake.ctx);
		await goalCommand!.handler("clear", fake.ctx);

		const read = await getTool!.execute("call-1", {});
		expect(resultText(read)).toMatch(/"goal": null/);
		expect(extension.scheduleContinuation(fake.pi)).toBe(false);
		expect(scheduled.length).toBe(0);
	});

	it("continuation prompt escapes objective and requires audit", () => {
		const prompt = renderContinuationPrompt({
			...createGoal("<do>&verify"),
			tokenBudget: 100,
			tokensUsed: 25,
			timeUsedSeconds: 7,
		});
		expect(prompt).toMatch(/&lt;do&gt;&amp;verify/);
		expect(prompt).toMatch(/not a new human\/user message/);
		expect(prompt).toMatch(/completion audit/);
		expect(prompt).toMatch(/Tokens remaining: 75/);
		expect(prompt).toMatch(/call update_goal with status "complete"/);
	});

	it("continuation scheduling sends hidden trigger-turn message after deferral", () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Keep going", 1000));

		const scheduledNow = extension.scheduleContinuation(fake.pi);
		expect(scheduledNow).toBe(true);
		expect(fake.sentMessages.length).toBe(0);
		expect(latestGoal(fake).continuationScheduled).toBe(true);

		const runScheduled = scheduled.shift();
		expect(runScheduled).toBeTruthy();
		runScheduled!();
		expect(fake.sentMessages.length).toBe(1);
		expect(firstSentMessage(fake).message.customType).toBe(CONTINUATION_MESSAGE_TYPE);
		expect(firstSentMessage(fake).message.display).toBe(false);
		expect(firstSentMessage(fake).options).toEqual({ triggerTurn: true });
	});

	it("continuation scheduling traces schedule and hidden trigger send", () => {
		const logs: CapturedLog[] = [];
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn), logger: createCapturingLogger(logs) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Trace continuation", 1000));

		expect(extension.scheduleContinuation(fake.pi)).toBe(true);
		const runScheduled = scheduled.shift();
		expect(runScheduled).toBeTruthy();
		runScheduled!();

		expect(messagesFor(logs, "pi-goal continuation scheduled").length).toBe(1);
		expect(messagesFor(logs, "pi-goal sending hidden continuation trigger").length).toBe(1);
		expect(messagesFor(logs, "pi-goal sending hidden continuation trigger")[0]?.data.continuationCount).toBe(1);
		expect(firstSentMessage(fake).message.display).toBe(false);
		expect(firstSentMessage(fake).options).toEqual({ triggerTurn: true });
	});

	it("continuation suppression decision is traced with reason", async () => {
		const logs: CapturedLog[] = [];
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn), logger: createCapturingLogger(logs) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Trace plan mode", 1000));

		await fake.emit("before_agent_start", { prompt: "[PLAN MODE ACTIVE] inspect only" });

		expect(extension.scheduleContinuation(fake.pi)).toBe(false);
		expect(messagesFor(logs, "pi-goal continuation not scheduled")[0]?.data.reason).toBe("plan_mode");
		expect(scheduled.length).toBe(0);
	});

	it("continuation scheduling is idempotent while a continuation is pending", () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Only schedule once", 1000));

		expect(extension.scheduleContinuation(fake.pi)).toBe(true);
		expect(extension.scheduleContinuation(fake.pi)).toBe(false);
		expect(scheduled.length).toBe(1);

		const runScheduled = scheduled.shift();
		expect(runScheduled).toBeTruthy();
		runScheduled!();
		expect(fake.sentMessages.length).toBe(1);
	});

	it("turn accounting tracks tools, tokens, elapsed time, and budget limit", async () => {
		let currentTime = 1_000;
		const fake = createFakePi();
		const extension = createGoalExtension({ clock: () => currentTime });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Budgeted", 10));

		await fake.emit("turn_start", { turnIndex: 1, timestamp: 1_000 });
		currentTime = 4_000;
		await fake.emit("tool_execution_end", { toolCallId: "t1", toolName: "read", result: {}, isError: false });
		await fake.emit("turn_end", {
			turnIndex: 1,
			message: { role: "assistant", content: [], usage: { input: 3, output: 4, reasoning: 5 } },
			toolResults: [],
		});

		const latest = latestGoal(fake);
		expect(latest.tokensUsed).toBe(12);
		expect(latest.timeUsedSeconds).toBe(3);
		expect(latest.status).toBe("budget_limited");
	});

	it("turn accounting tracks detailed usage, costs, turns, and model breakdowns", async () => {
		let currentTime = 1_000;
		const fake = createFakePi();
		const extension = createGoalExtension({ clock: () => currentTime });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Detailed accounting", 100_000));

		await fake.emit("turn_start", { turnIndex: 1, timestamp: 1_000 });
		currentTime = 124_000;
		await fake.emit("turn_end", {
			turnIndex: 1,
			message: {
				role: "assistant",
				provider: "openai-codex",
				model: "gpt-5.4-mini",
				content: [],
				usage: {
					input: 1_000,
					output: 200,
					cacheRead: 700,
					cacheWrite: 50,
					totalTokens: 1_950,
					cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0.004, total: 0.037 },
				},
			},
			toolResults: [],
		});

		const latest = latestGoal(fake);
		expect(latest.tokensUsed).toBe(1_950);
		expect(latest.turnCount).toBe(1);
		expect(latest.timeUsedSeconds).toBe(123);
		expect(latest.usage).toEqual({
			input: 1_000,
			output: 200,
			reasoning: 0,
			cacheRead: 700,
			cacheWrite: 50,
			total: 1_950,
			cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0.004, total: 0.037 },
		});
		expect(latest.usageByModel["openai-codex/gpt-5.4-mini"]?.total).toBe(1_950);

		const status = formatGoalStatus(latest);
		expect(status).toMatch(/Time used: 2m 3s \(123 seconds\)/);
		expect(status).toMatch(/Turns: 1/);
		expect(status).toMatch(/Tokens used: 1,950 total/);
		expect(status).toMatch(/input: 1,000/);
		expect(status).toMatch(/cache read: 700/);
		expect(status).toMatch(/Cost: \$0\.037000/);
		expect(status).toMatch(/openai-codex\/gpt-5\.4-mini: 1,950 total/);
	});

	it("continuation scheduling counts hidden goal reinstructions", () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Count continuation prompts", 1000));

		expect(extension.scheduleContinuation(fake.pi)).toBe(true);
		const runScheduled = scheduled.shift();
		expect(runScheduled).toBeTruthy();
		runScheduled!();

		expect(latestGoal(fake).continuationCount).toBe(1);
		expect(formatGoalStatus(latestGoal(fake))).toMatch(/Goal instructions: 1/);
	});

	it("no-tool continuation suppresses future automatic continuation", async () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn), clock: () => 1_000 });
		extension.register(fake.pi);
		const goal = createGoal("Avoid loops", 1000);
		extension.setGoalForTest(goal);

		extension.scheduleContinuation(fake.pi);
		const runScheduled = scheduled.shift();
		expect(runScheduled).toBeTruthy();
		runScheduled!();
		await fake.emit("turn_start", { turnIndex: 1, timestamp: 1_000 });
		await fake.emit("turn_end", {
			turnIndex: 1,
			message: { role: "assistant", content: [], usage: { total: 1 } },
			toolResults: [],
		});

		expect(latestGoal(fake).continuationSuppressed).toBe(true);
		expect(shouldScheduleContinuation(latestGoal(fake))).toBe(false);
	});

	it("user input resets no-tool continuation suppression", async () => {
		const fake = createFakePi();
		const extension = createGoalExtension({ clock: () => 1_000 });
		extension.register(fake.pi);
		const suppressedGoal = {
			...createGoal("Reset suppression", 1000),
			continuationSuppressed: true,
			lastContinuationHadToolCall: false,
		};
		extension.setGoalForTest(suppressedGoal);

		await fake.emit("input", { text: "continue", source: "interactive" });

		const current = extension.currentGoal;
		expect(current).toBeTruthy();
		expect(current!.continuationSuppressed).toBe(false);
		expect(current!.lastContinuationHadToolCall).toBe(true);
		expect(shouldScheduleContinuation(current!)).toBe(true);
	});

	it("plan mode suppresses automatic continuation until a normal prompt arrives", async () => {
		const scheduled: Array<() => void> = [];
		const fake = createFakePi();
		const extension = createGoalExtension({ scheduler: (fn) => scheduled.push(fn) });
		extension.register(fake.pi);
		extension.setGoalForTest(createGoal("Respect plan mode", 1000));

		await fake.emit("before_agent_start", { prompt: "[PLAN MODE ACTIVE] inspect only" });
		expect(extension.scheduleContinuation(fake.pi)).toBe(false);

		await fake.emit("before_agent_start", { prompt: "implement now" });
		expect(extension.scheduleContinuation(fake.pi)).toBe(true);
		expect(scheduled.length).toBe(1);
	});

	it("context hook prunes stale continuation messages", async () => {
		const fake = createFakePi();
		const extension = createGoalExtension();
		extension.register(fake.pi);
		const active = createGoal("Active");
		extension.setGoalForTest(active);

		let result: { messages: ContextMessage[] } | undefined;
		for (const handler of fake.handlers.get("context") ?? []) {
			result = (await handler(
				{
					type: "context",
					messages: [
						{ role: "custom", customType: CONTINUATION_MESSAGE_TYPE, details: { goalId: active.goalId } },
						{ role: "custom", customType: CONTINUATION_MESSAGE_TYPE, details: { goalId: "old" } },
						{ role: "user", content: [{ type: "text", text: "hello" }] },
					],
				},
				fake.ctx,
			)) as { messages: ContextMessage[] };
		}

		expect(result).toBeTruthy();
		expect(result!.messages.length).toBe(2);
		expect(firstContextMessage(result!).details?.goalId).toBe(active.goalId);
	});

	it("context hook prunes continuation messages for cleared goals", async () => {
		const fake = createFakePi();
		const extension = createGoalExtension();
		extension.register(fake.pi);
		const cleared = transitionGoal(createGoal("Cleared"), "cleared");
		extension.setGoalForTest(cleared);

		let result: { messages: ContextMessage[] } | undefined;
		for (const handler of fake.handlers.get("context") ?? []) {
			result = (await handler(
				{
					type: "context",
					messages: [
						{ role: "custom", customType: CONTINUATION_MESSAGE_TYPE, details: { goalId: cleared.goalId } },
						{ role: "user", content: [{ type: "text", text: "hello" }] },
					],
				},
				fake.ctx,
			)) as { messages: ContextMessage[] };
		}

		expect(result).toBeTruthy();
		expect(result!.messages.length).toBe(1);
		expect(result!.messages[0]?.customType).toBe(undefined);
	});

	it("restores latest goal from custom branch entries", () => {
		const first = createGoal("First");
		const second = transitionGoal(createGoal("Second"), "paused");
		const restored = readLatestGoalFromBranch([
			{ type: "custom", customType: "other", data: first },
			{ type: "custom", customType: "pi-goal-state", data: first },
			{ type: "custom", customType: "pi-goal-state", data: second },
		]);
		expect(restored?.objective).toBe("Second");
		expect(restored?.status).toBe("paused");
	});

	it("usage extraction supports common provider shapes", () => {
		expect(extractTokenUsage({ usage: { total: 9 } })).toBe(9);
		expect(extractTokenUsage({ usage: { inputTokens: 2, outputTokens: 3, reasoningTokens: 4 } })).toBe(9);
		expect(extractTokenUsage({ tokens: { input: 2, output: 3 } })).toBe(5);
		expect(extractTokenUsage({ usage: { totalTokens: 9, cacheRead: 4, cacheWrite: 1 } })).toBe(9);
		expect(extractTokenUsage({})).toBe(0);
	});

	it("goal response includes final budget report only on completion", () => {
		const active = createGoal("Report", 10);
		expect(goalResponse(active).completionBudgetReport).toBe(undefined);
		const complete = transitionGoal({ ...active, tokensUsed: 7, timeUsedSeconds: 2 }, "complete");
		expect(goalResponse(complete).completionBudgetReport ?? "").toMatch(/tokens used: 7 of 10; time used: 2s/);
	});
});
