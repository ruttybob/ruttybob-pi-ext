import { describe, expect, it } from "vitest";
import { shellQuote } from "../../extensions/shared/git.js";

describe("shared/git", () => {
	describe("shellQuote", () => {
		it("оборачивает обычную строку в одинарные кавычки", () => {
			expect(shellQuote("hello")).toBe("'hello'");
		});

		it("экранирует встроенную одинарную кавычку", () => {
			expect(shellQuote("it's")).toBe("'it'\"'\"'s'");
		});

		it("обрабатывает пустую строку", () => {
			expect(shellQuote("")).toBe("''");
		});

		it("обрабатывает строку с несколькими кавычками", () => {
			expect(shellQuote("a'b'c")).toBe("'a'\"'\"'b'\"'\"'c'");
		});
	});
});
