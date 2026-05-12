/**
 * Тесты для lib/conversation-context.ts — extractConversation, formatConversation, extractLatestAssistantText
 */
import { describe, it, expect } from "vitest";
import {
	extractConversation,
	extractLatestAssistantText,
	formatConversation,
} from "./conversation-context.js";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

describe("extractConversation", () => {
	it("извлекает user и assistant сообщения", () => {
		const branch: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: 0,
				message: { role: "user", content: "Привет" },
			},
			{
				type: "message",
				id: "2",
				parentId: "1",
				timestamp: 1,
				message: { role: "assistant", content: [{ type: "text", text: "Ответ" }] },
			},
		];

		const result = extractConversation(branch);
		expect(result).toEqual([
			{ role: "user", text: "Привет" },
			{ role: "assistant", text: "Ответ" },
		]);
	});

	it("пропускает toolResult сообщения", () => {
		const branch: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: 0,
				message: { role: "toolResult", content: "result" },
			},
		];

		expect(extractConversation(branch)).toEqual([]);
	});

	it("пропускает не-message записи", () => {
		const branch: SessionEntry[] = [
			{
				type: "custom",
				id: "1",
				parentId: null,
				timestamp: 0,
				customType: "test",
				data: {},
			} as SessionEntry,
		];

		expect(extractConversation(branch)).toEqual([]);
	});
});

describe("formatConversation", () => {
	it("форматирует сообщения в XML", () => {
		const messages = [
			{ role: "user" as const, text: "Привет" },
			{ role: "assistant" as const, text: "Ответ" },
		];

		const result = formatConversation(messages);
		expect(result).toContain('<user index="1">');
		expect(result).toContain("Привет");
		expect(result).toContain('</user>');
		expect(result).toContain('<assistant index="2">');
		expect(result).toContain("Ответ");
		expect(result).toContain('</assistant>');
	});

	it("возвращает пустую строку для пустого массива", () => {
		expect(formatConversation([])).toBe("");
	});
});

describe("extractLatestAssistantText", () => {
	it("находит последний assistant text", () => {
		const branch: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: 0,
				message: { role: "assistant", content: [{ type: "text", text: "Первый" }] },
			},
			{
				type: "message",
				id: "2",
				parentId: "1",
				timestamp: 1,
				message: { role: "assistant", content: [{ type: "text", text: "Второй" }] },
			},
		];

		expect(extractLatestAssistantText(branch)).toBe("Второй");
	});

	it("возвращает пустую строку при отсутствии assistant", () => {
		const branch: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: 0,
				message: { role: "user", content: "Привет" },
			},
		];

		expect(extractLatestAssistantText(branch)).toBe("");
	});
});
