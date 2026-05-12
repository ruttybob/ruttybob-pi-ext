/**
 * Загрузка шаблона промпта ревью.
 *
 * Приоритет:
 * 1. .pi/prompts/review.md (проектный файл)
 * 2. review.promptFile в settings.json (путь к файлу)
 * 3. review.instruction в settings.json (inline строка)
 * 4. Захардкоженный fallback (REVIEW_INSTRUCTION)
 *
 * Поддерживается простая подстановка переменных:
 * - {{focus}} — дополнительный контекст из аргументов /review
 * - {{project}} — имя проекта (basename cwd)
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface PromptConfig {
	/** Путь к файлу с шаблоном промпта (из settings.json). */
	promptFile?: string;
	/** Inline-строка с шаблоном промпта (из settings.json). */
	instruction?: string;
}

/**
 * Загружает шаблон промпта по приоритету.
 * Возвращает null, если нужно использовать fallback.
 */
export function loadPromptTemplate(cwd: string, config: PromptConfig): string | null {
	// 1. Проектный файл .pi/prompts/review.md
	const projectPromptPath = join(cwd, ".pi", "prompts", "review.md");
	if (existsSync(projectPromptPath)) {
		try {
			return readFileSync(projectPromptPath, "utf-8").trim();
		} catch {
			// Не удалось прочитать — пробуем следующие варианты
		}
	}

	// 2. Файл из настройки promptFile
	if (config.promptFile) {
		const resolved = join(cwd, config.promptFile);
		if (existsSync(resolved)) {
			try {
				return readFileSync(resolved, "utf-8").trim();
			} catch {
				// Не удалось прочитать — пробуем следующие варианты
			}
		}
	}

	// 3. Inline-строка из настройки instruction
	if (config.instruction) {
		return config.instruction;
	}

	// 4. Fallback — возвращаем null (вызывающий код использует REVIEW_INSTRUCTION)
	return null;
}

/** Подстановка переменных в шаблон. */
export function renderPromptTemplate(template: string, vars: { focus?: string; project?: string }): string {
	let result = template;
	for (const [key, value] of Object.entries(vars)) {
		if (value !== undefined) {
			result = result.replaceAll(`{{${key}}}`, value);
		}
	}
	return result;
}

/** Возвращает имя проекта (basename cwd). */
export function getProjectName(cwd: string): string {
	return basename(cwd);
}
