import { describe, expect, it } from "vitest";
import { sleep, stringifyError } from "../../extensions/shared/async.js";

describe("shared/async", () => {
	describe("stringifyError", () => {
		it("извлекает message из Error", () => {
			expect(stringifyError(new Error("something broke"))).toBe("something broke");
		});

		it("преобразует строку", () => {
			expect(stringifyError("plain string")).toBe("plain string");
		});

		it("преобразует число", () => {
			expect(stringifyError(42)).toBe("42");
		});

		it("преобразует null", () => {
			expect(stringifyError(null)).toBe("null");
		});

		it("преобразует undefined", () => {
			expect(stringifyError(undefined)).toBe("undefined");
		});

		it("преобразует объект", () => {
			expect(stringifyError({ key: "val" })).toBe("[object Object]");
		});
	});

	describe("sleep", () => {
		it("разрешается после указанной задержки", async () => {
			const before = Date.now();
			await sleep(50);
			const elapsed = Date.now() - before;
			expect(elapsed).toBeGreaterThanOrEqual(40);
		});
	});
});
