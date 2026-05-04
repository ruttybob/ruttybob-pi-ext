// tests/evolver/utils.test.ts

import { describe, expect, it } from "vitest";
import { formatDuration, makeResult } from "../../extensions/evolver/utils.js";

describe("evolver/utils", () => {
	describe("formatDuration", () => {
		it("форматирует миллисекунды < 1s", () => {
			expect(formatDuration(50)).toBe("50ms");
		});

		it("форматирует секунды < 60s", () => {
			expect(formatDuration(1500)).toBe("1.5s");
			expect(formatDuration(30_000)).toBe("30.0s");
		});

		it("форматирует минуты + секунды", () => {
			expect(formatDuration(90_000)).toBe("1m 30s");
			expect(formatDuration(125_000)).toBe("2m 5s");
		});

		it("форматирует ровно 0ms", () => {
			expect(formatDuration(0)).toBe("0ms");
		});
	});

	describe("makeResult", () => {
		it("создаёт объект с content и details", () => {
			const result = makeResult("test output", {
				exitCode: 0,
				strategy: "balanced",
				durationMs: 100,
				aborted: false,
				timedOut: false,
			});

			expect(result.content).toHaveLength(1);
			expect(result.content[0]).toEqual({ type: "text", text: "test output" });
			expect(result.details.strategy).toBe("balanced");
		});
	});
});
