/**
 * Генерация промптов для Ralph Wiggum.
 *
 * buildSystemPromptAppend — для spawn-режима (--append-system-prompt).
 */

import { COMPLETE_MARKER } from "./files.js";

/** LoopState — минимальный интерфейс, нужный для генерации промптов. */
export interface PromptLoopState {
	name: string;
	taskFile: string;
	progressFile: string;
	reflectionFile: string;
	iteration: number;
	maxIterations: number;
	itemsPerIteration: number;
	reflectEvery: number;
	reflectInstructions: string;
}

const SEPARATOR =
	"───────────────────────────────────────────────────────────────────────";

/**
 * System prompt append для spawn-режима.
 * Записывается во временный файл и передаётся через --append-system-prompt.
 */
export function buildSystemPromptAppend(
	state: PromptLoopState,
	progressContent: string | null,
	reflectionContent: string | null,
): string {
	const maxStr =
		state.maxIterations > 0 ? `/${state.maxIterations}` : "";

	const parts: string[] = [];

	// --- Заголовок ---
	parts.push(`${SEPARATOR}
🔄 RALPH LOOP: ${state.name} | Iteration ${state.iteration}${maxStr}
${SEPARATOR}`);

	// --- Инструкции ---
	parts.push(`\n## Ralph Loop Instructions\n`);
	parts.push(
		`You are in a Ralph loop (iteration ${state.iteration}${state.maxIterations > 0 ? ` of ${state.maxIterations}` : ""}).`,
	);
	parts.push(
		`You are an isolated child session — no extensions, no parent context.`,
	);

	if (state.itemsPerIteration > 0) {
		parts.push(
			`**Process approximately ${state.itemsPerIteration} items this iteration.**`,
		);
	}

	parts.push(`\n## File Management`);
	parts.push(
		`1. **Task file** (${state.taskFile}): Read for current task, update with progress.`,
	);
	parts.push(
		`2. **Progress file** (${state.progressFile}): Update after completing items. Mark completed items with [x].`,
	);
	parts.push(
		`3. **Reflection file** (${state.reflectionFile}): ${state.reflectEvery > 0 ? `Write reflections here when instructed.` : `(not used — reflectEvery=0)`}`,
	);

	parts.push(`\n## Completion`);
	parts.push(
		`- When FULLY COMPLETE: respond with ${COMPLETE_MARKER}`,
	);
	parts.push(
		`- Otherwise: you will be terminated after this iteration and a new one starts.`,
	);

	// --- Прогресс ---
	if (progressContent) {
		parts.push(`\n## Current Progress\n\n${progressContent}`);
	}

	// --- Рефлексия ---
	if (state.reflectEvery > 0) {
		const needsReflection =
			state.iteration > 1 &&
			(state.iteration - 1) % state.reflectEvery === 0;
		if (needsReflection) {
			parts.push(`\n## 🪞 REFLECTION CHECKPOINT\n`);
			parts.push(state.reflectInstructions);
		} else {
			const next =
				state.reflectEvery -
				((state.iteration - 1) % state.reflectEvery);
			parts.push(`\n(Next reflection in ${next} iterations)`);
		}
	}

	// --- Прошлые рефлексии ---
	if (reflectionContent) {
		parts.push(
			`\n## Previous Reflections\n\n${reflectionContent}`,
		);
	}

	return parts.join("\n");
}
