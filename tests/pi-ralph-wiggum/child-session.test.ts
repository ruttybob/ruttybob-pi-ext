import { describe, expect, it } from "vitest";
import {
	getPiInvocation,
	parseJsonLines,
} from "../../extensions/pi-ralph-wiggum/child-session.js";

describe("child-session — getPiInvocation", () => {
	it("возвращает объект с command и args", () => {
		const result = getPiInvocation(["--mode", "json"]);
		expect(result).toHaveProperty("command");
		expect(result).toHaveProperty("args");
		expect(result.args).toContain("--mode");
		expect(result.args).toContain("json");
	});

	it("передаёт все аргументы", () => {
		const result = getPiInvocation([
			"--mode",
			"json",
			"-p",
			"--no-session",
		]);
		expect(result.args).toEqual(
			expect.arrayContaining([
				"--mode",
				"json",
				"-p",
				"--no-session",
			]),
		);
	});
});

describe("child-session — parseJsonLines", () => {
	it("парсит валидные JSON строки", () => {
		const input = [
			'{"type":"message_end","message":{"role":"assistant"}}',
			'{"type":"tool_result_end","message":{"role":"toolResult"}}',
		].join("\n");

		const events = parseJsonLines(input);
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("message_end");
		expect(events[1].type).toBe("tool_result_end");
	});

	it("игнорирует невалидные JSON строки", () => {
		const input = [
			'{"type":"message_end"}',
			"not json",
			'{"type":"tool_result_end"}',
		].join("\n");

		const events = parseJsonLines(input);
		expect(events).toHaveLength(2);
	});

	it("игнорирует пустые строки", () => {
		const input = '\n\n{"type":"message_end"}\n\n';
		const events = parseJsonLines(input);
		expect(events).toHaveLength(1);
	});

	it("возвращает пустой массив для пустой строки", () => {
		expect(parseJsonLines("")).toHaveLength(0);
		expect(parseJsonLines("\n\n")).toHaveLength(0);
	});
});
