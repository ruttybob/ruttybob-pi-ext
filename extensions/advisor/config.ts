/**
 * advisor — конфигурация через ~/.pi/agent/settings.json.
 *
 * Ключ "advisor" в settings.json:
 *   { "advisor": { "model": "provider:id", "effort": "high" } }
 *
 * Приоритет: defaults → settings.json → рантайм (/advisor)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

// --- Интерфейс ---

export interface AdvisorSettings {
	/** provider:modelId через двоеточие, undefined = advisor выключен */
	model?: string;
	/** reasoning effort level */
	effort?: ThinkingLevel;
}

// --- Путь ---

function settingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

// --- Read ---

function readJsonSync(filePath: string): Record<string, unknown> | null {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
}

export function loadAdvisorSettings(): AdvisorSettings {
	const raw = readJsonSync(settingsPath());
	if (!raw || typeof raw.advisor !== "object" || raw.advisor === null) return {};
	const advisor = raw.advisor as Record<string, unknown>;
	return {
		model: typeof advisor.model === "string" ? advisor.model : undefined,
		effort:
			typeof advisor.effort === "string" &&
			["minimal", "low", "medium", "high", "xhigh"].includes(advisor.effort)
				? (advisor.effort as ThinkingLevel)
				: undefined,
	};
}

// --- Write ---

export function saveAdvisorSettings(model: string | undefined, effort: ThinkingLevel | undefined): void {
	const path = settingsPath();
	const raw = readJsonSync(path) ?? {};
	raw.advisor = {};
	if (model) raw.advisor.model = model;
	if (effort) raw.advisor.effort = effort;
	// Если оба undefined — удаляем ключ advisor
	if (!model && !effort) delete raw.advisor;
	writeFileSync(path, JSON.stringify(raw, null, 2) + "\n", "utf-8");
}
