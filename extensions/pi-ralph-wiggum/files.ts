/**
 * Файловые операции для Ralph Wiggum.
 * Управление task/progress/reflection/state файлами.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const RALPH_DIR = ".ralph";

/** Маркер завершения цикла. */
export const COMPLETE_MARKER = "<promise>COMPLETE</promise>";

/** Шаблон задачи по умолчанию. */
export const DEFAULT_TEMPLATE = `# Task

Describe your task here.

## Goals
- Goal 1
- Goal 2

## Checklist
- [ ] Item 1
- [ ] Item 2

## Notes
(Update this as you work)
`;

/** Инструкции рефлексии по умолчанию. */
export const DEFAULT_REFLECT_INSTRUCTIONS = `REFLECTION CHECKPOINT

Pause and reflect on your progress:
1. What has been accomplished so far?
2. What's working well?
3. What's not working or blocking progress?
4. Should the approach be adjusted?
5. What are the next priorities?

Update the task file with your reflection, then continue working.`;

// --- Sanitize ---

export function sanitize(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
}

// --- Canonical file name mapping ---

export const FILE_NAMES: Record<string, string> = {
	".md": "task.md",
	".progress.md": "progress.md",
	".reflection.md": "reflection.md",
	".state.json": "state.json",
};

// --- Path helpers ---

export function getRalphDir(cwd: string): string {
	return path.resolve(cwd, RALPH_DIR);
}

export function getArchiveDir(cwd: string): string {
	return path.join(getRalphDir(cwd), "archive");
}

/** Returns the loop's subdirectory path. */
export function getLoopDir(
	cwd: string,
	name: string,
	archived = false,
): string {
	const base = archived ? getArchiveDir(cwd) : getRalphDir(cwd);
	return path.join(base, sanitize(name));
}

export function getPath(
	cwd: string,
	name: string,
	ext: string,
	archived = false,
): string {
	const base = archived ? getArchiveDir(cwd) : getRalphDir(cwd);
	const fileName = FILE_NAMES[ext] ?? ext;
	return path.join(base, sanitize(name), fileName);
}

// --- File I/O helpers ---

export function ensureDir(filePath: string): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function tryDelete(filePath: string): void {
	try {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	} catch {
		/* ignore */
	}
}

export function tryRead(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function safeMtimeMs(filePath: string): number {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return 0;
	}
}

export function tryRemoveDir(dirPath: string): boolean {
	try {
		if (fs.existsSync(dirPath)) {
			fs.rmSync(dirPath, { recursive: true, force: true });
		}
		return true;
	} catch {
		return false;
	}
}

// --- Template builders ---

export function buildProgressTemplate(loopName: string): string {
	return `# Progress: ${loopName}

## Completed
(none yet)

## Current Focus
- Starting first iteration

## Blockers
(none)

## Key Decisions
(none yet)
`;
}

export function buildReflectionTemplate(loopName: string): string {
	return `# Reflection Log: ${loopName}

(Reflections will be appended here after each reflection checkpoint)
`;
}
