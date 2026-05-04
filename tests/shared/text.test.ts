import { describe, expect, it } from "vitest";
import {
	truncateWithEllipsis,
	stripTerminalNoise,
	splitLines,
	tailLines,
} from "../../extensions/shared/text.ts";

describe("shared/text", () => {
	describe("truncateWithEllipsis", () => {
		it("возвращает пустую строку при maxChars <= 0", () => {
			expect(truncateWithEllipsis("hello", 0)).toBe("");
			expect(truncateWithEllipsis("hello", -5)).toBe("");
		});

		it("возвращает многоточие при maxChars === 1", () => {
			expect(truncateWithEllipsis("hello", 1)).toBe("…");
		});

		it("возвращает текст целиком, если он помещается", () => {
			expect(truncateWithEllipsis("abc", 5)).toBe("abc");
			expect(truncateWithEllipsis("abc", 3)).toBe("abc");
		});

		it("обрезает с многоточием при переполнении", () => {
			expect(truncateWithEllipsis("abcdef", 4)).toBe("abc…");
			expect(truncateWithEllipsis("hello world", 8)).toBe("hello w…");
		});
	});

	describe("stripTerminalNoise", () => {
		it("удаляет CSI-последовательности", () => {
			const input = "\x1b[31mred text\x1b[0m";
			expect(stripTerminalNoise(input)).toBe("red text");
		});

		it("удаляет OSC-последовательности", () => {
			const input = "\x1b]0;window title\x07prompt";
			expect(stripTerminalNoise(input)).toBe("prompt");
		});

		it("удаляет управляющие символы", () => {
			const input = "line1\x00\x01\x02line2";
			expect(stripTerminalNoise(input)).toBe("line1line2");
		});

		it("не изменяет чистый текст", () => {
			const input = "clean text here";
			expect(stripTerminalNoise(input)).toBe("clean text here");
		});

		it("удаляет \\r", () => {
			expect(stripTerminalNoise("hello\r\nworld")).toBe("hello\nworld");
		});
	});

	describe("splitLines", () => {
		it("разбивает по \\n", () => {
			expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
		});

		it("разбивает по \\r\\n", () => {
			expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
		});

		it("удаляет пустую trailing строку от завершающего перевода", () => {
			expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
		});

		it("не удаляет пустую строку в середине", () => {
			expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
		});

		it("возвращает один элемент для текста без перевода строки", () => {
			expect(splitLines("single")).toEqual(["single"]);
		});
	});

	describe("tailLines", () => {
		it("возвращает последние N строк", () => {
			expect(tailLines("a\nb\nc\nd", 2)).toEqual(["c", "d"]);
		});

		it("возвращает все строки, если count >= длины", () => {
			expect(tailLines("a\nb", 10)).toEqual(["a", "b"]);
		});

		it("возвращает пустой массив для пустого текста при count > 0", () => {
			expect(tailLines("", 5)).toEqual([]);
		});

		it("возвращает пустой массив при count <= 0", () => {
			expect(tailLines("a\nb\nc", 0)).toEqual([]);
			expect(tailLines("a\nb\nc", -1)).toEqual([]);
		});
	});
});
