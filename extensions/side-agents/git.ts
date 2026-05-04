/**
 * Git-утилиты для side-agents.
 *
 * Реэкспортирует shared/git + side-agents-специфичные функции.
 */

import { resolve } from "node:path";
import { run, runOrThrow, type CommandResult } from "../shared/git.js";
import type { RegistryFile } from "./types.js";

export { run, runOrThrow, type CommandResult };
export { shellQuote } from "../shared/git.js";

export function resolveGitRoot(cwd: string): string {
	const result = run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
	if (result.ok) {
		const root = result.stdout.trim();
		if (root.length > 0) return resolve(root);
	}
	return resolve(cwd);
}

export function getCurrentBranch(cwd: string): string {
	const result = run("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]);
	if (!result.ok) return "";
	const branch = result.stdout.trim();
	if (!branch || branch === "HEAD") return "";
	return branch;
}

export function listRegisteredWorktrees(repoRoot: string): Set<string> {
	const result = runOrThrow("git", ["-C", repoRoot, "worktree", "list", "--porcelain"]);
	const set = new Set<string>();
	for (const line of result.stdout.split(/\r?\n/)) {
		if (line.startsWith("worktree ")) {
			set.add(resolve(line.slice("worktree ".length).trim()));
		}
	}
	return set;
}

export function existingAgentIds(registry: RegistryFile, repoRoot: string): Set<string> {
	const ids = new Set<string>(Object.keys(registry.agents));

	const listed = run("git", ["-C", repoRoot, "worktree", "list", "--porcelain"]);
	if (listed.ok) {
		for (const line of listed.stdout.split(/\r?\n/)) {
			if (!line.startsWith("branch ")) continue;
			const branchRef = line.slice("branch ".length).trim();
			if (!branchRef || branchRef === "(detached)") continue;
			const branch = branchRef.startsWith("refs/heads/") ? branchRef.slice("refs/heads/".length) : branchRef;
			if (branch.startsWith("side-agent/")) {
				ids.add(branch.slice("side-agent/".length));
			}
		}
	}

	return ids;
}
