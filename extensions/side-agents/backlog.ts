/**
 * Backlog-утилиты для side-agents.
 *
 * Чистые функции: strip, sanitize, tail, select, collect.
 */

import { stripTerminalNoise, truncateWithEllipsis, splitLines } from "../shared/text.js";
import { BACKLOG_LINE_MAX_CHARS, BACKLOG_TOTAL_MAX_CHARS } from "./types.js";

const BACKLOG_SEPARATOR_RE = /^[-─—_=]{5,}$/u;

export function isBacklogSeparatorLine(line: string): boolean {
	return BACKLOG_SEPARATOR_RE.test(line.trim());
}

export { stripTerminalNoise, splitLines };

export function selectBacklogTailLines(text: string, minimumLines: number): string[] {
	return collectRecentBacklogLines(splitLines(text), minimumLines);
}

export function collectRecentBacklogLines(lines: string[], minimumLines: number): string[] {
	if (minimumLines <= 0) return [];

	const selected: string[] = [];
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const cleaned = stripTerminalNoise(lines[i]).trimEnd();
		if (cleaned.length === 0) continue;
		if (isBacklogSeparatorLine(cleaned)) continue;
		selected.push(lines[i]);
		if (selected.length >= minimumLines) break;
	}

	return selected.reverse();
}

export function sanitizeBacklogLines(
	lines: string[],
	lineMax = BACKLOG_LINE_MAX_CHARS,
	totalMax = BACKLOG_TOTAL_MAX_CHARS,
): string[] {
	const out: string[] = [];
	let remaining = totalMax;

	for (const raw of lines) {
		if (remaining <= 0) break;
		const cleaned = stripTerminalNoise(raw).trimEnd();
		if (cleaned.length === 0) continue;
		if (isBacklogSeparatorLine(cleaned)) continue;

		const line = truncateWithEllipsis(cleaned, lineMax);
		if (line.length <= remaining) {
			out.push(line);
			remaining -= line.length + 1;
			continue;
		}

		out.push(truncateWithEllipsis(line, remaining));
		remaining = 0;
		break;
	}

	return out;
}
