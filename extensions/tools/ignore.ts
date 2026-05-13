/**
 * Tool ignore — защита инструментов от деактивации через /tools.
 *
 * Читает глобальный (~/.pi/agent/toolignore.json) и проектный
 * (<cwd>/.pi/toolignore.json) конфиги, объединяет паттерны (union),
 * матчит имена инструментов и возвращает множество игнорируемых имён.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Glob-матчинг (fnmatch-стиль: * → любая подстрока, ? → один символ)
// ---------------------------------------------------------------------------

/**
 * Проверяет, совпадает ли строка с glob-паттерном.
 *
 * Поддерживает:
 * - `*` — любая последовательность символов (включая пустую)
 * - `?` — ровно один символ
 * - Остальные символы экранируются как literal
 */
export function matchesPattern(name: string, pattern: string): boolean {
	// Экранируем все regex-спецсимволы, кроме * и ?
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	// Заменяем glob-символы на regex
	const regexStr = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	const regex = new RegExp(`^${regexStr}$`);
	return regex.test(name);
}

// ---------------------------------------------------------------------------
// Чтение конфигов
// ---------------------------------------------------------------------------

/** Результат парсинга одного конфиг-файла */
function readPatternsFile(filePath: string): string[] {
	if (!existsSync(filePath)) return [];

	try {
		const raw = readFileSync(filePath, "utf-8").trim();
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.warn(`[tools] ${filePath}: expected array, got ${typeof parsed}`);
			return [];
		}
		// Фильтруем некорректные элементы
		return parsed.filter((p: unknown) => typeof p === "string" && p.length > 0);
	} catch (err) {
		console.warn(`[tools] ${filePath}: ${err instanceof Error ? err.message : err}`);
		return [];
	}
}

/**
 * Загружает и объединяет ignore-конфиги.
 *
 * Читает глобальный (~/.pi/agent/toolignore.json) и проектный
 * (<cwd>/.pi/toolignore.json), объединяет паттерны (union).
 *
 * @param cwd — корневая директория проекта
 * @returns Массив уникальных паттернов
 */
export function loadIgnorePatterns(cwd: string): string[] {
	const globalPath = join(homedir(), ".pi", "agent", "toolignore.json");
	const projectPath = join(cwd, ".pi", "toolignore.json");

	const globalPatterns = readPatternsFile(globalPath);
	const projectPatterns = readPatternsFile(projectPath);

	// Union с дедупликацией
	return [...new Set([...globalPatterns, ...projectPatterns])];
}

/**
 * Матчит список инструментов против ignore-паттернов.
 *
 * @param toolNames — имена всех доступных инструментов
 * @param patterns — glob-паттерны из конфигов
 * @returns Множество игнорируемых имён инструментов
 */
export function resolveIgnoredTools(toolNames: string[], patterns: string[]): Set<string> {
	if (patterns.length === 0) return new Set();

	const ignored = new Set<string>();
	for (const name of toolNames) {
		for (const pattern of patterns) {
			if (matchesPattern(name, pattern)) {
				ignored.add(name);
				break;
			}
		}
	}
	return ignored;
}

// ---------------------------------------------------------------------------
// Disabled-конфигурация из settings.json
// ---------------------------------------------------------------------------

/**
 * Синхронно прочитать JSON-файл настроек.
 * Возвращает пустой объект при отсутствии файла или ошибке парсинга.
 */
function readSettingsFile(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {};
	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/**
 * Загружает disabled-паттерны из settings.json.
 *
 * Читает секцию `tools.disabled` из:
 *   - global: ~/.pi/agent/settings.json
 *   - project: <cwd>/.pi/settings.json
 *
 * Объединяет global + project паттерны (union с дедупликацией).
 *
 * @param cwd — корневая директория проекта
 * @returns Массив glob-паттернов для инструментов, отключённых по умолчанию
 */
function extractDisabledArray(settings: Record<string, unknown>): string[] {
	const tools = settings.tools;
	if (!tools || typeof tools !== "object") return [];
	const disabled = (tools as Record<string, unknown>).disabled;
	if (!Array.isArray(disabled)) return [];
	return disabled.filter((p: unknown) => typeof p === "string" && p.length > 0);
}

export function loadDisabledPatterns(cwd: string): string[] {
	const globalPath = join(getAgentDir(), "settings.json");
	const projectPath = join(cwd, ".pi", "settings.json");

	const globalSettings = readSettingsFile(globalPath);
	const projectSettings = readSettingsFile(projectPath);

	const globalDisabled = extractDisabledArray(globalSettings);
	const projectDisabled = extractDisabledArray(projectSettings);

	// Union с дедупликацией (как toolignore)
	return [...new Set([...globalDisabled, ...projectDisabled])];
}
