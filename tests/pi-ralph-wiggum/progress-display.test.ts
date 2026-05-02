import { describe, expect, it } from "vitest";
import {
	createProgressState,
	handleEvent,
	summarizeToolInput,
	summarizeToolResult,
	renderWidget,
	formatStatusText,
	RENDER_THROTTLE_MS,
} from "../../extensions/pi-ralph-wiggum/progress-display.js";

// --- Мок темы (как в mock-context) ---

const mockTheme = {
	fg: (_c: string, t: string) => t,
	bold: (t: string) => t,
};

// --- createProgressState ---

describe("createProgressState", () => {
	it("создаёт начальное состояние", () => {
		const state = createProgressState();
		expect(state.toolCalls).toEqual([]);
		expect(state.turnCount).toBe(0);
		expect(state.totalToolCalls).toBe(0);
		expect(state.startTime).toBeGreaterThan(0);
	});
});

// --- handleEvent: tool_execution_start ---

describe("handleEvent — tool_execution_start", () => {
	it("добавляет ToolCallRecord со status=running", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "echo hello" },
		});

		expect(state.toolCalls).toHaveLength(1);
		expect(state.totalToolCalls).toBe(1);
		const tc = state.toolCalls[0];
		expect(tc.toolName).toBe("bash");
		expect(tc.toolCallId).toBe("tc-1");
		expect(tc.input).toBe("echo hello");
		expect(tc.status).toBe("running");
	});

	it("инкрементирует totalToolCalls для каждого вызова", () => {
		const state = createProgressState();
		handleEvent(state, { type: "tool_execution_start", toolName: "bash", toolCallId: "1" });
		handleEvent(state, { type: "tool_execution_start", toolName: "read", toolCallId: "2" });
		handleEvent(state, { type: "tool_execution_start", toolName: "edit", toolCallId: "3" });

		expect(state.totalToolCalls).toBe(3);
		expect(state.toolCalls).toHaveLength(3);
	});

	it("поддерживает rolling window (8 записей)", () => {
		const state = createProgressState();
		for (let i = 0; i < 12; i++) {
			handleEvent(state, {
				type: "tool_execution_start",
				toolName: "bash",
				toolCallId: `tc-${i}`,
				args: { command: `cmd ${i}` },
			});
		}

		expect(state.toolCalls).toHaveLength(8);
		expect(state.totalToolCalls).toBe(12);
		// Должны остаться последние 8 (tc-4 .. tc-11)
		expect(state.toolCalls[0].toolCallId).toBe("tc-4");
		expect(state.toolCalls[7].toolCallId).toBe("tc-11");
	});
});

// --- handleEvent: tool_execution_end ---

describe("handleEvent — tool_execution_end", () => {
	it("обновляет статус на done и записывает результат", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "echo hello" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "tc-1",
			result: "hello\n",
			isError: false,
		});

		expect(state.toolCalls[0].status).toBe("done");
		expect(state.toolCalls[0].result).toBe("hello");
		expect(state.toolCalls[0].endedAt).toBeGreaterThan(0);
	});

	it("обновляет статус на error", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-err",
			args: { command: "exit 1" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "tc-err",
			result: "command failed",
			isError: true,
		});

		expect(state.toolCalls[0].status).toBe("error");
		expect(state.toolCalls[0].result).toContain("❌");
	});

	it("игнорирует end для неизвестного toolCallId", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "nonexistent",
			result: "ok",
			isError: false,
		});

		expect(state.toolCalls).toHaveLength(0);
	});
});

// --- handleEvent: turn_end ---

describe("handleEvent — turn_end", () => {
	it("инкрементирует turnCount", () => {
		const state = createProgressState();
		expect(state.turnCount).toBe(0);

		handleEvent(state, { type: "turn_end", turnIndex: 0 });
		expect(state.turnCount).toBe(1);

		handleEvent(state, { type: "turn_end", turnIndex: 1 });
		expect(state.turnCount).toBe(2);
	});
});

// --- handleEvent: неизвестные события ---

describe("handleEvent — неизвестные события", () => {
	it("игнорирует неизвестные типы событий", () => {
		const state = createProgressState();
		handleEvent(state, { type: "message_start" });
		handleEvent(state, { type: "unknown_event" });

		expect(state.toolCalls).toHaveLength(0);
		expect(state.turnCount).toBe(0);
		expect(state.totalToolCalls).toBe(0);
	});
});

// --- summarizeToolInput ---

describe("summarizeToolInput", () => {
	it("bash → команда", () => {
		expect(summarizeToolInput("bash", { command: "grep -r pattern src/" }))
			.toBe("grep -r pattern src/");
	});

	it("bash → обрезает длинные команды", () => {
		const longCmd = "a".repeat(100);
		const result = summarizeToolInput("bash", { command: longCmd });
		expect(result.length).toBeLessThanOrEqual(60);
		expect(result).toMatch(/…$/);
	});

	it("read → путь к файлу", () => {
		expect(summarizeToolInput("read", { path: "src/index.ts" }))
			.toBe("src/index.ts");
	});

	it("edit → путь + количество edits", () => {
		expect(
			summarizeToolInput("edit", {
				path: "src/store.ts",
				edits: [{ oldText: "a" }, { oldText: "b" }, { oldText: "c" }],
			}),
		).toBe("src/store.ts (3 edits)");
	});

	it("write → путь к файлу", () => {
		expect(summarizeToolInput("write", { path: "src/new-file.ts" }))
			.toBe("src/new-file.ts");
	});

	it("grep → паттерн", () => {
		expect(summarizeToolInput("grep", { pattern: "TODO" }))
			.toBe("TODO");
	});

	it("find → путь", () => {
		expect(summarizeToolInput("find", { path: "src/" }))
			.toBe("src/");
	});

	it("unknown → первое строковое поле", () => {
		expect(summarizeToolInput("custom_tool", { query: "search term", count: 5 }))
			.toBe("search term");
	});

	it("unknown без строковых полей → имя инструмента", () => {
		expect(summarizeToolInput("custom_tool", { count: 5 }))
			.toBe("custom_tool");
	});

	it("args = null → имя инструмента", () => {
		expect(summarizeToolInput("bash", null))
			.toBe("bash");
	});

	it("args = undefined → имя инструмента", () => {
		expect(summarizeToolInput("bash", undefined))
			.toBe("bash");
	});
});

// --- summarizeToolResult ---

describe("summarizeToolResult", () => {
	it("строковый результат → первая строка", () => {
		expect(summarizeToolResult("bash", "line1\nline2\nline3", false))
			.toBe("line1");
	});

	it("строковый результат → обрезает длинный", () => {
		const longResult = "x".repeat(200);
		const result = summarizeToolResult("bash", longResult, false);
		expect(result.length).toBeLessThanOrEqual(80);
	});

	it("error → ❌ + сообщение", () => {
		expect(summarizeToolResult("bash", "command failed", true))
			.toBe("❌ command failed");
	});

	it("error с объектом → извлекает message", () => {
		expect(summarizeToolResult("bash", { message: "not found" }, true))
			.toBe("❌ not found");
	});

	it("content array → первый text элемент", () => {
		const result = summarizeToolResult("bash", {
			content: [
				{ type: "text", text: "12 matches found" },
			],
		}, false);
		expect(result).toBe("12 matches found");
	});

	it("пустой результат → пустая строка", () => {
		expect(summarizeToolResult("bash", undefined, false))
			.toBe("");
		expect(summarizeToolResult("bash", null, false))
			.toBe("");
	});
});

// --- renderWidget ---

describe("renderWidget", () => {
	it("показывает заголовок с именем и итерацией", () => {
		const state = createProgressState();
		const lines = renderWidget(state, "my-loop", 3, 50, mockTheme);

		expect(lines[0]).toContain("my-loop");
		expect(lines[0]).toContain("3/50");
	});

	it("показывает 'Waiting for agent...' без tool calls", () => {
		const state = createProgressState();
		const lines = renderWidget(state, "test", 1, 10, mockTheme);
		const waiting = lines.find((l) => l.includes("Waiting for agent"));
		expect(waiting).toBeDefined();
	});

	it("показывает tool calls", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "echo hello" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "tc-1",
			result: "hello",
			isError: false,
		});

		const lines = renderWidget(state, "test", 1, 10, mockTheme);

		const bashLine = lines.find((l) => l.includes("bash") && l.includes("echo hello"));
		expect(bashLine).toBeDefined();

		const resultLine = lines.find((l) => l.includes("hello"));
		expect(resultLine).toBeDefined();
	});

	it("показывает футер с статистикой", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "ls" },
		});
		handleEvent(state, { type: "turn_end" });

		const lines = renderWidget(state, "test", 1, 0, mockTheme);

		const footer = lines.find((l) => l.includes("Tools: 1"));
		expect(footer).toBeDefined();
		expect(footer).toContain("Turn: 1");
	});

	it("maxIterations=0 не показывает слэш", () => {
		const state = createProgressState();
		const lines = renderWidget(state, "test", 5, 0, mockTheme);

		expect(lines[0]).toContain("(5)");
		expect(lines[0]).not.toContain("(5/)");
	});
});

// --- formatStatusText ---

describe("formatStatusText", () => {
	it("показывает текущий running инструмент", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "npm test" },
		});

		const text = formatStatusText(state, "my-loop", 2, 50);
		expect(text).toContain("my-loop");
		expect(text).toContain("2/50");
		expect(text).toContain("bash");
		expect(text).toContain("npm test");
	});

	it("без running инструментов → базовый текст", () => {
		const state = createProgressState();
		const text = formatStatusText(state, "test", 1, 10);
		expect(text).toBe("🔄 test (1/10)");
	});

	it("находит последний running при нескольких", () => {
		const state = createProgressState();
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "cmd1" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "tc-1",
			result: "ok",
			isError: false,
		});
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "read",
			toolCallId: "tc-2",
			args: { path: "file.ts" },
		});

		const text = formatStatusText(state, "test", 1, 0);
		expect(text).toContain("read");
		expect(text).toContain("file.ts");
	});
});

// --- RENDER_THROTTLE_MS ---

describe("RENDER_THROTTLE_MS", () => {
	it("равен 100ms", () => {
		expect(RENDER_THROTTLE_MS).toBe(100);
	});
});

// --- Интеграционный: полный цикл событий ---

describe("интеграционный — полный цикл", () => {
	it("агрегирует несколько tool calls и рендерит виджет", () => {
		const state = createProgressState();

		// Имитация реальной сессии
		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "bash",
			toolCallId: "tc-1",
			args: { command: "grep -r 'TODO' src/" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "bash",
			toolCallId: "tc-1",
			result: "12 matches found",
			isError: false,
		});
		handleEvent(state, { type: "turn_end", turnIndex: 0 });

		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "read",
			toolCallId: "tc-2",
			args: { path: "src/index.ts" },
		});
		handleEvent(state, {
			type: "tool_execution_end",
			toolName: "read",
			toolCallId: "tc-2",
			result: "(file content)",
			isError: false,
		});

		handleEvent(state, {
			type: "tool_execution_start",
			toolName: "edit",
			toolCallId: "tc-3",
			args: {
				path: "src/index.ts",
				edits: [{ oldText: "a" }, { oldText: "b" }],
			},
		});

		expect(state.totalToolCalls).toBe(3);
		expect(state.turnCount).toBe(1);
		expect(state.toolCalls).toHaveLength(3);

		const lines = renderWidget(state, "refactor", 1, 20, mockTheme);

		// Заголовок
		expect(lines[0]).toContain("refactor (1/20)");

		// Tool calls видны
		const grepLine = lines.find((l) => l.includes("grep -r 'TODO' src/"));
		expect(grepLine).toBeDefined();

		const readLine = lines.find((l) => l.includes("read") && l.includes("src/index.ts"));
		expect(readLine).toBeDefined();

		const editLine = lines.find((l) => l.includes("edit") && l.includes("src/index.ts") && l.includes("2 edits"));
		expect(editLine).toBeDefined();

		// Футер
		const footer = lines.find((l) => l.includes("Tools: 3"));
		expect(footer).toBeDefined();

		// Status text
		const status = formatStatusText(state, "refactor", 1, 20);
		expect(status).toContain("edit");
		expect(status).toContain("2 edits");
	});
});
