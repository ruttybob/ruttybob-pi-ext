/**
 * Tool Groups — именованные glob-группы инструментов.
 *
 * Конфиг хранится в:
 *   - глобальный: ~/.pi/agent/toolgroups.json
 *   - проектный:  <cwd>/.pi/toolgroups.json
 *
 * Оба конфига объединяются (union, проектный добавляет к глобальному).
 * Перезапись идёт только в проектный конфиг.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { matchesPattern } from "./ignore.js";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface ToolGroup {
	name: string;
	pattern: string;
	description?: string;
}

// ---------------------------------------------------------------------------
// Загрузка / сохранение конфига
// ---------------------------------------------------------------------------

/**
 * Читает один конфиг-файл. Возвращает пустой массив при отсутствии или ошибке.
 */
function readGroupsFile(filePath: string): ToolGroup[] {
	if (!existsSync(filePath)) return [];

	try {
		const raw = readFileSync(filePath, "utf-8").trim();
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.warn(`[tools/groups] ${filePath}: expected array, got ${typeof parsed}`);
			return [];
		}
		return parsed.filter(
			(g: unknown) =>
				typeof g === "object" &&
				g !== null &&
				typeof (g as Record<string, unknown>).name === "string" &&
				typeof (g as Record<string, unknown>).pattern === "string",
		) as ToolGroup[];
	} catch (err) {
		console.warn(
			`[tools/groups] ${filePath}: ${err instanceof Error ? err.message : err}`,
		);
		return [];
	}
}

/**
 * Загружает группы из глобального и проектного конфигов (union).
 *
 * При совпадении `name` проектная группа перезаписывает глобальную.
 */
export function loadGroups(cwd: string): ToolGroup[] {
	const globalPath = join(getAgentDir(), "toolgroups.json");
	const projectPath = join(cwd, ".pi", "toolgroups.json");

	const globalGroups = readGroupsFile(globalPath);
	const projectGroups = readGroupsFile(projectPath);

	// Merge: проектные перезаписывают глобальные с тем же name
	const map = new Map<string, ToolGroup>();
	for (const g of globalGroups) map.set(g.name, g);
	for (const g of projectGroups) map.set(g.name, g);

	return Array.from(map.values());
}

/**
 * Сохраняет группы в проектный конфиг (<cwd>/.pi/toolgroups.json).
 */
export function saveGroups(cwd: string, groups: ToolGroup[]): void {
	const projectPath = join(cwd, ".pi", "toolgroups.json");
	const dir = dirname(projectPath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const data = groups.map(({ name, pattern, description }) => {
		const entry: ToolGroup = { name, pattern };
		if (description) entry.description = description;
		return entry;
	});

	writeFileSync(projectPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Резолв инструментов
// ---------------------------------------------------------------------------

/**
 * Возвращает имена инструментов, попадающих под паттерн группы.
 *
 * Использует `matchesPattern` из ignore.ts (glob: * и ?).
 */
export function resolveGroupTools(
	group: ToolGroup,
	allToolNames: string[],
): string[] {
	return allToolNames.filter((name) => matchesPattern(name, group.pattern));
}

/**
 * Группа считается включённой, если ВСЕ её инструменты активны.
 */
export function isGroupEnabled(
	groupTools: string[],
	activeTools: string[],
): boolean {
	if (groupTools.length === 0) return false;
	const activeSet = new Set(activeTools);
	return groupTools.every((name) => activeSet.has(name));
}

/**
 * Ищет группу по имени (case-sensitive).
 */
export function findGroup(groups: ToolGroup[], name: string): ToolGroup | undefined {
	return groups.find((g) => g.name === name);
}
