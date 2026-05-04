/**
 * utils.ts — Общие утилиты для evolver extension.
 */

import type { EvolveDetails } from "./types.js";

/**
 * Форматирует длительность в ms в человекочитаемый формат.
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * Создаёт стандартный результат tool execute.
 */
export function makeResult(text: string, details: EvolveDetails) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

