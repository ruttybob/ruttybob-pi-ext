/**
 * Subagent — конфигурация через settings.json.
 *
 * Слои (приоритет по возрастанию):
 *   1. defaults
 *   2. ~/.pi/agent/settings.json → "subagent"
 *   3. <project>/.pi/settings.json → "subagent"
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { AgentScope } from "./agents.js";

// --- Интерфейс конфига ---

export interface SubagentConfig {
	/** Разрешён ли parallel mode (tasks[]). Default: false */
	parallelEnabled: boolean;
	/** Максимальное число parallel tasks. Default: 8 */
	maxParallelTasks: number;
	/** Максимальная параллельность (concurrency limiter). Default: 4 */
	maxConcurrency: number;
	/** Откуда подгружать агентов. Default: "user" */
	agentScope: AgentScope;
	/** Подтверждать запуск project-агентов через UI. Default: true */
	confirmProjectAgents: boolean;
}

// --- Дефолты ---

export const DEFAULT_CONFIG: SubagentConfig = {
	parallelEnabled: false,
	maxParallelTasks: 8,
	maxConcurrency: 4,
	agentScope: "user",
	confirmProjectAgents: true,
};

// --- Загрузка ---

function readJsonSync(filePath: string): Record<string, unknown> | null {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
}

/**
 * Ищет директорию .pi/ поднимаясь от cwd вверх.
 */
function findPiDir(startDir: string): string | null {
	let dir = startDir;
	while (true) {
		const candidate = join(dir, ".pi");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function extractRaw(settings: Record<string, unknown> | null): Record<string, unknown> {
	if (settings && typeof settings.subagent === "object" && settings.subagent !== null) {
		return settings.subagent as Record<string, unknown>;
	}
	return {};
}

function buildConfig(raw: Record<string, unknown>): SubagentConfig {
	const validScopes = new Set<string>(["user", "project", "both"]);
	return {
		parallelEnabled: raw.parallelEnabled === true,
		maxParallelTasks:
			typeof raw.maxParallelTasks === "number" && raw.maxParallelTasks > 0
				? Math.min(raw.maxParallelTasks, 32)
				: DEFAULT_CONFIG.maxParallelTasks,
		maxConcurrency:
			typeof raw.maxConcurrency === "number" && raw.maxConcurrency > 0
				? Math.min(raw.maxConcurrency, 32)
				: DEFAULT_CONFIG.maxConcurrency,
		agentScope: validScopes.has(raw.agentScope as string) ? (raw.agentScope as AgentScope) : DEFAULT_CONFIG.agentScope,
		confirmProjectAgents: raw.confirmProjectAgents !== false,
	};
}

/**
 * Загружает конфиг subagent.
 * @param cwd — рабочий каталог проекта (для поиска .pi/settings.json)
 */
export function loadSubagentConfig(cwd?: string): SubagentConfig {
	// Слой 1: defaults (уже в buildConfig)

	// Слой 2: user-level settings
	const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");
	const globalRaw = extractRaw(readJsonSync(globalSettingsPath));

	// Слой 3: project-level settings (перекрывает user)
	let projectRaw: Record<string, unknown> = {};
	if (cwd) {
		const piDir = findPiDir(cwd);
		if (piDir) {
			const projectSettingsPath = join(piDir, "settings.json");
			projectRaw = extractRaw(readJsonSync(projectSettingsPath));
		}
	}

	// Мерж: project overrides global
	const merged = { ...globalRaw, ...projectRaw };
	return buildConfig(merged);
}
