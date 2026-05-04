/**
 * Тесты для subagent/render — formatTokens, formatUsageStats, formatToolCall.
 */

import { describe, expect, it } from "vitest";
import { formatTokens, formatUsageStats, formatToolCall } from "../../extensions/subagent/render.js";

// --- formatTokens ---

describe("subagent/render > formatTokens", () => {
	it("0 → \"0\"", () => {
		expect(formatTokens(0)).toBe("0");
	});

	it("999 → \"999\"", () => {
		expect(formatTokens(999)).toBe("999");
	});

	it("1000 → \"1.0k\"", () => {
		expect(formatTokens(1000)).toBe("1.0k");
	});

	it("1500 → \"1.5k\"", () => {
		expect(formatTokens(1500)).toBe("1.5k");
	});

	it("10000 → \"10k\"", () => {
		expect(formatTokens(10000)).toBe("10k");
	});

	it("999999 → \"1000k\"", () => {
		expect(formatTokens(999999)).toBe("1000k");
	});

	it("1000000 → \"1.0M\"", () => {
		expect(formatTokens(1000000)).toBe("1.0M");
	});

	it("2500000 → \"2.5M\"", () => {
		expect(formatTokens(2500000)).toBe("2.5M");
	});
});

// --- formatUsageStats ---

describe("subagent/render > formatUsageStats", () => {
	it("все поля заполнены", () => {
		const result = formatUsageStats(
			{ input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, cost: 0.05, contextTokens: 8000, turns: 3 },
			"claude-3.5",
		);
		expect(result).toContain("3 turns");
		expect(result).toContain("↑1.0k");
		expect(result).toContain("↓500");
		expect(result).toContain("R200");
		expect(result).toContain("W100");
		expect(result).toContain("$0.0500");
		expect(result).toContain("ctx:8.0k");
		expect(result).toContain("claude-3.5");
	});

	it("частичные поля", () => {
		const result = formatUsageStats(
			{ input: 500, output: 200, cacheRead: 0, cacheWrite: 0, cost: 0.01, contextTokens: 0, turns: 1 },
		);
		expect(result).toBe("1 turn ↑500 ↓200 $0.0100");
	});

	it("пустые поля — пустая строка", () => {
		const result = formatUsageStats(
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		);
		expect(result).toBe("");
	});

	it("только cost без turns/input/output", () => {
		const result = formatUsageStats(
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0.0042, contextTokens: 0, turns: 0 },
		);
		expect(result).toBe("$0.0042");
	});
});

// --- formatToolCall ---

describe("subagent/render > formatToolCall", () => {
	// Identity theme function для тестов — возвращает "color:text"
	const themeFg = (color: string, text: string) => `${color}:${text}`;

	it("bash — короткая команда", () => {
		const result = formatToolCall("bash", { command: "ls -la" }, themeFg);
		expect(result).toBe("muted:$ toolOutput:ls -la");
	});

	it("bash — длинная команда обрезается", () => {
		const longCmd = "a".repeat(70);
		const result = formatToolCall("bash", { command: longCmd }, themeFg);
		expect(result).toContain("...");
		expect(result).toContain("muted:$ ");
	});

	it("read — файл без offset/limit", () => {
		const result = formatToolCall("read", { file_path: "/tmp/test.ts" }, themeFg);
		expect(result).toContain("muted:read ");
		expect(result).toContain("accent:/tmp/test.ts");
	});

	it("read — файл с offset и limit", () => {
		const result = formatToolCall("read", { file_path: "/tmp/test.ts", offset: 10, limit: 5 }, themeFg);
		expect(result).toContain("accent:/tmp/test.ts");
		expect(result).toContain("warning::10-14");
	});

	it("write — многострочный контент", () => {
		const result = formatToolCall("write", { file_path: "/tmp/out.ts", content: "line1\nline2\nline3" }, themeFg);
		expect(result).toContain("muted:write ");
		expect(result).toContain("dim: (3 lines)");
	});

	it("write — однострочный контент без lines", () => {
		const result = formatToolCall("write", { file_path: "/tmp/out.ts", content: "single" }, themeFg);
		expect(result).toContain("muted:write ");
		expect(result).not.toContain("lines");
	});

	it("edit — файл", () => {
		const result = formatToolCall("edit", { file_path: "/tmp/edit.ts" }, themeFg);
		expect(result).toContain("muted:edit ");
		expect(result).toContain("accent:/tmp/edit.ts");
	});

	it("ls — путь", () => {
		const result = formatToolCall("ls", { path: "/tmp/dir" }, themeFg);
		expect(result).toContain("muted:ls ");
		expect(result).toContain("accent:/tmp/dir");
	});

	it("find — паттерн и путь", () => {
		const result = formatToolCall("find", { pattern: "*.ts", path: "/tmp/src" }, themeFg);
		expect(result).toContain("muted:find ");
		expect(result).toContain("accent:*.ts");
		expect(result).toContain("dim: in /tmp/src");
	});

	it("grep — паттерн и путь", () => {
		const result = formatToolCall("grep", { pattern: "TODO", path: "/tmp/src" }, themeFg);
		expect(result).toContain("muted:grep ");
		expect(result).toContain("accent:/TODO/");
		expect(result).toContain("dim: in /tmp/src");
	});

	it("unknown tool — имя и JSON-аргументы", () => {
		const result = formatToolCall("customTool", { key: "value" }, themeFg);
		expect(result).toContain("accent:customTool");
		expect(result).toContain("dim: ");
		expect(result).toContain("key");
	});

	it("read — путь в home директории сокращается", () => {
		const homePath = process.env.HOME || process.env.USERPROFILE || "/home/user";
		const result = formatToolCall("read", { file_path: `${homePath}/project/file.ts` }, themeFg);
		expect(result).toContain("~/project/file.ts");
	});
});
