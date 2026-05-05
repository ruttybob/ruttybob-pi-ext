/**
 * Answer — конфигурация модели для extraction.
 *
 * Слои (приоритет по возрастанию):
 *   1. defaults (ctx.model — текущая модель сессии)
 *   2. ~/.pi/agent/settings.json → "answer"
 *   3. <project>/.pi/settings.json → "answer"
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Model } from "@mariozechner/pi-ai";

// --- Интерфейс конфига ---

export interface AnswerConfig {
	/** Модель для extraction в формате "provider/model-id". Undefined = использовать ctx.model. */
	model?: string;
}

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

function extractRaw(settings: Record<string, unknown> | null): AnswerConfig {
	if (settings && typeof settings.answer === "object" && settings.answer !== null) {
		return settings.answer as AnswerConfig;
	}
	return {};
}

function buildConfig(raw: Record<string, unknown>): AnswerConfig {
	const model = raw.model;
	return {
		model: typeof model === "string" && model.trim() !== "" ? model.trim() : undefined,
	};
}

/**
 * Загружает конфиг answer.
 * @param cwd — рабочий каталог проекта (для поиска .pi/settings.json)
 */
export function loadAnswerConfig(cwd?: string): AnswerConfig {
	// Слой 2: user-level settings
	const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");
	const globalRaw = extractRaw(readJsonSync(globalSettingsPath));

	// Слой 3: project-level settings (перекрывает user)
	let projectRaw: AnswerConfig = {};
	if (cwd) {
		const piDir = findPiDir(cwd);
		if (piDir) {
			const projectSettingsPath = join(piDir, "settings.json");
			projectRaw = extractRaw(readJsonSync(projectSettingsPath));
		}
	}

	// Мерж: project overrides global
	const merged = { ...globalRaw, ...projectRaw };
	return buildConfig(merged as Record<string, unknown>);
}

/**
 * Парсит строку "provider/model-id" в компоненты.
 */
export function parseModelRef(input: string): { provider: string; id: string } | null {
	const trimmed = input.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0 || slash === trimmed.length - 1) return null;
	return { provider: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) };
}

/**
 * Резолвит модель для extraction: из конфига или fallback на ctx.model.
 * Возвращает модель и строку source для отображения в loader.
 */
export async function resolveExtractionModel(
	config: AnswerConfig,
	currentModel: Model,
	modelRegistry: {
		find(provider: string, id: string): Model | undefined;
		getApiKeyAndHeaders(model: Model): Promise<{
			ok: boolean;
			apiKey?: string;
			headers?: Record<string, string>;
			error?: string;
		}>;
	},
	_cwd?: string,
): Promise<{ model: Model; source: string }> {
	// Нет конфига — используем текущую модель
	if (!config.model) {
		return { model: currentModel, source: "session" };
	}

	const ref = parseModelRef(config.model);
	if (!ref) {
		// Невалидный формат — fallback на текущую
		return { model: currentModel, source: "session (invalid config)" };
	}

	const found = modelRegistry.find(ref.provider, ref.id);
	if (!found) {
		// Модель не найдена в реестре — fallback на текущую
		return { model: currentModel, source: `session (${config.model} not found)` };
	}

	const auth = await modelRegistry.getApiKeyAndHeaders(found);
	if (!auth.ok) {
		// Нет auth — fallback на текущую
		return { model: currentModel, source: `session (${config.model} no auth)` };
	}

	return { model: found, source: config.model };
}
