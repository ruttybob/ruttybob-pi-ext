/**
 * Status-poll для side-agents.
 *
 * Poller coordination, dedup, transitions, render.
 * Hot-reload-safe логика.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { fileExists, readJsonFile } from "../shared/fs.js";
import { isTerminalStatus, nowIso, statusShort, statusColorRole, normalizeAgentId, summarizeTask } from "./utils.js";
import type { AgentRecord, AgentStatusSnapshot, StatusTransitionNotice, ThemeForeground, ExitMarker, RegistryFile } from "./types.js";
import { STATUS_UPDATE_MESSAGE_TYPE, STATUS_KEY, ENV_STATE_ROOT, ENV_AGENT_ID } from "./types.js";
import { emptyRegistry, getMetaDir, mutateRegistry } from "./registry.js";
import { resolveGitRoot } from "./git.js";
import { tmuxWindowExists, tmuxCaptureVisible } from "./tmux.js";
import { collectRecentBacklogLines, selectBacklogTailLines, sanitizeBacklogLines } from "./backlog.js";
import { cleanupWorktreeLockBestEffort } from "./worktree.js";

const POLLER_COORD_FILE = join(os.tmpdir(), "pi-side-agent-poller.json");
const DEDUP_FILE = join(os.tmpdir(), "pi-side-agent-dedup.json");
const EMIT_DEDUP_WINDOW_MS = 2000;

let pollerGeneration = 0;
let statusPollTimer: NodeJS.Timeout | undefined;
let statusPollContext: ExtensionContext | undefined;
let statusPollApi: ExtensionAPI | undefined;
let statusPollInFlight = false;

const statusSnapshotsByStateRoot = new Map<string, Map<string, AgentStatusSnapshot>>();
let lastRenderedStatusLine: string | undefined;

export function collectStatusTransitions(
	stateRoot: string,
	agents: AgentRecord[],
): StatusTransitionNotice[] {
	const previous = statusSnapshotsByStateRoot.get(stateRoot);
	const next = new Map<string, AgentStatusSnapshot>();
	const transitions: StatusTransitionNotice[] = [];

	for (const record of agents) {
		const currentSnapshot: AgentStatusSnapshot = {
			status: record.status,
			tmuxWindowIndex: record.tmuxWindowIndex,
		};
		next.set(record.id, currentSnapshot);

		const previousSnapshot = previous?.get(record.id);
		if (!previousSnapshot || previousSnapshot.status === record.status) continue;
		transitions.push({
			id: record.id,
			fromStatus: previousSnapshot.status,
			toStatus: record.status,
			tmuxWindowIndex: record.tmuxWindowIndex ?? previousSnapshot.tmuxWindowIndex,
		});
	}

	if (previous) {
		for (const [agentId, previousSnapshot] of previous.entries()) {
			if (next.has(agentId)) continue;
			if (isTerminalStatus(previousSnapshot.status)) continue;
			transitions.push({
				id: agentId,
				fromStatus: previousSnapshot.status,
				toStatus: "done",
				tmuxWindowIndex: previousSnapshot.tmuxWindowIndex,
			});
		}
	}

	statusSnapshotsByStateRoot.set(stateRoot, next);
	if (!previous) return [];
	return transitions.sort((a, b) => a.id.localeCompare(b.id));
}

function formatStatusWord(status: string, theme?: ThemeForeground): string {
	if (!theme) return status;
	return theme.fg(statusColorRole(status as any), status);
}

function formatStatusTransitionMessage(transition: StatusTransitionNotice, theme?: ThemeForeground): string {
	const win = transition.tmuxWindowIndex !== undefined ? ` (tmux #${transition.tmuxWindowIndex})` : "";
	const from = formatStatusWord(transition.fromStatus, theme);
	const to = formatStatusWord(transition.toStatus, theme);
	return `side-agent ${transition.id}: ${from} -> ${to}${win}`;
}

function isChildRuntime(): boolean {
	return Boolean(process.env[ENV_AGENT_ID]);
}

export function emitStatusTransitions(pi: ExtensionAPI, ctx: ExtensionContext, transitions: StatusTransitionNotice[]): void {
	if (isChildRuntime()) return;

	for (const transition of transitions) {
		const key = `${transition.id}:${transition.fromStatus}->${transition.toStatus}`;
		const now = Date.now();
		let deduped = false;
		try {
			const raw = readFileSync(DEDUP_FILE, "utf8");
			const d = JSON.parse(raw);
			if (d.key === key && now - d.at < EMIT_DEDUP_WINDOW_MS) deduped = true;
		} catch { /* file doesn't exist yet */ }
		if (deduped) continue;
		try {
			writeFileSync(DEDUP_FILE, JSON.stringify({ key, at: now }));
		} catch { /* best effort */ }
		const message = formatStatusTransitionMessage(transition, ctx.hasUI ? ctx.ui.theme : undefined);
		pi.sendMessage(
			{
				customType: STATUS_UPDATE_MESSAGE_TYPE,
				content: message,
				display: true,
				details: {
					agentId: transition.id,
					fromStatus: transition.fromStatus,
					toStatus: transition.toStatus,
					tmuxWindowIndex: transition.tmuxWindowIndex,
					emittedAt: Date.now(),
				},
			},
			{
				triggerTurn: false,
				deliverAs: "followUp",
			},
		);

		if (ctx.hasUI && (transition.toStatus === "failed" || transition.toStatus === "crashed")) {
			ctx.ui.notify(message, "error");
		}
	}
}

export function isLatestGeneration(): boolean {
	try {
		const raw = readFileSync(POLLER_COORD_FILE, "utf8");
		return JSON.parse(raw).generation === pollerGeneration;
	} catch {
		return true;
	}
}

export function getStateRoot(ctx: ExtensionContext): string {
	const fromEnv = process.env[ENV_STATE_ROOT];
	if (fromEnv) return resolve(fromEnv);
	return resolveGitRoot(ctx.cwd);
}

async function refreshOneAgentRuntime(stateRoot: string, record: AgentRecord): Promise<{ removeFromRegistry: boolean }> {
	if (record.status === "done") {
		await cleanupWorktreeLockBestEffort(record.worktreePath, record.id);
		return { removeFromRegistry: true };
	}

	if (record.exitFile && (await fileExists(record.exitFile))) {
		const exit = (await readJsonFile<ExitMarker>(record.exitFile)) ?? {};
		if (typeof exit.exitCode === "number") {
			record.exitCode = exit.exitCode;
			record.finishedAt = exit.finishedAt ?? record.finishedAt ?? nowIso();
			if (record.status !== (exit.exitCode === 0 ? "done" : "failed")) {
				record.status = exit.exitCode === 0 ? "done" : "failed";
				record.updatedAt = nowIso();
			} else {
				record.updatedAt = nowIso();
			}
			if (exit.exitCode === 0) {
				await cleanupWorktreeLockBestEffort(record.worktreePath, record.id);
				return { removeFromRegistry: true };
			}
			return { removeFromRegistry: false };
		}
	}

	if (!record.tmuxWindowId) {
		return { removeFromRegistry: false };
	}

	const live = tmuxWindowExists(record.tmuxWindowId);
	if (live) {
		if (record.status === "allocating_worktree" || record.status === "spawning_tmux") {
			record.status = "running";
			record.updatedAt = nowIso();
		}
		return { removeFromRegistry: false };
	}

	if (!isTerminalStatus(record.status)) {
		record.finishedAt = record.finishedAt ?? nowIso();
		record.status = "crashed";
		record.updatedAt = nowIso();
		if (!record.error) {
			record.error = "tmux window disappeared before an exit marker was recorded";
		}
	}

	return { removeFromRegistry: false };
}

async function refreshAgent(stateRoot: string, agentId: string): Promise<AgentRecord | undefined> {
	let snapshot: AgentRecord | undefined;
	await mutateRegistry(stateRoot, async (registry) => {
		const record = registry.agents[agentId];
		if (!record) return;
		const refreshed = await refreshOneAgentRuntime(stateRoot, record);
		if (refreshed.removeFromRegistry) {
			delete registry.agents[agentId];
			return;
		}
		snapshot = JSON.parse(JSON.stringify(record)) as AgentRecord;
	});
	return snapshot;
}

async function refreshAllAgents(stateRoot: string): Promise<RegistryFile> {
	if (!(await fileExists(getMetaDir(stateRoot)))) return emptyRegistry();
	return mutateRegistry(stateRoot, async (registry) => {
		for (const [agentId, record] of Object.entries(registry.agents)) {
			const refreshed = await refreshOneAgentRuntime(stateRoot, record);
			if (refreshed.removeFromRegistry) {
				delete registry.agents[agentId];
			}
		}
	});
}

async function getBacklogTail(record: AgentRecord, lines = 10): Promise<string[]> {
	if (record.tmuxWindowId && tmuxWindowExists(record.tmuxWindowId)) {
		const visible = tmuxCaptureVisible(record.tmuxWindowId);
		const result = sanitizeBacklogLines(collectRecentBacklogLines(visible, lines));
		if (result.length > 0) return result;
	}

	if (record.logPath && (await fileExists(record.logPath))) {
		try {
			const raw = await fs.readFile(record.logPath, "utf8");
			const tailed = sanitizeBacklogLines(selectBacklogTailLines(raw, lines));
			if (tailed.length > 0) return tailed;
		} catch {
			// fall through
		}
	}

	return [];
}

export async function agentCheckPayload(stateRoot: string, agentId: string): Promise<Record<string, unknown>> {
	const normalizedId = normalizeAgentId(agentId);
	if (!normalizedId) {
		return { ok: false, error: "No agent id was provided" };
	}

	const record = await refreshAgent(stateRoot, normalizedId);
	if (!record) {
		return { ok: false, error: `Unknown agent id: ${normalizedId}` };
	}

	const backlog = await getBacklogTail(record, 10);

	return {
		ok: true,
		agent: {
			id: record.id,
			status: record.status,
			tmuxWindowId: record.tmuxWindowId,
			tmuxWindowIndex: record.tmuxWindowIndex,
			worktreePath: record.worktreePath,
			branch: record.branch,
			task: summarizeTask(record.task),
			startedAt: record.startedAt,
			finishedAt: record.finishedAt,
			exitCode: record.exitCode,
			error: record.error,
			warnings: record.warnings ?? [],
		},
		backlog,
	};
}

export async function renderStatusLine(pi: ExtensionAPI, ctx: ExtensionContext, options?: { emitTransitions?: boolean }): Promise<void> {
	if (!ctx.hasUI) return;

	const stateRoot = getStateRoot(ctx);
	const refreshed = await refreshAllAgents(stateRoot);
	const agents = Object.values(refreshed.agents).sort((a, b) => a.id.localeCompare(b.id));

	if (options?.emitTransitions ?? true) {
		const isCurrentGen = isLatestGeneration();
		const transitions = collectStatusTransitions(stateRoot, agents);
		if (transitions.length > 0 && isCurrentGen) {
			emitStatusTransitions(pi, ctx, transitions);
		}
	} else if (!statusSnapshotsByStateRoot.has(stateRoot)) {
		collectStatusTransitions(stateRoot, agents);
	}

	const selfId = process.env[ENV_AGENT_ID];
	const visible = selfId ? agents.filter((r) => r.id !== selfId) : agents;

	if (visible.length === 0) {
		if (lastRenderedStatusLine !== undefined) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			lastRenderedStatusLine = undefined;
		}
		return;
	}

	const theme = ctx.ui.theme;
	const line = visible
		.map((record) => {
			const win = record.tmuxWindowIndex !== undefined ? `@${record.tmuxWindowIndex}` : "";
			const entry = `${record.id}:${statusShort(record.status)}${win}`;
			return theme.fg(statusColorRole(record.status), entry);
		})
		.join(" ");

	if (line === lastRenderedStatusLine) return;
	ctx.ui.setStatus(STATUS_KEY, line);
	lastRenderedStatusLine = line;
}

export function ensureStatusPoller(pi: ExtensionAPI, ctx: ExtensionContext): void {
	statusPollContext = ctx;
	statusPollApi = pi;
	if (!ctx.hasUI) return;

	try {
		const raw = readFileSync(POLLER_COORD_FILE, "utf8");
		pollerGeneration = (JSON.parse(raw).generation ?? 0) + 1;
	} catch {
		pollerGeneration = 1;
	}
	try {
		writeFileSync(POLLER_COORD_FILE, JSON.stringify({
			generation: pollerGeneration,
			pid: process.pid,
			createdAt: Date.now(),
		}));
	} catch { /* best effort */ }

	if (!statusPollTimer) {
		const myGen = pollerGeneration;
		statusPollTimer = setInterval(() => {
			try {
				const raw = readFileSync(POLLER_COORD_FILE, "utf8");
				if (JSON.parse(raw).generation !== myGen) return;
			} catch { /* file gone — we're the only one */ }
			if (statusPollInFlight || !statusPollContext || !statusPollApi) return;
			statusPollInFlight = true;
			void renderStatusLine(statusPollApi, statusPollContext)
				.catch(() => {})
				.finally(() => {
					statusPollInFlight = false;
				});
		}, 2500);
		statusPollTimer.unref();
	}

	void renderStatusLine(pi, ctx).catch(() => {});
}

export function getStatusPollContext(): ExtensionContext | undefined {
	return statusPollContext;
}

export function getStatusPollApi(): ExtensionAPI | undefined {
	return statusPollApi;
}

export function setStatusPollContext(ctx: ExtensionContext): void {
	statusPollContext = ctx;
}

export function setStatusPollApi(api: ExtensionAPI): void {
	statusPollApi = api;
}
