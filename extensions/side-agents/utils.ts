/**
 * Общие утилиты для side-agents.
 *
 * Чистые функции + константы. Импортирует из shared где возможно.
 */

import type { AgentStatus } from "./types.js";
import { ALL_AGENT_STATUSES, DEFAULT_WAIT_STATES, TASK_PREVIEW_MAX_CHARS } from "./types.js";
import { sleep as sharedSleep, stringifyError as sharedStringifyError } from "../shared/async.js";
import { stripTerminalNoise, truncateWithEllipsis } from "../shared/text.js";

// Re-export из shared для удобства
export { sharedSleep as sleep, sharedStringifyError as stringifyError };
export { stripTerminalNoise, truncateWithEllipsis };

export function nowIso(): string {
	return new Date().toISOString();
}

export function isTerminalStatus(status: AgentStatus): boolean {
	return status === "done" || status === "failed" || status === "crashed";
}

export function summarizeTask(task: string): string {
	const collapsed = stripTerminalNoise(task).replace(/\s+/g, " ").trim();
	return truncateWithEllipsis(collapsed, TASK_PREVIEW_MAX_CHARS);
}

export function sanitizeSlug(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter(Boolean)
		.slice(0, 3)
		.join("-");
}

export function slugFromTask(task: string): string {
	const stopWords = new Set([
		"a", "an", "the", "to", "in", "on", "at", "of", "for",
		"and", "or", "is", "it", "be", "do", "with",
	]);
	const words = task
		.replace(/[^a-zA-Z0-9\s]/g, " ")
		.split(/\s+/)
		.map((w) => w.toLowerCase())
		.filter((w) => w.length > 0 && !stopWords.has(w));
	const slug = words.slice(0, 3).join("-");
	return slug || "agent";
}

export function deduplicateSlug(slug: string, existing: Set<string>): string {
	if (!existing.has(slug)) return slug;
	for (let i = 2; ; i++) {
		const candidate = `${slug}-${i}`;
		if (!existing.has(candidate)) return candidate;
	}
}

export function normalizeAgentId(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	const firstToken = trimmed.split(/\s+/, 1)[0];
	return firstToken ?? "";
}

export function normalizeWaitStates(input?: string[]): { values: AgentStatus[]; error?: string } {
	if (!input || input.length === 0) {
		return { values: DEFAULT_WAIT_STATES };
	}

	const trimmed = [...new Set(input.map((value) => value.trim()).filter(Boolean))];
	if (trimmed.length === 0) {
		return { values: DEFAULT_WAIT_STATES };
	}

	const known = new Set<AgentStatus>(ALL_AGENT_STATUSES);
	const invalid = trimmed.filter((value) => !known.has(value as AgentStatus));
	if (invalid.length > 0) {
		return {
			values: [],
			error: `Unknown status value(s): ${invalid.join(", ")}`,
		};
	}

	return {
		values: trimmed as AgentStatus[],
	};
}

export function statusShort(status: AgentStatus): string {
	switch (status) {
		case "allocating_worktree":
			return "alloc";
		case "spawning_tmux":
			return "tmux";
		case "running":
			return "run";
		case "waiting_user":
			return "wait";
		case "done":
			return "done";
		case "failed":
			return "fail";
		case "crashed":
			return "crash";
	}
}

export function statusColorRole(status: AgentStatus): "warning" | "muted" | "accent" | "error" {
	switch (status) {
		case "allocating_worktree":
		case "spawning_tmux":
			return "warning";
		case "running":
		case "done":
			return "muted";
		case "waiting_user":
			return "accent";
		case "failed":
		case "crashed":
			return "error";
	}
}
