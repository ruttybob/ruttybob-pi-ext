import { describe, it, expect } from "vitest";
import {
	sanitizeSessionName,
	getFirstUserMessageText,
	getConversationTranscript,
} from "../../extensions/pi-auto-rename/utils.js";

describe("sanitizeSessionName", () => {
	it("возвращает пустую строку для пустого ввода", () => {
		expect(sanitizeSessionName("")).toBe("");
		expect(sanitizeSessionName("   ")).toBe("");
	});

	it("убирает кавычки по краям", () => {
		expect(sanitizeSessionName('"My Session"')).toBe("My Session");
		expect(sanitizeSessionName("'My Session'")).toBe("My Session");
		expect(sanitizeSessionName("`My Session`")).toBe("My Session");
	});

	it("берёт только первую строку", () => {
		expect(sanitizeSessionName("First Line\nSecond Line")).toBe("First Line");
	});

	it("обрезает trailing пунктуацию", () => {
		expect(sanitizeSessionName("My Session.")).toBe("My Session");
		expect(sanitizeSessionName("My Session?")).toBe("My Session");
		expect(sanitizeSessionName("My Session!")).toBe("My Session");
	});

	it("обрезает до 80 символов", () => {
		const long = "A".repeat(100);
		const result = sanitizeSessionName(long);
		expect(result.length).toBeLessThanOrEqual(80);
	});

	it("нормализует пробелы", () => {
		expect(sanitizeSessionName("My   Session   Name")).toBe("My Session Name");
	});

	it("пропускает нормальные имена", () => {
		expect(sanitizeSessionName("Fix Login Bug")).toBe("Fix Login Bug");
	});
});

describe("getFirstUserMessageText", () => {
	it("возвращает null для пустого массива", () => {
		expect(getFirstUserMessageText([])).toBeNull();
	});

	it("возвращает null если нет user сообщений", () => {
		const entries = [
			{ type: "message", message: { role: "assistant", content: "hello" } },
		];
		expect(getFirstUserMessageText(entries as any)).toBeNull();
	});

	it("находит первое user сообщение (сканирует с конца)", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "second" } },
			{ type: "message", message: { role: "user", content: "first" } },
		];
		expect(getFirstUserMessageText(entries as any)).toBe("first");
	});

	it("извлекает текст из content-массива", () => {
		const entries = [
			{
				type: "message",
				message: {
					role: "user",
					content: [{ type: "text", text: "Hello world" }],
				},
			},
		];
		expect(getFirstUserMessageText(entries as any)).toBe("Hello world");
	});

	it("пропускает пустые user сообщения", () => {
		const entries = [
			{ type: "message", message: { role: "user", content: "" } },
			{ type: "message", message: { role: "user", content: "actual text" } },
		];
		expect(getFirstUserMessageText(entries as any)).toBe("actual text");
	});
});

describe("getConversationTranscript", () => {
	it("возвращает пустую строку для пустого массива", () => {
		expect(getConversationTranscript([])).toBe("");
	});

	it("строит транскрипт из user/assistant сообщений", () => {
		const entries = [
			{ type: "message", message: { role: "assistant", content: "hi" } },
			{ type: "message", message: { role: "user", content: "hello" } },
		];
		const result = getConversationTranscript(entries as any);
		expect(result).toContain("User: hello");
		expect(result).toContain("Assistant: hi");
	});

	it("пропускает toolResult сообщения", () => {
		const entries = [
			{ type: "message", message: { role: "toolResult", content: "output" } },
			{ type: "message", message: { role: "user", content: "hello" } },
		];
		const result = getConversationTranscript(entries as any);
		expect(result).toBe("User: hello");
	});
});
