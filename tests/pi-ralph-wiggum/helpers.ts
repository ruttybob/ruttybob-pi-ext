/**
 * Общие утилиты для тестов Ralph Wiggum.
 * Фабрики состояний, моки файловой системы.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createMockContext } from "../test-helpers/mock-context.js";

/**
 * Тип состояния цикла Ralph.
 * Должен совпадать с LoopState из расширения.
 */
export interface LoopState {
	name: string;
	taskFile: string;
	progressFile: string;
	reflectionFile: string;
	iteration: number;
	maxIterations: number;
	itemsPerIteration: number;
	reflectEvery: number;
	reflectInstructions: string;
	active: boolean;
	status: "active" | "paused" | "completed";
	startedAt: string;
	completedAt?: string;
	lastReflectionAt: number;
}

/**
 * Фабрика тестового LoopState с разумными дефолтами.
 */
export function createTestLoopState(
	overrides: Partial<LoopState> = {},
): LoopState {
	return {
		name: "test-loop",
		taskFile: ".ralph/test-loop/task.md",
		progressFile: ".ralph/test-loop/progress.md",
		reflectionFile: ".ralph/test-loop/reflection.md",
		iteration: 1,
		maxIterations: 50,
		itemsPerIteration: 0,
		reflectEvery: 0,
		reflectInstructions:
			"REFLECTION CHECKPOINT\n\nPause and reflect on your progress.",
		active: true,
		status: "active",
		startedAt: "2026-04-30T10:00:00.000Z",
		lastReflectionAt: 0,
		...overrides,
	};
}

/**
 * Создать временную директорию с .ralph/ для тестов.
 * Возвращает путь к cwd и cleanup-функцию.
 */
export function createTempRalphDir(): {
	cwd: string;
	ralphDir: string;
	cleanup: () => void;
} {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-test-"));
	const ralphDir = path.join(cwd, ".ralph");
	fs.mkdirSync(ralphDir, { recursive: true });
	return {
		cwd,
		ralphDir,
		cleanup: () => {
			fs.rmSync(cwd, { recursive: true, force: true });
		},
	};
}

/**
 * Записать файл в ralph-директорию.
 */
export function writeRalphFile(
	ralphDir: string,
	filename: string,
	content: string,
): string {
	const filePath = path.join(ralphDir, filename);
	fs.writeFileSync(filePath, content, "utf-8");
	return filePath;
}

/**
 * Прочитать файл из ralph-директории. Возвращает null если не найден.
 */
export function readRalphFile(
	ralphDir: string,
	filename: string,
): string | null {
	const filePath = path.join(ralphDir, filename);
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Создать мок ExtensionContext для spawn-режима.
 * Использует реальную файловую систему (tmpdir).
 */
export function createSpawnMockContext(
	cwd: string,
	overrides: Record<string, unknown> = {},
) {
	return createMockContext({
		cwd,
		...overrides,
	} as any);
}
