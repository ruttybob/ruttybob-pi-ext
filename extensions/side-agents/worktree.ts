/**
 * Worktree-менеджмент для side-agents.
 *
 * Git worktree lifecycle: allocate, slots, orphan locks, sync pi-files, cleanup.
 */

import { promises as fs } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileExists, ensureDir, readJsonFile, atomicWrite } from "../shared/fs.js";
import { run, runOrThrow } from "../shared/git.js";
import { nowIso, isTerminalStatus, stringifyError } from "./utils.js";
import { loadRegistry } from "./registry.js";
import { resolveGitRoot, getCurrentBranch, listRegisteredWorktrees, existingAgentIds } from "./git.js";
import { tmuxWindowExists } from "./tmux.js";
import type { RegistryFile, AgentRecord, WorktreeSlot, OrphanWorktreeLock, OrphanWorktreeLockScan, AllocateWorktreeResult } from "./types.js";

export async function writeWorktreeLock(worktreePath: string, payload: Record<string, unknown>): Promise<void> {
	const lockPath = join(worktreePath, ".pi", "active.lock");
	await ensureDir(dirname(lockPath));
	await atomicWrite(lockPath, JSON.stringify(payload, null, 2) + "\n");
}

export async function updateWorktreeLock(worktreePath: string, patch: Record<string, unknown>): Promise<void> {
	const lockPath = join(worktreePath, ".pi", "active.lock");
	const current = (await readJsonFile<Record<string, unknown>>(lockPath)) ?? {};
	await writeWorktreeLock(worktreePath, { ...current, ...patch });
}

export async function cleanupWorktreeLockBestEffort(worktreePath?: string, agentId?: string): Promise<void> {
	if (!worktreePath) return;
	const lockPath = join(worktreePath, ".pi", "active.lock");
	if (agentId) {
		try {
			const lock = await readJsonFile<Record<string, unknown>>(lockPath);
			if (lock && typeof lock.agentId === "string" && lock.agentId !== agentId) {
				return;
			}
		} catch {
			// proceed with deletion attempt
		}
	}
	await fs.unlink(lockPath).catch(() => {});
}

export async function listWorktreeSlots(repoRoot: string): Promise<WorktreeSlot[]> {
	const parent = dirname(repoRoot);
	const prefix = `${basename(repoRoot)}-agent-worktree-`;
	const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{4})$`);

	const entries = await fs.readdir(parent, { withFileTypes: true });
	const slots: WorktreeSlot[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const match = entry.name.match(re);
		if (!match) continue;
		const index = Number(match[1]);
		if (!Number.isFinite(index)) continue;
		slots.push({
			index,
			path: join(parent, entry.name),
		});
	}
	slots.sort((a, b) => a.index - b.index);
	return slots;
}

function parseOptionalPid(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && /^\d+$/.test(value)) {
		const parsed = Number(value);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function isPidAlive(pid?: number): boolean {
	if (pid === undefined) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: any) {
		return err?.code === "EPERM";
	}
}

export function summarizeOrphanLock(lock: OrphanWorktreeLock): string {
	const details: string[] = [];
	if (lock.lockAgentId) details.push(`agent:${lock.lockAgentId}`);
	if (lock.lockTmuxWindowId) details.push(`tmux:${lock.lockTmuxWindowId}`);
	if (lock.lockPid !== undefined) details.push(`pid:${lock.lockPid}`);
	if (details.length === 0) return lock.worktreePath;
	return `${lock.worktreePath} (${details.join(" ")})`;
}

export async function scanOrphanWorktreeLocks(repoRoot: string, registry: RegistryFile): Promise<OrphanWorktreeLockScan> {
	const slots = await listWorktreeSlots(repoRoot);
	const reclaimable: OrphanWorktreeLock[] = [];
	const blocked: OrphanWorktreeLock[] = [];

	for (const slot of slots) {
		const lockPath = join(slot.path, ".pi", "active.lock");
		if (!(await fileExists(lockPath))) continue;

		const raw = (await readJsonFile<Record<string, unknown>>(lockPath)) ?? {};
		const lockAgentId = typeof raw.agentId === "string" ? raw.agentId : undefined;
		if (lockAgentId && registry.agents[lockAgentId]) {
			continue;
		}

		const lockPid = parseOptionalPid(raw.pid);
		const lockTmuxWindowId = typeof raw.tmuxWindowId === "string" ? raw.tmuxWindowId : undefined;

		const blockers: string[] = [];
		if (isPidAlive(lockPid)) {
			blockers.push(`pid ${lockPid} is still alive`);
		}
		if (lockTmuxWindowId && tmuxWindowExists(lockTmuxWindowId)) {
			blockers.push(`tmux window ${lockTmuxWindowId} is active`);
		}

		const candidate: OrphanWorktreeLock = {
			worktreePath: slot.path,
			lockPath,
			lockAgentId,
			lockPid,
			lockTmuxWindowId,
			blockers,
		};

		if (blockers.length > 0) {
			blocked.push(candidate);
		} else {
			reclaimable.push(candidate);
		}
	}

	return { reclaimable, blocked };
}

export async function reclaimOrphanWorktreeLocks(locks: OrphanWorktreeLock[]): Promise<{
	removed: string[];
	failed: Array<{ lockPath: string; error: string }>;
}> {
	const removed: string[] = [];
	const failed: Array<{ lockPath: string; error: string }> = [];

	for (const lock of locks) {
		try {
			await fs.unlink(lock.lockPath);
			removed.push(lock.lockPath);
		} catch (err: any) {
			if (err?.code === "ENOENT") continue;
			failed.push({ lockPath: lock.lockPath, error: stringifyError(err) });
		}
	}

	return { removed, failed };
}

export async function syncParallelAgentPiFiles(parentRepoRoot: string, worktreePath: string): Promise<void> {
	const parentPiDir = join(parentRepoRoot, ".pi");
	if (!(await fileExists(parentPiDir))) return;

	const sourceEntries = await fs.readdir(parentPiDir, { withFileTypes: true });
	const names = sourceEntries
		.filter((entry) => entry.name.startsWith("side-agent-"))
		.map((entry) => entry.name);
	if (names.length === 0) return;

	const worktreePiDir = join(worktreePath, ".pi");
	await ensureDir(worktreePiDir);

	for (const name of names) {
		const source = join(parentPiDir, name);
		const target = join(worktreePiDir, name);

		let shouldLink = true;
		try {
			const st = await fs.lstat(target);
			if (st.isSymbolicLink()) {
				const existing = await fs.readlink(target);
				if (resolve(dirname(target), existing) === resolve(source)) {
					shouldLink = false;
				}
			}
			if (shouldLink) {
				await fs.rm(target, { recursive: true, force: true });
			}
		} catch {
			// missing target
		}

		if (shouldLink) {
			await fs.symlink(source, target);
		}
	}
}

export async function allocateWorktree(options: {
	repoRoot: string;
	stateRoot: string;
	agentId: string;
	parentSessionId?: string;
}): Promise<AllocateWorktreeResult> {
	const { repoRoot, stateRoot, agentId, parentSessionId } = options;

	const warnings: string[] = [];
	const branch = `side-agent/${agentId}`;
	const mainHead = runOrThrow("git", ["-C", repoRoot, "rev-parse", "HEAD"]).stdout.trim();

	run("git", ["-C", repoRoot, "worktree", "prune"]);

	const registry = await loadRegistry(stateRoot);
	const slots = await listWorktreeSlots(repoRoot);
	const registered = listRegisteredWorktrees(repoRoot);

	let chosen: WorktreeSlot | undefined;
	let maxIndex = 0;

	const claimedByActiveAgent = new Set<string>();
	for (const record of Object.values(registry.agents)) {
		if (record.id !== agentId && record.worktreePath && !isTerminalStatus(record.status)) {
			claimedByActiveAgent.add(resolve(record.worktreePath));
		}
	}

	for (const slot of slots) {
		maxIndex = Math.max(maxIndex, slot.index);
		const resolvedSlotPath = resolve(slot.path);
		const lockPath = join(slot.path, ".pi", "active.lock");

		if (await fileExists(lockPath)) {
			const lock = await readJsonFile<Record<string, unknown>>(lockPath);
			const lockAgentId = typeof lock?.agentId === "string" ? lock.agentId : undefined;
			if (!lockAgentId || !registry.agents[lockAgentId]) {
				warnings.push(`Locked worktree is not tracked in registry: ${slot.path}`);
			}
			continue;
		}

		if (claimedByActiveAgent.has(resolvedSlotPath)) {
			warnings.push(`Worktree claimed by active agent in registry (missing lock): ${slot.path}`);
			continue;
		}

		const isRegistered = registered.has(resolve(slot.path));
		if (isRegistered) {
			const status = run("git", ["-C", slot.path, "status", "--porcelain"]);
			if (!status.ok) {
				warnings.push(`Could not inspect unlocked worktree, skipping: ${slot.path}`);
				continue;
			}
			if (status.stdout.trim().length > 0) {
				warnings.push(`Unlocked worktree has local changes, skipping: ${slot.path}`);
				continue;
			}
		} else {
			const entries = await fs.readdir(slot.path).catch(() => []);
			if (entries.length > 0) {
				warnings.push(`Unlocked slot is not a registered worktree and not empty, skipping: ${slot.path}`);
				continue;
			}
		}

		chosen = slot;
		break;
	}

	if (!chosen) {
		const next = maxIndex + 1 || 1;
		const parent = dirname(repoRoot);
		const name = `${basename(repoRoot)}-agent-worktree-${String(next).padStart(4, "0")}`;
		chosen = { index: next, path: join(parent, name) };
	}

	const chosenPath = chosen.path;
	const chosenRegistered = registered.has(resolve(chosenPath));

	if (chosenRegistered && (await fileExists(chosenPath))) {
		const oldBranch = getCurrentBranch(chosenPath);

		run("git", ["-C", chosenPath, "merge", "--abort"]);
		runOrThrow("git", ["-C", chosenPath, "reset", "--hard", mainHead]);
		runOrThrow("git", ["-C", chosenPath, "clean", "-fd"]);
		runOrThrow("git", ["-C", chosenPath, "checkout", "-B", branch, mainHead]);

		if (oldBranch && oldBranch !== branch) {
			run("git", ["-C", repoRoot, "branch", "-d", oldBranch]);
		}
	} else {
		if (chosenRegistered) {
			run("git", ["-C", repoRoot, "worktree", "prune"]);
			warnings.push(`Pruned stale worktree reference for slot ${chosenPath}`);
		}
		if (await fileExists(chosenPath)) {
			const entries = await fs.readdir(chosenPath).catch(() => []);
			if (entries.length > 0) {
				throw new Error(`Cannot use worktree slot ${chosenPath}: directory exists and is not empty`);
			}
		}
		await ensureDir(dirname(chosenPath));
		runOrThrow("git", ["-C", repoRoot, "worktree", "add", "-B", branch, chosenPath, mainHead]);
	}

	await ensureDir(join(chosenPath, ".pi"));
	await syncParallelAgentPiFiles(repoRoot, chosenPath);
	await writeWorktreeLock(chosenPath, {
		agentId,
		sessionId: parentSessionId,
		parentSessionId,
		pid: process.pid,
		branch,
		startedAt: nowIso(),
	});

	return {
		worktreePath: chosenPath,
		slotIndex: chosen.index,
		branch,
		warnings,
	};
}
