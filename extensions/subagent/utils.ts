/**
 * Утилиты для subagent-расширения.
 *
 * Чистые функции извлечения и агрегации данных из Message[].
 * Используются как runner.ts, так и render.ts.
 */

import type { Message } from "@earendil-works/pi-ai";
import type { DisplayItem, SingleResult } from "./types.js";

/**
 * Извлекает финальный текстовый ответ из массива messages.
 * Ищет последний assistant-message с text-контентом.
 */
export function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content as { type: string; text: string; name?: string; arguments?: any }[]) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

/**
 * Преобразует messages в массив элементов отображения (текст + tool calls).
 */
export function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content as { type: string; text: string; name?: string; arguments?: any }[]) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name ?? "", args: part.arguments ?? {} });
			}
		}
	}
	return items;
}

/**
 * Агрегирует usage-статистику по массиву результатов.
 */
export function aggregateUsage(results: SingleResult[]) {
	const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
	for (const r of results) {
		total.input += r.usage.input;
		total.output += r.usage.output;
		total.cacheRead += r.usage.cacheRead;
		total.cacheWrite += r.usage.cacheWrite;
		total.cost += r.usage.cost;
		total.turns += r.usage.turns;
	}
	return total;
}
