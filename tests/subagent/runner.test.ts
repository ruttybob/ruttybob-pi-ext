/**
 * Тесты для subagent/runner — mapWithConcurrencyLimit, getFinalOutput, getDisplayItems.
 *
 * runSingleAgent тестируется через mock child_process.spawn.
 */

import { describe, expect, it, vi } from "vitest";
import {
	mapWithConcurrencyLimit,
} from "../../extensions/subagent/runner.js";
import {
	getDisplayItems,
	getFinalOutput,
} from "../../extensions/subagent/utils.js";

// --- helpers ---

function makeMessage(role: string, content: any[]) {
	return { role, content };
}

// --- getFinalOutput ---

describe("subagent/runner > getFinalOutput", () => {
	it("возвращает текст последнего assistant-сообщения", () => {
		const messages = [
			makeMessage("user", [{ type: "text", text: "запрос" }]),
			makeMessage("assistant", [{ type: "text", text: "ответ" }]),
		];
		expect(getFinalOutput(messages)).toBe("ответ");
	});

	it("возвращает текст последнего assistant при нескольких", () => {
		const messages = [
			makeMessage("assistant", [{ type: "text", text: "первый" }]),
			makeMessage("toolResult", [{ type: "text", text: "результат" }]),
			makeMessage("assistant", [{ type: "text", text: "второй" }]),
		];
		expect(getFinalOutput(messages)).toBe("второй");
	});

	it("возвращает пустую строку при отсутствии assistant", () => {
		const messages = [makeMessage("user", [{ type: "text", text: "запрос" }])];
		expect(getFinalOutput(messages)).toBe("");
	});

	it("возвращает пустую строку если assistant содержит только toolCall", () => {
		const messages = [
			makeMessage("assistant", [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }]),
		];
		expect(getFinalOutput(messages)).toBe("");
	});

	it("возвращает пустую строку для пустого массива", () => {
		expect(getFinalOutput([])).toBe("");
	});
});

// --- getDisplayItems ---

describe("subagent/runner > getDisplayItems", () => {
	it("извлекает text и toolCall из mixed messages", () => {
		const messages = [
			makeMessage("assistant", [
				{ type: "text", text: "думаю..." },
				{ type: "toolCall", name: "bash", arguments: { command: "ls" } },
			]),
			makeMessage("assistant", [{ type: "text", text: "результат" }]),
		];
		const items = getDisplayItems(messages);
		expect(items).toEqual([
			{ type: "text", text: "думаю..." },
			{ type: "toolCall", name: "bash", args: { command: "ls" } },
			{ type: "text", text: "результат" },
		]);
	});

	it("пропускает user и toolResult сообщения", () => {
		const messages = [
			makeMessage("user", [{ type: "text", text: "вопрос" }]),
			makeMessage("toolResult", [{ type: "text", text: "результат" }]),
		];
		expect(getDisplayItems(messages)).toEqual([]);
	});

	it("возвращает пустой массив для пустых сообщений", () => {
		expect(getDisplayItems([])).toEqual([]);
	});
});

// --- mapWithConcurrencyLimit ---

describe("subagent/runner > mapWithConcurrencyLimit", () => {
	it("concurrency=1 — последовательное выполнение", async () => {
		const order: number[] = [];
		const items = [10, 20, 30];
		const result = await mapWithConcurrencyLimit(items, 1, async (item, index) => {
			order.push(index);
			return item * 2;
		});
		expect(result).toEqual([20, 40, 60]);
		expect(order).toEqual([0, 1, 2]);
	});

	it("concurrency=N — параллельное выполнение с сохранением порядка", async () => {
		const items = [1, 2, 3, 4, 5];
		const result = await mapWithConcurrencyLimit(items, 3, async (item) => {
			// Имитируем разное время выполнения
			await new Promise((r) => setTimeout(r, Math.random() * 10));
			return item * 10;
		});
		expect(result).toEqual([10, 20, 30, 40, 50]);
	});

	it("пустой массив — пустой результат", async () => {
		const result = await mapWithConcurrencyLimit([], 4, async (item) => item);
		expect(result).toEqual([]);
	});

	it("propagates ошибку", async () => {
		await expect(
			mapWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
				if (item === 2) throw new Error("boom");
				return item;
			}),
		).rejects.toThrow("boom");
	});

	it("concurrency > items.length — использует items.length как лимит", async () => {
		const items = [1, 2];
		const result = await mapWithConcurrencyLimit(items, 100, async (item) => item + 1);
		expect(result).toEqual([2, 3]);
	});
});
