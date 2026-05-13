/**
 * Конфигурация pi-review из settings.json.
 *
 * Формат (секция `review` в глобальном или проектном settings.json):
 * ```json
 * {
 *   "review": {
 *     "model": "openrouter/deepseek/deepseek-v4-pro",
 *     "thinkingLevel": "high",
 *     "includeDiff": true,
 *     "diffMaxLines": 2000,
 *     "promptFile": ".pi/prompts/review.md",
 *     "instruction": "Проверь код..."
 *   }
 * }
 * ```
 *
 * Все поля опциональны. Если поле не указано — используется текущее
 * значение сессии (модель / thinking level).
 *
 * Проектный `.pi/settings.json` переопределяет глобальный `~/.pi/agent/settings.json`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Допустимые значения thinkingLevel. */
const VALID_THINKING_LEVELS = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

export type ReviewThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export interface ReviewConfig {
	/**
	 * Составной ID модели: "provider/model" или "provider/namespace/model".
	 * Парсится по первому `/` — всё до первого `/` = provider, всё после = model ID.
	 * Примеры: "openrouter/deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-4-5"
	 */
	model?: string;
	/** Уровень reasoning / thinking для ревью. */
	thinkingLevel?: ReviewThinkingLevel;
	/** Включать ли git diff в контекст ревью. По умолчанию true. */
	includeDiff?: boolean;
	/** Максимальное количество строк git diff. По умолчанию 2000. */
	diffMaxLines?: number;
	/** Путь к файлу с шаблоном промпта. */
	promptFile?: string;
	/** Inline-строка с шаблоном промпта. */
	instruction?: string;
}

/**
 * Парсит составной model ID.
 * Возвращает { provider, modelId } или null если формат невалидный.
 *
 * "openrouter/deepseek/deepseek-v4-pro" → { provider: "openrouter", modelId: "deepseek/deepseek-v4-pro" }
 * "anthropic/claude-sonnet-4-5" → { provider: "anthropic", modelId: "claude-sonnet-4-5" }
 */
export function parseModelId(compositeId: string): { provider: string; modelId: string } | null {
	const idx = compositeId.indexOf("/");
	if (idx <= 0 || idx === compositeId.length - 1) return null;
	return {
		provider: compositeId.slice(0, idx),
		modelId: compositeId.slice(idx + 1),
	};
}

function readSettingsFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

function extractReviewConfig(
	settings: Record<string, unknown>,
): ReviewConfig {
	const review = settings.review;
	if (!review || typeof review !== "object") return {};
	const r = review as Record<string, unknown>;

	const result: ReviewConfig = {};

	// Модель: составной ID или склейка из устаревшего provider + model
	if (typeof r.model === "string") {
		if (typeof r.provider === "string" && !r.model.includes("/")) {
			result.model = `${r.provider}/${r.model}`;
		} else {
			result.model = r.model;
		}
	}

	// Thinking level — с валидацией
	if (typeof r.thinkingLevel === "string" && VALID_THINKING_LEVELS.has(r.thinkingLevel)) {
		result.thinkingLevel = r.thinkingLevel as ReviewThinkingLevel;
	}

	// Опциональные настройки
	if (typeof r.includeDiff === "boolean") result.includeDiff = r.includeDiff;
	if (typeof r.diffMaxLines === "number") result.diffMaxLines = r.diffMaxLines;
	if (typeof r.promptFile === "string") result.promptFile = r.promptFile;
	if (typeof r.instruction === "string") result.instruction = r.instruction;

	return result;
}

/**
 * Загружает конфигурацию review слиянием глобального и проектного settings.json.
 * Проектный конфиг переопределяет глобальный (поверхностное слияние секции `review`).
 */
export function loadReviewConfig(cwd: string): ReviewConfig {
	const globalPath = join(getAgentDir(), "settings.json");
	const projectPath = join(cwd, ".pi", "settings.json");

	const globalConfig = extractReviewConfig(readSettingsFile(globalPath));
	const projectConfig = extractReviewConfig(readSettingsFile(projectPath));

	return {
		...globalConfig,
		...projectConfig,
	};
}

/**
 * Валидирует thinkingLevel из конфига.
 * Возвращает валидное значение или fallback.
 */
export function validateThinkingLevel(
	value: string | undefined,
	fallback: ReviewThinkingLevel = "high",
): ReviewThinkingLevel {
	if (!value) return fallback;
	if (VALID_THINKING_LEVELS.has(value)) return value as ReviewThinkingLevel;
	return fallback;
}
