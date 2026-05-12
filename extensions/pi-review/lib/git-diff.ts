/**
 * Сбор git diff для контекста ревью.
 *
 * Запускает `git diff HEAD` и `git diff --cached`, объединяет результат
 * и обрезает до заданного лимита строк с warning.
 */

import { execSync } from "node:child_process";

/** Лимит строк diff по умолчанию. */
export const DEFAULT_DIFF_MAX_LINES = 2000;

export interface GitDiffOptions {
	/** Рабочая директория (корень проекта). */
	cwd: string;
	/** Максимальное количество строк diff. По умолчанию 2000. */
	maxLines?: number;
}

export interface GitDiffResult {
	/** Содержимое diff (может быть обрезано). */
	diff: string;
	/** Было ли обрезано. */
	truncated: boolean;
	/** Исходное количество строк (до обрезки). */
	totalLines: number;
}

/**
 * Собирает git diff (рабочая директория + staged) и обрезает до maxLines.
 * Возвращает null, если cwd не git-репозиторий или diff пуст.
 */
export function collectGitDiff(options: GitDiffOptions): GitDiffResult | null {
	const { cwd, maxLines = DEFAULT_DIFF_MAX_LINES } = options;

	const parts: string[] = [];

	// git diff HEAD (незафиксированные изменения — рабочая директория + staged)
	try {
		const headDiff = execSync("git diff HEAD", {
			cwd,
			encoding: "utf-8",
			timeout: 10_000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		if (headDiff) parts.push(headDiff);
	} catch {
		// Не git-репозиторий или нет HEAD — пробуем только --cached
		try {
			const cachedDiff = execSync("git diff --cached", {
				cwd,
				encoding: "utf-8",
				timeout: 10_000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim();
			if (cachedDiff) parts.push(cachedDiff);
		} catch {
			return null;
		}
	}

	const combined = parts.join("\n\n");
	if (!combined) return null;

	const lines = combined.split("\n");
	const totalLines = lines.length;

	if (totalLines <= maxLines) {
		return { diff: combined, truncated: false, totalLines };
	}

	const truncatedDiff = lines.slice(0, maxLines).join("\n");
	return { diff: truncatedDiff, truncated: true, totalLines };
}
