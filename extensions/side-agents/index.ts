/**
 * side-agents extension — entry point.
 *
 * Только регистрации tools/commands и event handlers.
 * Вся бизнес-логика делегирована модулям.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { promises as fs } from "node:fs";
import os from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { sleep, stringifyError, nowIso, isTerminalStatus, sanitizeSlug, slugFromTask, deduplicateSlug, normalizeAgentId, normalizeWaitStates, statusColorRole } from "./utils.js";
import type { AgentStatus, AgentRecord, StartAgentParams, StartAgentResult, PrepareRuntimeDirResult, ThemeForeground } from "./types.js";
import { CHILD_LINK_ENTRY_TYPE, PROMPT_UPDATE_MESSAGE_TYPE, ENV_AGENT_ID, ENV_PARENT_SESSION } from "./types.js";
import { ensureDir, fileExists, readJsonFile, atomicWrite } from "../shared/fs.js";
import { shellQuote, run, runOrThrow } from "../shared/git.js";
import { splitLines, tailLines } from "../shared/text.js";
import { resolveGitRoot, existingAgentIds } from "./git.js";
import { ensureTmuxReady, getCurrentTmuxSession, createTmuxWindow, tmuxPipePaneToFile, tmuxInterrupt, tmuxSendPrompt, tmuxWindowExists } from "./tmux.js";
import { ensureDir as ensureDirRegistry, getMetaDir, getRuntimeDir, getRuntimeArchiveBaseDir, runtimeArchiveStamp, loadRegistry, saveRegistry, mutateRegistry, getRegistryPath } from "./registry.js";
import { allocateWorktree, writeWorktreeLock, updateWorktreeLock, cleanupWorktreeLockBestEffort, scanOrphanWorktreeLocks, reclaimOrphanWorktreeLocks, summarizeOrphanLock } from "./worktree.js";
import { collectRecentBacklogLines, sanitizeBacklogLines, stripTerminalNoise } from "./backlog.js";
import {
	collectStatusTransitions,
	emitStatusTransitions,
	isLatestGeneration,
	renderStatusLine,
	ensureStatusPoller,
	agentCheckPayload,
	getStateRoot,
	getStatusPollContext,
	getStatusPollApi,
	setStatusPollContext,
	setStatusPollApi,
} from "./status-poll.js";

// ---------------------------------------------------------------------------
// Вспомогательные функции, оставшиеся в index (не вошли в модули)
// ---------------------------------------------------------------------------

const PROMPT_LOG_PREFIX = "[side-agent][prompt]";

function resolveBacklogPathForRecord(stateRoot: string, record: AgentRecord): string {
	if (record.logPath) return record.logPath;
	if (record.runtimeDir) return join(record.runtimeDir, "backlog.log");
	return join(getRuntimeDir(stateRoot, record.id), "backlog.log");
}

async function appendKickoffPromptToBacklog(
	stateRoot: string,
	record: AgentRecord,
	prompt: string,
	loggedAt = nowIso(),
): Promise<void> {
	const backlogPath = resolveBacklogPathForRecord(stateRoot, record);
	const promptLines = prompt.replace(/\r\n?/g, "\n").split("\n");
	const body = promptLines
		.map((line) => `${PROMPT_LOG_PREFIX} ${loggedAt} ${record.id}: ${line}`)
		.join("\n");
	const payload =
		`${PROMPT_LOG_PREFIX} ${loggedAt} ${record.id}: kickoff prompt begin\n` +
		`${body}\n` +
		`${PROMPT_LOG_PREFIX} ${loggedAt} ${record.id}: kickoff prompt end\n`;

	try {
		await ensureDir(dirname(backlogPath));
		await fs.appendFile(backlogPath, payload, "utf8");
		record.logPath = record.logPath ?? backlogPath;
		record.runtimeDir = record.runtimeDir ?? dirname(backlogPath);
	} catch {
		// Best effort only; prompt logging must not block agent startup.
	}
}

async function setRecordStatus(_stateRoot: string, record: AgentRecord, nextStatus: AgentStatus): Promise<boolean> {
	const previousStatus = record.status;
	if (previousStatus === nextStatus) return false;
	record.status = nextStatus;
	record.updatedAt = nowIso();
	return true;
}

async function prepareFreshRuntimeDir(stateRoot: string, agentId: string): Promise<PrepareRuntimeDirResult> {
	const runtimeDir = getRuntimeDir(stateRoot, agentId);
	if (!(await fileExists(runtimeDir))) {
		await ensureDir(runtimeDir);
		return { runtimeDir };
	}

	const archiveBaseDir = getRuntimeArchiveBaseDir(stateRoot, agentId);
	const archiveDir = join(
		archiveBaseDir,
		`${runtimeArchiveStamp()}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`,
	);

	try {
		await ensureDir(archiveBaseDir);
		await fs.rename(runtimeDir, archiveDir);
		await ensureDir(runtimeDir);
		return { runtimeDir, archivedRuntimeDir: archiveDir };
	} catch (archiveErr) {
		const archiveErrMessage = stringifyError(archiveErr);
		try {
			await fs.rm(runtimeDir, { recursive: true, force: true });
			await ensureDir(runtimeDir);
		} catch (cleanupErr) {
			throw new Error(
				`Failed to prepare runtime dir ${runtimeDir}: archive failed (${archiveErrMessage}); cleanup failed (${stringifyError(cleanupErr)})`,
			);
		}
		return {
			runtimeDir,
			warning: `Failed to archive existing runtime dir for ${agentId}: ${archiveErrMessage}. Removed stale runtime directory instead.`,
		};
	}
}

async function buildKickoffPrompt(ctx: ExtensionContext, task: string, _includeSummary: boolean): Promise<{ prompt: string; warning?: string }> {
	const parentSession = ctx.sessionManager.getSessionFile();

	const prompt = [
		task,
		"",
		"## Parent session",
		parentSession ? `- ${parentSession}` : "- (unknown)",
		"",
		"If you need context from the parent conversation, use the session_query tool",
		"with the parent session path above to look up specific information.",
	].join("\n");

	return { prompt };
}

function buildLaunchScript(params: {
	agentId: string;
	parentSessionId?: string;
	parentRepoRoot: string;
	stateRoot: string;
	worktreePath: string;
	tmuxWindowId: string;
	promptPath: string;
	exitFile: string;
	modelSpec?: string;
	runtimeDir: string;
}): string {
	return `#!/usr/bin/env bash
set -euo pipefail

AGENT_ID=${shellQuote(params.agentId)}
PARENT_SESSION=${shellQuote(params.parentSessionId ?? "")}
PARENT_REPO=${shellQuote(params.parentRepoRoot)}
STATE_ROOT=${shellQuote(params.stateRoot)}
WORKTREE=${shellQuote(params.worktreePath)}
WINDOW_ID=${shellQuote(params.tmuxWindowId)}
PROMPT_FILE=${shellQuote(params.promptPath)}
EXIT_FILE=${shellQuote(params.exitFile)}
MODEL_SPEC=${shellQuote(params.modelSpec ?? "")}
RUNTIME_DIR=${shellQuote(params.runtimeDir)}
START_SCRIPT="$WORKTREE/.pi/side-agent-start.sh"
CHILD_SKILLS_DIR="$WORKTREE/.pi/side-agent-skills"

export PI_SIDE_AGENT_ID="$AGENT_ID"
export PI_SIDE_PARENT_SESSION="$PARENT_SESSION"
export PI_SIDE_PARENT_REPO="$PARENT_REPO"
export PI_SIDE_AGENTS_ROOT="$STATE_ROOT"
export PI_SIDE_RUNTIME_DIR="$RUNTIME_DIR"

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

write_exit() {
  local code="$1"
  printf '{"exitCode":%d,"finishedAt":"%s"}\n' "$code" "$(iso_now)" > "$EXIT_FILE"
}

cd "$WORKTREE"

if [[ -x "$START_SCRIPT" ]]; then
  set +e
  source "$START_SCRIPT" "$PARENT_REPO" "$WORKTREE" "$AGENT_ID"
  start_exit=$?
  set -e
  if [[ "$start_exit" -ne 0 ]]; then
    echo "[side-agent] start script failed with code $start_exit"
    write_exit "$start_exit"
    tmux kill-window -t "$WINDOW_ID" || true
    exit "$start_exit"
  fi
fi

PI_CMD=(pi)
if [[ -n "$MODEL_SPEC" ]]; then
  PI_CMD+=(--model "$MODEL_SPEC")
fi
if [[ -d "$CHILD_SKILLS_DIR" ]]; then
  PI_CMD+=(--skill "$CHILD_SKILLS_DIR")
fi

set +e
"\${PI_CMD[@]}" "$(cat "$PROMPT_FILE")"
exit_code=$?
set -e

write_exit "$exit_code"

if [[ "$exit_code" -eq 0 ]]; then
  echo "[side-agent] Agent finished."
else
  echo "[side-agent] Agent exited with code $exit_code."
fi

tmux kill-window -t "$WINDOW_ID" || true
`;
}

// ---------------------------------------------------------------------------
// Model resolution helpers
// ---------------------------------------------------------------------------

type ModeFileSpec = { provider?: string; modelId?: string; thinkingLevel?: string };
type ParsedModesFile = { currentMode?: string; modes?: Record<string, ModeFileSpec> };

async function readModesFile(cwd: string): Promise<{ parsed: ParsedModesFile; path: string } | undefined> {
	const homedir = os.homedir();
	const agentDir = process.env.PI_CODING_AGENT_DIR
		? resolve(process.env.PI_CODING_AGENT_DIR.replace(/^~/, homedir))
		: join(homedir, ".pi", "agent");

	const candidates = [
		join(cwd, ".pi", "modes.json"),
		join(agentDir, "modes.json"),
	];

	for (const modesPath of candidates) {
		try {
			const raw = await fs.readFile(modesPath, "utf8");
			const parsed = JSON.parse(raw) as ParsedModesFile;
			if (parsed.modes && typeof parsed.modes === "object" && Object.keys(parsed.modes).length > 0) {
				return { parsed, path: modesPath };
			}
		} catch {
			continue;
		}
	}
	return undefined;
}

function modeSpecToModelSpec(spec: ModeFileSpec): string | undefined {
	if (!spec.provider || !spec.modelId) return undefined;
	return spec.thinkingLevel
		? `${spec.provider}/${spec.modelId}:${spec.thinkingLevel}`
		: `${spec.provider}/${spec.modelId}`;
}

async function resolveModeToModelSpec(cwd: string, modeName: string): Promise<{ modelSpec?: string; warning?: string }> {
	const file = await readModesFile(cwd);
	if (!file) return { warning: "Could not read modes.json" };
	if (!file.parsed.modes?.[modeName]) {
		return { warning: `Mode '${modeName}' not found in ${file.path}` };
	}
	const modelSpec = modeSpecToModelSpec(file.parsed.modes[modeName]);
	if (!modelSpec) {
		return { warning: `Mode '${modeName}' has no provider/modelId in ${file.path}` };
	}
	return { modelSpec };
}

async function inferCurrentModeModelSpec(
	cwd: string,
	ctx: ExtensionContext,
	thinkingLevel: string,
): Promise<string | undefined> {
	if (!ctx.model) return undefined;
	const file = await readModesFile(cwd);
	if (!file?.parsed.modes) return undefined;

	const provider = ctx.model.provider;
	const modelId = ctx.model.id;

	for (const spec of Object.values(file.parsed.modes)) {
		if (spec.provider === provider && spec.modelId === modelId &&
			(spec.thinkingLevel ?? undefined) === (thinkingLevel || undefined)) {
			return modeSpecToModelSpec(spec);
		}
	}

	return undefined;
}

function parseAgentCommandArgs(raw: string): { task: string; model?: string; mode?: string } {
	let rest = raw;
	let model: string | undefined;
	let mode: string | undefined;

	const modelMatch = rest.match(/(?:^|\s)-model\s+(\S+)/);
	if (modelMatch) {
		model = modelMatch[1];
		rest = rest.replace(modelMatch[0], " ");
	}

	const modeMatch = rest.match(/(?:^|\s)-mode\s+(\S+)/);
	if (modeMatch) {
		mode = modeMatch[1];
		rest = rest.replace(modeMatch[0], " ");
	}

	return { task: rest.trim(), model, mode };
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function splitModelPatternAndThinking(raw: string): { pattern: string; thinking?: string } {
	const trimmed = raw.trim();
	const colon = trimmed.lastIndexOf(":");
	if (colon <= 0 || colon === trimmed.length - 1) return { pattern: trimmed };
	const suffix = trimmed.slice(colon + 1);
	if (!THINKING_LEVELS.has(suffix)) return { pattern: trimmed };
	return { pattern: trimmed.slice(0, colon), thinking: suffix };
}

function withThinking(modelSpec: string, thinking?: string): string {
	return thinking ? `${modelSpec}:${thinking}` : modelSpec;
}

async function resolveModelSpecForChild(
	ctx: ExtensionContext,
	requested?: string,
	thinkingLevel?: string,
): Promise<{ modelSpec?: string; warning?: string }> {
	const currentModelSpec = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
	if (!requested || requested.trim().length === 0) {
		if (thinkingLevel !== undefined) {
			const modeSpec = await inferCurrentModeModelSpec(ctx.cwd, ctx, thinkingLevel);
			if (modeSpec) return { modelSpec: modeSpec };
		}
		return { modelSpec: currentModelSpec };
	}

	const trimmed = requested.trim();
	if (trimmed.includes("/")) {
		return { modelSpec: trimmed };
	}

	const { pattern, thinking } = splitModelPatternAndThinking(trimmed);

	if (ctx.model && pattern === ctx.model.id) {
		return { modelSpec: withThinking(`${ctx.model.provider}/${ctx.model.id}`, thinking) };
	}

	try {
		const available = (await ctx.modelRegistry.getAvailable()) as Array<{ provider: string; id: string }>;
		const exact = available.filter((model) => model.id === pattern);

		if (exact.length === 1) {
			const match = exact[0];
			return { modelSpec: withThinking(`${match.provider}/${match.id}`, thinking) };
		}

		if (exact.length > 1) {
			if (ctx.model) {
				const preferred = exact.find((model) => model.provider === ctx.model?.provider);
				if (preferred) {
					return { modelSpec: withThinking(`${preferred.provider}/${preferred.id}`, thinking) };
				}
			}
			const providers = [...new Set(exact.map((model) => model.provider))].sort();
			return {
				modelSpec: trimmed,
				warning: `Model '${pattern}' matches multiple providers (${providers.join(", ")}); child was started with raw pattern '${trimmed}'. Use provider/model to force a specific provider.`,
			};
		}
	} catch {
		// Best effort only
	}

	return { modelSpec: trimmed };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

async function startAgent(pi: ExtensionAPI, ctx: ExtensionContext, params: StartAgentParams): Promise<StartAgentResult> {
	ensureTmuxReady();

	const stateRoot = getStateRoot(ctx);
	const repoRoot = resolveGitRoot(stateRoot);
	const parentSessionId = ctx.sessionManager.getSessionFile();
	const now = nowIso();

	let agentId = "";
	let spawnedWindowId: string | undefined;
	let allocatedWorktreePath: string | undefined;
	let allocatedBranch: string | undefined;
	let aggregatedWarnings: string[] = [];

	try {
		await ensureDir(getMetaDir(stateRoot));

		let slug: string;
		if (params.branchHint) {
			slug = sanitizeSlug(params.branchHint);
			if (!slug) slug = slugFromTask(params.task);
		} else {
			slug = slugFromTask(params.task);
		}

		await mutateRegistry(stateRoot, async (registry) => {
			const existing = existingAgentIds(registry, repoRoot);
			agentId = deduplicateSlug(slug, existing);
			registry.agents[agentId] = {
				id: agentId,
				parentSessionId,
				task: params.task,
				model: params.model,
				status: "allocating_worktree",
				startedAt: now,
				updatedAt: now,
			};
		});

		const worktree = await allocateWorktree({
			repoRoot,
			stateRoot,
			agentId,
			parentSessionId,
		});
		allocatedWorktreePath = worktree.worktreePath;
		allocatedBranch = worktree.branch;
		aggregatedWarnings.push(...worktree.warnings);

		const runtimePrep = await prepareFreshRuntimeDir(stateRoot, agentId);
		const runtimeDir = runtimePrep.runtimeDir;
		if (runtimePrep.archivedRuntimeDir) {
			aggregatedWarnings.push(`Archived existing runtime dir for ${agentId}: ${runtimePrep.archivedRuntimeDir}`);
		}
		if (runtimePrep.warning) {
			aggregatedWarnings.push(runtimePrep.warning);
		}

		const promptPath = join(runtimeDir, "kickoff.md");
		const logPath = join(runtimeDir, "backlog.log");
		const exitFile = join(runtimeDir, "exit.json");
		const launchScriptPath = join(runtimeDir, "launch.sh");
		await atomicWrite(logPath, "");

		const kickoff = await buildKickoffPrompt(ctx, params.task, params.includeSummary);
		if (kickoff.warning) aggregatedWarnings.push(kickoff.warning);

		await atomicWrite(promptPath, kickoff.prompt + "\n");

		await mutateRegistry(stateRoot, async (registry) => {
			const record = registry.agents[agentId];
			if (!record) return;
			record.worktreePath = worktree.worktreePath;
			record.branch = worktree.branch;
			record.runtimeDir = runtimeDir;
			record.promptPath = promptPath;
			record.logPath = logPath;
			record.exitFile = exitFile;
			await setRecordStatus(stateRoot, record, "spawning_tmux");
			record.warnings = [...(record.warnings ?? []), ...worktree.warnings];
			await appendKickoffPromptToBacklog(stateRoot, record, kickoff.prompt);
		});

		const resolvedModel = await resolveModelSpecForChild(ctx, params.model, pi.getThinkingLevel());
		const modelSpec = resolvedModel.modelSpec;
		if (resolvedModel.warning) aggregatedWarnings.push(resolvedModel.warning);

		const tmuxSession = getCurrentTmuxSession();
		const { windowId, windowIndex } = createTmuxWindow(tmuxSession, `agent-${agentId}`);
		spawnedWindowId = windowId;

		const launchScript = buildLaunchScript({
			agentId,
			parentSessionId,
			parentRepoRoot: repoRoot,
			stateRoot,
			worktreePath: worktree.worktreePath,
			tmuxWindowId: windowId,
			promptPath,
			exitFile,
			modelSpec,
			runtimeDir,
		});
		await atomicWrite(launchScriptPath, launchScript);
		await fs.chmod(launchScriptPath, 0o755);

		await updateWorktreeLock(worktree.worktreePath, {
			tmuxWindowId: windowId,
			tmuxWindowIndex: windowIndex,
		});

		tmuxPipePaneToFile(windowId, logPath);
		await sleep(100);
		runOrThrow("tmux", ["send-keys", "-t", windowId, `bash ${shellQuote(launchScriptPath)}`, "C-m"]);

		await mutateRegistry(stateRoot, async (registry) => {
			const record = registry.agents[agentId];
			if (!record) return;
			record.tmuxSession = tmuxSession;
			record.tmuxWindowId = windowId;
			record.tmuxWindowIndex = windowIndex;
			record.worktreePath = worktree.worktreePath;
			record.branch = worktree.branch;
			record.runtimeDir = runtimeDir;
			record.promptPath = promptPath;
			record.logPath = logPath;
			record.exitFile = exitFile;
			record.model = modelSpec;
			await setRecordStatus(stateRoot, record, "running");
			record.warnings = [...(record.warnings ?? []), ...aggregatedWarnings];
		});

		const started: StartAgentResult = {
			id: agentId,
			tmuxWindowId: windowId,
			tmuxWindowIndex: windowIndex,
			worktreePath: worktree.worktreePath,
			branch: worktree.branch,
			warnings: aggregatedWarnings,
			prompt: kickoff.prompt,
		};
		emitKickoffPromptMessage(pi, started);

		return started;
	} catch (err) {
		if (spawnedWindowId) {
			run("tmux", ["kill-window", "-t", spawnedWindowId]);
		}

		if (agentId) {
			await mutateRegistry(stateRoot, async (registry) => {
				const record = registry.agents[agentId];
				if (!record) return;
				record.error = stringifyError(err);
				record.finishedAt = nowIso();
				const changed = await setRecordStatus(stateRoot, record, "failed");
				if (!changed) {
					record.updatedAt = nowIso();
				}
				if (allocatedWorktreePath) record.worktreePath = allocatedWorktreePath;
				if (allocatedBranch) record.branch = allocatedBranch;
				record.warnings = [...(record.warnings ?? []), ...aggregatedWarnings];
			});
		}

		throw err;
	}
}

async function sendToAgent(stateRoot: string, agentId: string, prompt: string): Promise<{ ok: boolean; message: string }> {
	const normalizedId = normalizeAgentId(agentId);
	if (!normalizedId) {
		return { ok: false, message: "No agent id was provided" };
	}

	const payload = await agentCheckPayload(stateRoot, normalizedId);
	if (!payload.ok) {
		return { ok: false, message: (payload.error as string) || `Unknown agent id: ${normalizedId}` };
	}
	const record = payload.agent as any;
	if (!record.tmuxWindowId) {
		return { ok: false, message: `Agent ${normalizedId} has no tmux window id recorded` };
	}
	if (!tmuxWindowExists(record.tmuxWindowId)) {
		return { ok: false, message: `Agent ${normalizedId} tmux window is not active` };
	}

	let sendPayload = prompt;
	if (sendPayload.startsWith("!")) {
		tmuxInterrupt(record.tmuxWindowId);
		sendPayload = sendPayload.slice(1).trimStart();
		if (sendPayload.length > 0) {
			await sleep(300);
		}
	}
	if (sendPayload.length > 0) {
		tmuxSendPrompt(record.tmuxWindowId, sendPayload);
	}

	await mutateRegistry(stateRoot, async (registry) => {
		const current = registry.agents[normalizedId];
		if (!current) return;
		if (!isTerminalStatus(current.status)) {
			const changed = await setRecordStatus(stateRoot, current, "running");
			if (!changed) {
				current.updatedAt = nowIso();
			}
		}
	});

	return { ok: true, message: `Sent prompt to ${normalizedId}` };
}

async function setChildRuntimeStatus(ctx: ExtensionContext, nextStatus: AgentStatus): Promise<void> {
	const agentId = process.env[ENV_AGENT_ID];
	if (!agentId) return;

	const stateRoot = getStateRoot(ctx);
	await mutateRegistry(stateRoot, async (registry) => {
		const record = registry.agents[agentId];
		if (!record) return;
		if (isTerminalStatus(record.status)) return;
		const changed = await setRecordStatus(stateRoot, record, nextStatus);
		if (!changed) {
			record.updatedAt = nowIso();
		}
	});
}

async function waitForAny(
	stateRoot: string,
	ids: string[],
	signal?: AbortSignal,
	waitStatesInput?: string[],
): Promise<Record<string, unknown>> {
	const uniqueIds = [...new Set(ids.map((id) => normalizeAgentId(id)).filter(Boolean))];
	if (uniqueIds.length === 0) {
		return { ok: false, error: "No agent ids were provided" };
	}

	const waitStates = normalizeWaitStates(waitStatesInput);
	if (waitStates.error) {
		return { ok: false, error: waitStates.error };
	}
	const waitStateSet = new Set<AgentStatus>(waitStates.values);

	let firstPass = true;
	const knownIds = new Set<string>();

	while (true) {
		if (signal?.aborted) {
			return { ok: false, error: "agent-wait-any aborted" };
		}

		const unknownOnFirstPass: string[] = [];
		let knownCount = 0;

		for (const id of uniqueIds) {
			const checked = await agentCheckPayload(stateRoot, id);
			const ok = checked.ok === true;
			if (!ok) {
				if (knownIds.has(id)) {
					return {
						ok: true,
						agent: { id, status: "done" },
						backlog: [],
					};
				}
				if (firstPass) unknownOnFirstPass.push(id);
				continue;
			}

			knownIds.add(id);
			knownCount += 1;
			const status = (checked.agent as any)?.status as AgentStatus | undefined;
			if (!status) continue;
			if (waitStateSet.has(status)) {
				return checked;
			}
		}

		if (firstPass && unknownOnFirstPass.length > 0) {
			return {
				ok: false,
				error: `Unknown agent id(s): ${unknownOnFirstPass.join(", ")}`,
			};
		}

		firstPass = false;
		await sleep(1000);
	}
}

async function ensureChildSessionLinked(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	const agentId = process.env[ENV_AGENT_ID];
	if (!agentId) return;

	const stateRoot = getStateRoot(ctx);
	const childSession = ctx.sessionManager.getSessionFile();
	const parentSession = process.env[ENV_PARENT_SESSION];

	await mutateRegistry(stateRoot, async (registry) => {
		const existing = registry.agents[agentId];
		if (!existing) {
			registry.agents[agentId] = {
				id: agentId,
				parentSessionId: parentSession,
				childSessionId: childSession,
				task: "(child session linked without parent registry record)",
				status: "running",
				startedAt: nowIso(),
				updatedAt: nowIso(),
			};
			return;
		}

		existing.childSessionId = childSession;
		existing.parentSessionId = existing.parentSessionId ?? parentSession;
		let statusChanged = false;
		if (!isTerminalStatus(existing.status)) {
			statusChanged = await setRecordStatus(stateRoot, existing, "running");
		}
		if (!statusChanged) {
			existing.updatedAt = nowIso();
		}
	});

	const lockPath = join(ctx.cwd, ".pi", "active.lock");
	if (await fileExists(lockPath)) {
		const lock = (await readJsonFile<Record<string, unknown>>(lockPath)) ?? {};
		lock.sessionId = childSession;
		lock.agentId = agentId;
		await atomicWrite(lockPath, JSON.stringify(lock, null, 2) + "\n");
	}

	const hasLinkEntry = ctx.sessionManager.getEntries().some((entry) => {
		if (entry.type !== "custom") return false;
		const customEntry = entry as { customType?: string };
		return customEntry.customType === CHILD_LINK_ENTRY_TYPE;
	});

	if (!hasLinkEntry) {
		pi.appendEntry(CHILD_LINK_ENTRY_TYPE, {
			agentId,
			parentSession,
			linkedAt: Date.now(),
		});
	}
}

function renderInfoMessage(pi: ExtensionAPI, ctx: ExtensionContext, title: string, lines: string[]): void {
	const content = [title, "", ...lines].join("\n");
	if (ctx.hasUI) {
		pi.sendMessage({
			customType: "side-agents-report",
			content,
			display: true,
		});
	} else {
		console.log(content);
	}
}

function emitKickoffPromptMessage(pi: ExtensionAPI, started: StartAgentResult): void {
	const win = started.tmuxWindowIndex !== undefined ? ` (tmux #${started.tmuxWindowIndex})` : "";
	const content = `side-agent ${started.id}: kickoff prompt${win}\n\n${started.prompt}`;
	pi.sendMessage(
		{
			customType: PROMPT_UPDATE_MESSAGE_TYPE,
			content,
			display: false,
			details: {
				agentId: started.id,
				tmuxWindowId: started.tmuxWindowId,
				tmuxWindowIndex: started.tmuxWindowIndex,
				worktreePath: started.worktreePath,
				branch: started.branch,
				prompt: started.prompt,
				emittedAt: Date.now(),
			},
		},
		{ triggerTurn: false },
	);
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function sideAgentsExtension(pi: ExtensionAPI) {
	pi.registerCommand("agent", {
		description: "Spawn a background child agent in its own tmux window/worktree: /agent [-model <provider/id>] [-mode <name>] <task>",
		handler: async (args, ctx) => {
			const parsed = parseAgentCommandArgs(args);
			if (!parsed.task) {
				ctx.hasUI && ctx.ui.notify("Usage: /agent [-model <provider/id>] [-mode <name>] <task>", "error");
				return;
			}

			let resolvedModel = parsed.model;
			if (parsed.mode && !parsed.model) {
				const modeResult = await resolveModeToModelSpec(ctx.cwd, parsed.mode);
				if (modeResult.modelSpec) {
					resolvedModel = modeResult.modelSpec;
				} else if (modeResult.warning) {
					ctx.hasUI && ctx.ui.notify(modeResult.warning, "warning");
				}
			}

			try {
				ctx.hasUI && ctx.ui.notify("Starting side-agent…", "info");
				const started = await startAgent(pi, ctx, {
					task: parsed.task,
					model: resolvedModel,
					includeSummary: true,
				});

				const lines = [
					`id: ${started.id}`,
					`tmux window: ${started.tmuxWindowId} (#${started.tmuxWindowIndex})`,
					`worktree: ${started.worktreePath}`,
					`branch: ${started.branch}`,
				];
				for (const warning of started.warnings) {
					lines.push(`warning: ${warning}`);
				}
				lines.push("", "prompt:");
				for (const line of started.prompt.split(/\r?\n/)) {
					lines.push(`  ${line}`);
				}
				renderInfoMessage(pi, ctx, "side-agent started", lines);
				await renderStatusLine(pi, ctx).catch(() => {});
			} catch (err) {
				ctx.hasUI && ctx.ui.notify(`Failed to start agent: ${stringifyError(err)}`, "error");
			}
		},
	});

	pi.registerCommand("agents", {
		description: "List tracked side agents",
		handler: async (_args, ctx) => {
			const stateRoot = getStateRoot(ctx);
			const repoRoot = resolveGitRoot(stateRoot);
			let registry = await loadRegistry(stateRoot);

			// Refresh all agents inline
			await mutateRegistry(stateRoot, async (reg) => {
				for (const [agentId, record] of Object.entries(reg.agents)) {
					if (record.status === "done") {
						await cleanupWorktreeLockBestEffort(record.worktreePath, record.id);
						delete reg.agents[agentId];
						continue;
					}
					if (record.exitFile && (await fileExists(record.exitFile))) {
						const exit = (await readJsonFile<import("./types.js").ExitMarker>(record.exitFile)) ?? {};
						if (typeof exit.exitCode === "number") {
							record.exitCode = exit.exitCode;
							record.finishedAt = exit.finishedAt ?? record.finishedAt ?? nowIso();
							record.status = exit.exitCode === 0 ? "done" : "failed";
							record.updatedAt = nowIso();
							if (exit.exitCode === 0) {
								await cleanupWorktreeLockBestEffort(record.worktreePath, record.id);
								delete reg.agents[agentId];
								continue;
							}
						}
					}
					if (record.tmuxWindowId && !tmuxWindowExists(record.tmuxWindowId) && !isTerminalStatus(record.status)) {
						record.finishedAt = record.finishedAt ?? nowIso();
						record.status = "crashed";
						record.updatedAt = nowIso();
						if (!record.error) record.error = "tmux window disappeared before an exit marker was recorded";
					} else if (record.tmuxWindowId && tmuxWindowExists(record.tmuxWindowId) &&
						(record.status === "allocating_worktree" || record.status === "spawning_tmux")) {
						record.status = "running";
						record.updatedAt = nowIso();
					}
				}
			});
			registry = await loadRegistry(stateRoot);

			const records = Object.values(registry.agents).sort((a, b) => a.id.localeCompare(b.id));
			let orphanLocks = await scanOrphanWorktreeLocks(repoRoot, registry);

			if (records.length === 0 && orphanLocks.reclaimable.length === 0 && orphanLocks.blocked.length === 0) {
				ctx.hasUI && ctx.ui.notify("No tracked side agents yet.", "info");
				return;
			}

			const lines: string[] = [];
			const failedIds: string[] = [];

			if (records.length === 0) {
				lines.push("(no tracked agents)");
			} else {
				const theme = ctx.hasUI ? ctx.ui.theme : undefined;
				const formatStatusWord = (status: AgentStatus) => theme ? theme.fg(statusColorRole(status), status) : status;
				const formatLabelPrefix = (prefix: string) => theme ? theme.fg("muted", prefix) : prefix;
				for (const [index, record] of records.entries()) {
					const win = record.tmuxWindowIndex !== undefined ? `#${record.tmuxWindowIndex}` : "-";
					const worktreeName = record.worktreePath ? basename(record.worktreePath) || record.worktreePath : "-";
					const statusWord = formatStatusWord(record.status);
					const winPrefix = formatLabelPrefix("win:");
					const worktreePrefix = formatLabelPrefix("worktree:");
					const taskPrefix = formatLabelPrefix("task:");
					lines.push(`${record.id}  ${statusWord}  ${winPrefix}${win}  ${worktreePrefix}${worktreeName}`);
					lines.push(`  ${taskPrefix} ${summarizeTask(record.task)}`);
					if (record.error) lines.push(`  error: ${record.error}`);
					if (record.status === "failed" || record.status === "crashed") {
						failedIds.push(record.id);
					}
					if (index < records.length - 1) {
						lines.push("");
					}
				}
			}

			if (orphanLocks.reclaimable.length > 0 || orphanLocks.blocked.length > 0) {
				if (lines.length > 0) lines.push("");
				lines.push("orphan worktree locks:");
				for (const lock of orphanLocks.reclaimable) {
					lines.push(`  reclaimable: ${summarizeOrphanLock(lock)}`);
				}
				for (const lock of orphanLocks.blocked) {
					lines.push(`  blocked: ${summarizeOrphanLock(lock)} (${lock.blockers.join("; ")})`);
				}
			}

			renderInfoMessage(pi, ctx, "side-agents", lines);

			if (failedIds.length > 0 && ctx.hasUI) {
				const confirmed = await ctx.ui.confirm(
					"Clean up failed agents?",
					`Remove ${failedIds.length} failed/crashed agent(s) from registry: ${failedIds.join(", ")}`,
				);
				if (confirmed) {
					const worktreeEntries: { path: string; agentId: string }[] = [];
					registry = await mutateRegistry(stateRoot, async (next) => {
						for (const id of failedIds) {
							const rec = next.agents[id];
							if (rec?.worktreePath) worktreeEntries.push({ path: rec.worktreePath, agentId: id });
							delete next.agents[id];
						}
					});
					for (const entry of worktreeEntries) {
						await cleanupWorktreeLockBestEffort(entry.path, entry.agentId);
					}
					ctx.ui.notify(`Removed ${failedIds.length} agent(s): ${failedIds.join(", ")}`, "info");
				}
			}

			orphanLocks = await scanOrphanWorktreeLocks(repoRoot, registry);

			if (orphanLocks.reclaimable.length > 0 && ctx.hasUI) {
				const preview = orphanLocks.reclaimable.slice(0, 6).map((lock) => `- ${summarizeOrphanLock(lock)}`);
				if (orphanLocks.reclaimable.length > preview.length) {
					preview.push(`- ... and ${orphanLocks.reclaimable.length - preview.length} more`);
				}

				const confirmed = await ctx.ui.confirm(
					"Reclaim orphan worktree locks?",
					[
						`Remove ${orphanLocks.reclaimable.length} orphan worktree lock(s)?`,
						"Only lock files with no tracked registry agent and no live pid/tmux signal are included.",
						"",
						...preview,
					].join("\n"),
				);
				if (confirmed) {
					const reclaimed = await reclaimOrphanWorktreeLocks(orphanLocks.reclaimable);
					if (reclaimed.failed.length === 0) {
						ctx.ui.notify(`Reclaimed ${reclaimed.removed.length} orphan worktree lock(s).`, "info");
					} else {
						ctx.ui.notify(
							`Reclaimed ${reclaimed.removed.length} orphan lock(s); failed ${reclaimed.failed.length}.`,
							"warning",
						);
					}
				}
			}

			if (orphanLocks.blocked.length > 0 && ctx.hasUI) {
				ctx.ui.notify(
					`Found ${orphanLocks.blocked.length} orphan lock(s) that look live; leaving them untouched.`,
					"warning",
				);
			}
		},
	});

	pi.registerTool({
		name: "agent-start",
		label: "Agent Start",
		description:
			"Start a background side agent in tmux/worktree. Lifecycle: child implements the change or asks for clarification -> wait-state and yield -> parent inspects (agent-check or agent-wait-any), reviews work, reacts -> eventually, parent asks child to wrap up (send 'LGTM, merge'), sends /quit when child is done. Provide a short kebab-case branchHint (max 3 words) for the agent's branch name. Returns { ok: true, id, task, tmuxWindowId, tmuxWindowIndex, worktreePath, branch, warnings[] } on success, or { ok: false, error } on failure.",
		parameters: Type.Object({
			description: Type.String({ description: "Task description for child agent kickoff prompt (include all necessary context)" }),
			branchHint: Type.String({ description: "Short kebab-case branch slug, max 3 words (e.g. fix-auth-leak)" }),
			model: Type.Optional(Type.String({ description: "Model as provider/modelId (optional)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const started = await startAgent(pi, ctx, {
					task: params.description,
					branchHint: params.branchHint,
					model: params.model,
					includeSummary: false,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									ok: true,
									id: started.id,
									task: params.description.length > 200 ? params.description.slice(0, 200) + "…" : params.description,
									tmuxWindowId: started.tmuxWindowId,
									tmuxWindowIndex: started.tmuxWindowIndex,
									worktreePath: started.worktreePath,
									branch: started.branch,
									warnings: started.warnings,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: JSON.stringify({ ok: false, error: stringifyError(err) }, null, 2) }],
				};
			}
		},
	});

	pi.registerTool({
		name: "agent-check",
		label: "Agent Check",
		description:
			"Check a given side agent status and return compact recent output. Returns { ok: true, agent: { id, status, tmuxWindowId, tmuxWindowIndex, worktreePath, branch, task, startedAt, finishedAt?, exitCode?, error?, warnings[] }, backlog: string[] }, or { ok: false, error } if the agent id is unknown or a registry error occurs. backlog is sanitized/truncated for LLM safety; task is a compact preview. Statuses: allocating_worktree | spawning_tmux | running | waiting_user | failed | crashed. Agents that exit with code 0 are auto-removed from registry.",
		parameters: Type.Object({
			id: Type.String({ description: "Agent id" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const payload = await agentCheckPayload(getStateRoot(ctx), params.id);
				return {
					content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: JSON.stringify({ ok: false, error: stringifyError(err) }, null, 2) }],
				};
			}
		},
	});

	pi.registerTool({
		name: "agent-wait-any",
		label: "Agent Wait Any",
		description:
			"Wait for an agent to finish its work. Returns the agent's status payload (same shape as agent-check) once it completes (done), yields (waiting_user), fails, or crashes.",
		parameters: Type.Object({
			ids: Type.Array(Type.String({ description: "Agent id" }), { description: "Agent ids to wait for" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const payload = await waitForAny(getStateRoot(ctx), params.ids, signal);
				return {
					content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: JSON.stringify({ ok: false, error: stringifyError(err) }, null, 2) }],
				};
			}
		},
	});

	pi.registerTool({
		name: "agent-send",
		label: "Agent Send",
		description:
			"Send a steering/follow-up prompt to a child agent's tmux pane. Returns { ok: boolean, message: string }.",
		parameters: Type.Object({
			id: Type.String({ description: "Agent id" }),
			prompt: Type.String({ description: "Prompt text to send (prefix with '!' to interrupt first instead of organic steering, '/' for slash commands like /quit)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const payload = await sendToAgent(getStateRoot(ctx), params.id, params.prompt);
				return {
					content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: JSON.stringify({ ok: false, error: stringifyError(err) }, null, 2) }],
				};
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await ensureChildSessionLinked(pi, ctx).catch(() => {});
		ensureStatusPoller(pi, ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		await setChildRuntimeStatus(ctx, "running").catch(() => {});
	});

	pi.on("agent_end", async (_event, ctx) => {
		await setChildRuntimeStatus(ctx, "waiting_user").catch(() => {});
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		setStatusPollContext(ctx);
		setStatusPollApi(pi);
		await renderStatusLine(pi, ctx, { emitTransitions: false }).catch(() => {});
	});
}
