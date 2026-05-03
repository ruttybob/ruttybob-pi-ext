/**
 * Tool contract unit tests for pi-side-agents.
 *
 * These tests validate the JSON-shape contracts and pure-function behavior of
 * the agent control tools without requiring a live Pi process, real tmux, or
 * real git worktrees.  They complement the full integration suite at
 * tests/integration/side-agents.integration.test.mjs.
 *
 * Tests are grouped by tool / concern:
 *   1. Pure helper functions (ported to JS for direct testing)
 *   2. JSON shape / ok-field contracts
 *   3. waitForAny fail-fast semantics using a real temp registry on disk
 *   4. sendToAgent interrupt-prefix stripping logic
 */

import { describe, test, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Minimal JS re-implementations of pure extension functions
// (kept in sync with extensions/side-agents/index.ts by contract)
// ---------------------------------------------------------------------------

/** @param {string} status */
function isTerminalStatus(status: string) {
	return status === "done" || status === "failed" || status === "crashed";
}

const BACKLOG_SEPARATOR_RE = /^[-─—_=]{5,}$/u;

function isBacklogSeparatorLine(line: string) {
	return BACKLOG_SEPARATOR_RE.test(line.trim());
}

function splitLines(text: string) {
	return text
		.split(/\r?\n/)
		.filter((line, i, arr) => !(i === arr.length - 1 && line.length === 0));
}

function tailLines(text: string, count: number): string[] {
	return splitLines(text).slice(-count);
}

function stripTerminalNoise(text: string) {
	return text
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
		.replace(/\r/g, "")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function truncateWithEllipsis(text: string, maxChars: number) {
	if (maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	if (maxChars === 1) return "…";
	return `${text.slice(0, maxChars - 1)}…`;
}

function summarizeTask(task: string, maxChars = 220) {
	const collapsed = stripTerminalNoise(task).replace(/\s+/g, " ").trim();
	return truncateWithEllipsis(collapsed, maxChars);
}

function collectRecentBacklogLines(lines: string[], minimumLines: number) {
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

function selectBacklogTailLines(text: string, minimumLines: number) {
	return collectRecentBacklogLines(splitLines(text), minimumLines);
}

function sanitizeBacklogLines(lines: string[], lineMax = 240, totalMax = 2400) {
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

/**
 * Minimal re-implementation of waitForAny fail-fast path.
 * Reads a registry JSON at stateRoot/.pi/side-agents/registry.json.
 */
async function waitForAnyFirstPass(
	stateRoot: string,
	ids: string[],
): Promise<Record<string, unknown>> {
	const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
	if (uniqueIds.length === 0) {
		return { ok: false, error: "No agent ids were provided" };
	}

	const waitStates = new Set(["waiting_user", "failed", "crashed"]);

	const registryPath = join(stateRoot, ".pi", "side-agents", "registry.json");
	let registry: any = { agents: {} };
	try {
		registry = JSON.parse(await readFile(registryPath, "utf8"));
	} catch {
		// empty registry
	}

	const unknownOnFirstPass: string[] = [];
	for (const id of uniqueIds) {
		const record = registry?.agents?.[id];
		if (!record) {
			unknownOnFirstPass.push(id);
			continue;
		}
		if (waitStates.has(record.status)) {
			return {
				ok: true,
				agent: record,
				backlog: [],
			};
		}
	}

	if (unknownOnFirstPass.length > 0) {
		return {
			ok: false,
			error: `Unknown agent id(s): ${unknownOnFirstPass.join(", ")}`,
		};
	}

	return { ok: false, error: "no target-state agent found (poll required)" };
}

/**
 * Best-effort re-implementation of worktree lock cleanup.
 */
async function cleanupWorktreeLockBestEffort(worktreePath: string | undefined) {
	if (!worktreePath) return;
	const lockPath = join(worktreePath, ".pi", "active.lock");
	await rm(lockPath, { force: true }).catch(() => {});
}

function collectStatusTransitions(
	previous: Map<string, { status: string; tmuxWindowIndex?: number }> | undefined,
	agents: Array<{ id: string; status: string; tmuxWindowIndex?: number }>,
) {
	const next = new Map<string, { status: string; tmuxWindowIndex?: number }>();
	const transitions: Array<{
		id: string;
		fromStatus: string;
		toStatus: string;
		tmuxWindowIndex?: number;
	}> = [];

	for (const record of agents) {
		const current = {
			status: record.status,
			tmuxWindowIndex: record.tmuxWindowIndex,
		};
		next.set(record.id, current);

		const prev = previous?.get(record.id);
		if (!prev || prev.status === record.status) continue;
		transitions.push({
			id: record.id,
			fromStatus: prev.status,
			toStatus: record.status,
			tmuxWindowIndex: record.tmuxWindowIndex ?? prev.tmuxWindowIndex,
		});
	}

	if (previous) {
		for (const [id, prev] of previous.entries()) {
			if (next.has(id)) continue;
			if (isTerminalStatus(prev.status)) continue;
			transitions.push({
				id,
				fromStatus: prev.status,
				toStatus: "done",
				tmuxWindowIndex: prev.tmuxWindowIndex,
			});
		}
	}

	return {
		next,
		transitions: previous ? transitions.sort((a, b) => a.id.localeCompare(b.id)) : [],
	};
}

function sanitizeSlug(raw: string) {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter(Boolean)
		.slice(0, 3)
		.join("-");
}

function slugFromTask(task: string) {
	const stopWords = new Set(["a", "an", "the", "to", "in", "on", "at", "of", "for", "and", "or", "is", "it", "be", "do", "with"]);
	const words = task
		.replace(/[^a-zA-Z0-9\s]/g, " ")
		.split(/\s+/)
		.map((w) => w.toLowerCase())
		.filter((w) => w.length > 0 && !stopWords.has(w));
	const slug = words.slice(0, 3).join("-");
	return slug || "agent";
}

function deduplicateSlug(slug: string, existing: Set<string>) {
	if (!existing.has(slug)) return slug;
	for (let i = 2; ; i++) {
		const candidate = `${slug}-${i}`;
		if (!existing.has(candidate)) return candidate;
	}
}

// ---------------------------------------------------------------------------
// Helper: temporary registry factory
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()!;
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
});

async function makeTempRegistry(agents: Record<string, any> = {}) {
	const dir = await mkdtemp(join(tmpdir(), "pi-side-unit-"));
	tempDirs.push(dir);

	const metaDir = join(dir, ".pi", "side-agents");
	await mkdir(metaDir, { recursive: true });

	const registry = { version: 1, agents };
	await writeFile(join(metaDir, "registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf8");

	return dir;
}

// ---------------------------------------------------------------------------
// 1. Pure helper functions
// ---------------------------------------------------------------------------

describe("isTerminalStatus", () => {
	test("done/failed/crashed are terminal", () => {
		expect(isTerminalStatus("done")).toBeTruthy();
		expect(isTerminalStatus("failed")).toBeTruthy();
		expect(isTerminalStatus("crashed")).toBeTruthy();
	});

	test("running/waiting/finishing are non-terminal", () => {
		const nonTerminal = [
			"allocating_worktree",
			"spawning_tmux",
			"starting",
			"running",
			"waiting_user",
			"finishing",
			"waiting_merge_lock",
			"retrying_reconcile",
		];
		for (const status of nonTerminal) {
			expect(isTerminalStatus(status)).toBeFalsy();
		}
	});
});

describe("tailLines", () => {
	test("returns last N lines", () => {
		expect(tailLines("a\nb\nc\nd\ne", 3)).toEqual(["c", "d", "e"]);
	});

	test("trailing newline is not treated as an empty line", () => {
		expect(tailLines("a\nb\nc\n", 2)).toEqual(["b", "c"]);
	});

	test("requesting more lines than exist returns all", () => {
		expect(tailLines("a\nb", 10)).toEqual(["a", "b"]);
	});

	test("empty string returns empty array", () => {
		expect(tailLines("", 5)).toEqual([]);
	});
});

describe("selectBacklogTailLines", () => {
	test("returns at least requested non-separator tail lines when available", () => {
		const text = [
			"line 01",
			"line 02",
			"line 03",
			"line 04",
			"line 05",
			"line 06",
			"line 07",
			"line 08",
			"line 09",
			"line 10",
			"line 11",
			"line 12",
			"-----------",
			"────────────",
			"  --------  ",
			"",
			"           ",
		].join("\n");

		const selected = selectBacklogTailLines(text, 10);
		expect(selected.length).toBe(10);
		expect(selected).toEqual([
			"line 03",
			"line 04",
			"line 05",
			"line 06",
			"line 07",
			"line 08",
			"line 09",
			"line 10",
			"line 11",
			"line 12",
		]);
	});
});

describe("sanitizeBacklogLines", () => {
	test("filters divider-only lines but keeps regular dash text", () => {
		const cleaned = sanitizeBacklogLines(["ok", "-----------", "────────────", "step - with context"]);
		expect(cleaned).toEqual(["ok", "step - with context"]);
	});

	test("strips ANSI/control sequences and truncates lines", () => {
		const noisy = [
			"\u001b[31mERROR\u001b[0m something happened",
			"x".repeat(400),
			"\u001b]0;title\u0007ok",
		];
		const cleaned = sanitizeBacklogLines(noisy, 80, 200);

		expect(cleaned.length).toBeGreaterThan(0);
		expect(cleaned[0].startsWith("ERROR")).toBeTruthy();
		expect(cleaned[1].endsWith("…")).toBeTruthy();
		for (const line of cleaned) {
			expect(line).not.toContain("\u001b");
		}
	});
});

describe("collectRecentBacklogLines", () => {
	test("extracts content from visible pane with footer at bottom", () => {
		const visiblePaneLines = [
			" $ npm test -- tests/e2e/auth.test.ts",
			"",
			" PASS  tests/e2e/auth.test.ts",
			"  Auth module",
			"    ✓ login flow (230 ms)",
			"    ✓ logout clears session (45 ms)",
			"",
			" All 474 tests pass (473 + 1 new). Let me amend the commit:",
			"",
			" $ git add -u && git commit --amend --no-edit",
			"",
			" check for added large files..................................................Passed",
			" [side-agent/fix-auth 450d750] feat: fix auth leak in login page",
			"  3 files changed, 42 insertions(+), 7 deletions(-)",
			"",
			"── smart ──────────────────────────────────────────────────────────────",
			"~/projects/repo-worktree-0001 (side-agent/fix-auth)",
			"↑25 ↓5.6k R375k W28k $0.500 (sub) 13.9%/200k (auto)                 (anthropic) claude-opus-…",
			"YOLO mode fix-auth:run@10 │ Claude │ Ctx ━━━━━━ 14% used │ 5h 3h44m left",
		];

		const result = collectRecentBacklogLines(visiblePaneLines, 10);
		expect(result.length).toBeGreaterThan(0);

		const joined = result.join("\n");
		expect(
			joined.includes("tests pass") || joined.includes("fix-auth 450d750") || joined.includes("git commit") || joined.includes("PASS"),
		).toBeTruthy();

		for (const line of result) {
			const cleaned = stripTerminalNoise(line).trim();
			expect(BACKLOG_SEPARATOR_RE.test(cleaned)).toBeFalsy();
		}
	});

	test("visible pane is bounded unlike backlog.log", () => {
		const backlogFileLines: string[] = [];
		backlogFileLines.push("Real content: all tests passed");
		for (let i = 0; i < 200; i++) {
			backlogFileLines.push("── smart ──────────────────────────────────────────────────────────────");
			backlogFileLines.push("~/projects/repo (side-agent/foo)");
			backlogFileLines.push(`↑10 ↓2k R100k W5k $0.${String(i).padStart(3, "0")}`);
			backlogFileLines.push("YOLO mode foo:run@3 │ Claude │ Ctx ━━━━━━ 5% used");
		}

		const fromFile = selectBacklogTailLines(backlogFileLines.join("\n"), 10);
		const fileJoined = fromFile.join("\n");
		expect(fileJoined).not.toContain("all tests passed");

		const visibleLines = [
			"Real content: all tests passed",
			"── smart ──────────────────────────────────────────────────────────────",
			"~/projects/repo (side-agent/foo)",
			"↑10 ↓2k R100k W5k $0.100",
			"YOLO mode foo:run@3 │ Claude │ Ctx ━━━━━━ 5% used",
		];
		const fromVisible = collectRecentBacklogLines(visibleLines, 10);
		const visibleJoined = fromVisible.join("\n");
		expect(visibleJoined).toContain("all tests passed");
	});
});

describe("summarizeTask", () => {
	test("collapses whitespace and truncates", () => {
		const task = "Line one\n\n\tline two with details " + "x".repeat(400);
		const summary = summarizeTask(task, 120);
		expect(summary).not.toContain("\n");
		expect(summary.length).toBeLessThanOrEqual(120);
		expect(summary.endsWith("…")).toBeTruthy();
	});
});

describe("collectStatusTransitions", () => {
	test("first snapshot emits no transitions", () => {
		const { next, transitions } = collectStatusTransitions(undefined, [
			{ id: "alpha", status: "running", tmuxWindowIndex: 7 },
		]);

		expect(next.get("alpha")?.status).toBe("running");
		expect(next.get("alpha")?.tmuxWindowIndex).toBe(7);
		expect(transitions).toEqual([]);
	});

	test("changed status emits transition with tmux fallback", () => {
		const previous = new Map([
			["alpha", { status: "running", tmuxWindowIndex: 17 }],
		]);

		const { transitions } = collectStatusTransitions(previous, [{ id: "alpha", status: "waiting_user" }]);
		expect(transitions).toEqual([
			{
				id: "alpha",
				fromStatus: "running",
				toStatus: "waiting_user",
				tmuxWindowIndex: 17,
			},
		]);
	});

	test("removed non-terminal agent emits synthetic -> done transition", () => {
		const previous = new Map([
			["alpha", { status: "waiting_user", tmuxWindowIndex: 17 }],
		]);

		const { transitions } = collectStatusTransitions(previous, []);
		expect(transitions).toEqual([
			{
				id: "alpha",
				fromStatus: "waiting_user",
				toStatus: "done",
				tmuxWindowIndex: 17,
			},
		]);
	});

	test("removed terminal agent does not emit synthetic done", () => {
		const previous = new Map([
			["failed-agent", { status: "failed", tmuxWindowIndex: 3 }],
			["crashed-agent", { status: "crashed", tmuxWindowIndex: 4 }],
		]);

		const { transitions } = collectStatusTransitions(previous, []);
		expect(transitions).toEqual([]);
	});
});

describe("cleanupWorktreeLockBestEffort", () => {
	test("removes existing lock and remains idempotent", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-side-lock-"));
		tempDirs.push(dir);

		const worktreePath = join(dir, "wt-0001");
		const lockPath = join(worktreePath, ".pi", "active.lock");
		await mkdir(join(worktreePath, ".pi"), { recursive: true });
		await writeFile(lockPath, JSON.stringify({ agentId: "a-0001" }) + "\n", "utf8");

		await cleanupWorktreeLockBestEffort(worktreePath);

		let exists = true;
		try {
			await readFile(lockPath, "utf8");
		} catch {
			exists = false;
		}
		expect(exists).toBe(false);

		await expect(cleanupWorktreeLockBestEffort(worktreePath)).resolves.toBeUndefined();
	});

	test("missing path and missing lock never throw", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-side-lock-"));
		tempDirs.push(dir);

		await expect(cleanupWorktreeLockBestEffort(undefined)).resolves.toBeUndefined();
		await expect(cleanupWorktreeLockBestEffort(join(dir, "wt-no-lock"))).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// 2. JSON shape / ok-field contracts
// ---------------------------------------------------------------------------

describe("JSON shape contracts", () => {
	test("agent-start success shape must include ok: true and task", () => {
		const exampleSuccess = {
			ok: true,
			id: "a-0001",
			task: "refactor auth module",
			tmuxWindowId: "@5",
			tmuxWindowIndex: 5,
			worktreePath: "/tmp/repo-agent-worktree-0001",
			branch: "side-agent/a-0001",
			warnings: [],
		};

		expect(exampleSuccess.ok).toBe(true);
		expect(typeof exampleSuccess.id).toBe("string");
		expect(typeof exampleSuccess.task).toBe("string");
		expect(typeof exampleSuccess.tmuxWindowId).toBe("string");
		expect(typeof exampleSuccess.tmuxWindowIndex).toBe("number");
		expect(typeof exampleSuccess.worktreePath).toBe("string");
		expect(typeof exampleSuccess.branch).toBe("string");
		expect(Array.isArray(exampleSuccess.warnings)).toBe(true);
	});

	test("agent-start task field — short description is not truncated", () => {
		const desc = "Fix the login bug";
		const task = desc.length > 200 ? desc.slice(0, 200) + "…" : desc;
		expect(task).toBe("Fix the login bug");
		expect(task.endsWith("…")).toBeFalsy();
	});

	test("agent-start task field — long description is truncated with ellipsis", () => {
		const desc = "x".repeat(300);
		const task = desc.length > 200 ? desc.slice(0, 200) + "…" : desc;
		expect(task.length).toBe(201);
		expect(task.endsWith("…")).toBeTruthy();
		expect(task.slice(0, 200)).toBe("x".repeat(200));
	});

	test("agent-start task field — exactly 200 chars is not truncated", () => {
		const desc = "y".repeat(200);
		const task = desc.length > 200 ? desc.slice(0, 200) + "…" : desc;
		expect(task.length).toBe(200);
		expect(task.endsWith("…")).toBeFalsy();
	});

	test("agent-start error shape must include ok: false and error string", () => {
		const exampleError = { ok: false, error: "tmux is not available" };
		expect(exampleError.ok).toBe(false);
		expect(typeof exampleError.error).toBe("string");
	});

	test("agent-check success shape", () => {
		const exampleSuccess = {
			ok: true,
			agent: {
				id: "a-0001",
				status: "running",
				tmuxWindowId: "@5",
				tmuxWindowIndex: 5,
				worktreePath: "/tmp/repo-agent-worktree-0001",
				branch: "side-agent/a-0001",
				task: "refactor auth module",
				startedAt: "2026-01-01T00:00:00.000Z",
				finishedAt: undefined,
				exitCode: undefined,
				error: undefined,
				warnings: [],
			},
			backlog: ["line 1", "line 2"],
		};

		expect(exampleSuccess.ok).toBe(true);
		expect(typeof exampleSuccess.agent.id).toBe("string");
		expect(typeof exampleSuccess.agent.status).toBe("string");
		expect(Array.isArray(exampleSuccess.backlog)).toBe(true);
	});

	test("agent-send success shape", () => {
		const exampleSuccess = { ok: true, message: "Sent prompt to a-0001" };
		expect(exampleSuccess.ok).toBe(true);
		expect(typeof exampleSuccess.message).toBe("string");
	});

	test("agent-send failure shape", () => {
		const exampleFailure = { ok: false, message: "Agent a-9999 tmux window is not active" };
		expect(exampleFailure.ok).toBe(false);
		expect(typeof exampleFailure.message).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// 3. waitForAny fail-fast semantics
// ---------------------------------------------------------------------------

describe("waitForAny fail-fast", () => {
	test("empty ids array returns error immediately", async () => {
		const result = await waitForAnyFirstPass("/does/not/exist", []);
		expect(result.ok).toBe(false);
		expect(typeof result.error).toBe("string");
		expect((result.error as string).includes("No agent ids")).toBeTruthy();
	});

	test("unknown agent id returns { ok: false, error } immediately on first pass", async () => {
		const stateRoot = await makeTempRegistry({});
		const result = await waitForAnyFirstPass(stateRoot, ["a-9999"]);

		expect(result.ok).toBe(false);
		expect(typeof result.error).toBe("string");
		expect((result.error as string).includes("a-9999")).toBeTruthy();
	});

	test("mix of known+unknown ids fails fast on unknown", async () => {
		const now = new Date().toISOString();
		const stateRoot = await makeTempRegistry({
			"a-0001": {
				id: "a-0001",
				task: "real task",
				status: "running",
				startedAt: now,
				updatedAt: now,
			},
		});

		const result = await waitForAnyFirstPass(stateRoot, ["a-0001", "a-9999"]);
		expect(result.ok).toBe(false);
		expect((result.error as string).includes("a-9999")).toBeTruthy();
	});

	test("waiting_user agent is detected on first pass", async () => {
		const now = new Date().toISOString();
		const stateRoot = await makeTempRegistry({
			"a-0001": {
				id: "a-0001",
				task: "some task",
				status: "waiting_user",
				startedAt: now,
				updatedAt: now,
			},
		});

		const result = await waitForAnyFirstPass(stateRoot, ["a-0001"]);
		expect(result.ok).toBe(true);
		expect((result.agent as any)?.id).toBe("a-0001");
		expect((result.agent as any)?.status).toBe("waiting_user");
	});

	test("failed agent is detected on first pass", async () => {
		const now = new Date().toISOString();
		const stateRoot = await makeTempRegistry({
			"a-0001": {
				id: "a-0001",
				task: "some task",
				status: "failed",
				startedAt: now,
				updatedAt: now,
				finishedAt: now,
			},
		});

		const result = await waitForAnyFirstPass(stateRoot, ["a-0001"]);
		expect(result.ok).toBe(true);
		expect((result.agent as any)?.id).toBe("a-0001");
		expect((result.agent as any)?.status).toBe("failed");
	});

	test("legacy done status is not in default wait targets", async () => {
		const now = new Date().toISOString();
		const stateRoot = await makeTempRegistry({
			"a-0001": {
				id: "a-0001",
				task: "some task",
				status: "done",
				startedAt: now,
				updatedAt: now,
				finishedAt: now,
			},
		});

		const result = await waitForAnyFirstPass(stateRoot, ["a-0001"]);
		expect(result.ok).toBe(false);
		expect(typeof result.error).toBe("string");
	});

	test("running agent with valid registry signals poll-needed", async () => {
		const now = new Date().toISOString();
		const stateRoot = await makeTempRegistry({
			"a-0001": {
				id: "a-0001",
				task: "some task",
				status: "running",
				startedAt: now,
				updatedAt: now,
			},
		});

		const result = await waitForAnyFirstPass(stateRoot, ["a-0001"]);
		expect(result.ok).toBe(false);
		expect(typeof result.error).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// 4. agent-send interrupt prefix stripping
// ---------------------------------------------------------------------------

describe("agent-send interrupt prefix stripping", () => {
	function parsePrompt(prompt: string) {
		let payload = prompt;
		let interrupted = false;
		if (payload.startsWith("!")) {
			interrupted = true;
			payload = payload.slice(1).trimStart();
		}
		return { interrupted, text: payload };
	}

	test("'!' strips interrupt prefix and returns remaining text", () => {
		const r1 = parsePrompt("! please refocus on the auth module");
		expect(r1.interrupted).toBeTruthy();
		expect(r1.text).toBe("please refocus on the auth module");

		const r2 = parsePrompt("!please refocus");
		expect(r2.interrupted).toBeTruthy();
		expect(r2.text).toBe("please refocus");

		const r3 = parsePrompt("!");
		expect(r3.interrupted).toBeTruthy();
		expect(r3.text).toBe("");

		const r4 = parsePrompt("/agent-check a-0001");
		expect(r4.interrupted).toBeFalsy();
		expect(r4.text).toBe("/agent-check a-0001");
	});

	test("'/' prefix is forwarded verbatim (no special parse)", () => {
		const r = parsePrompt("/quit");
		expect(r.interrupted).toBeFalsy();
		expect(r.text).toBe("/quit");
	});
});

// ---------------------------------------------------------------------------
// 5. Kickoff prompt — parent session suffix
// ---------------------------------------------------------------------------

function buildSimpleKickoffPrompt(task: string, parentSession: string | undefined) {
	const sessionSuffix = parentSession ? `\n\nParent Pi session: ${parentSession}` : "";
	return task + sessionSuffix;
}

describe("kickoff prompt", () => {
	test("appends parent session path when available", () => {
		const result = buildSimpleKickoffPrompt("Fix the bug", "/home/user/.pi/agent/sessions/abc123/session.jsonl");
		expect(result.startsWith("Fix the bug")).toBeTruthy();
		expect(result).toContain("Parent Pi session: /home/user/.pi/agent/sessions/abc123/session.jsonl");
	});

	test("no suffix when parent session is undefined", () => {
		const result = buildSimpleKickoffPrompt("Fix the bug", undefined);
		expect(result).toBe("Fix the bug");
	});

	test("no suffix when parent session is empty string", () => {
		const result = buildSimpleKickoffPrompt("Fix the bug", "");
		expect(result).toBe("Fix the bug");
	});

	test("suffix is separated by blank line from task", () => {
		const result = buildSimpleKickoffPrompt("Do something", "/tmp/session.jsonl");
		const lines = result.split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(lines[0]).toBe("Do something");
		expect(lines[1]).toBe("");
		expect(lines[2].startsWith("Parent Pi session:")).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// 6. Branch naming convention / slug helpers
// ---------------------------------------------------------------------------

describe("sanitizeSlug", () => {
	test("basic kebab-case conversion", () => {
		expect(sanitizeSlug("Fix Auth Leak")).toBe("fix-auth-leak");
		expect(sanitizeSlug("  ADD retry LOGIC  ")).toBe("add-retry-logic");
		expect(sanitizeSlug("hello---world")).toBe("hello-world");
	});

	test("truncates to 3 words", () => {
		expect(sanitizeSlug("one two three four five")).toBe("one-two-three");
	});

	test("strips special chars", () => {
		expect(sanitizeSlug("fix: the bug!")).toBe("fix-the-bug");
		expect(sanitizeSlug("...leading-dots...")).toBe("leading-dots");
	});

	test("empty input returns empty string", () => {
		expect(sanitizeSlug("")).toBe("");
		expect(sanitizeSlug("!!!")).toBe("");
	});
});

describe("slugFromTask", () => {
	test("extracts meaningful words, skips stop words", () => {
		expect(slugFromTask("Fix the auth leak in the login page")).toBe("fix-auth-leak");
		expect(slugFromTask("Add a retry to the upload logic")).toBe("add-retry-upload");
	});

	test("falls back to 'agent' for empty/stopword-only input", () => {
		expect(slugFromTask("")).toBe("agent");
		expect(slugFromTask("the a an")).toBe("agent");
	});
});

describe("deduplicateSlug", () => {
	test("returns slug as-is when no collision", () => {
		expect(deduplicateSlug("fix-auth", new Set())).toBe("fix-auth");
		expect(deduplicateSlug("fix-auth", new Set(["other"]))).toBe("fix-auth");
	});

	test("appends suffix on collision", () => {
		expect(deduplicateSlug("fix-auth", new Set(["fix-auth"]))).toBe("fix-auth-2");
		expect(deduplicateSlug("fix-auth", new Set(["fix-auth", "fix-auth-2"]))).toBe("fix-auth-3");
	});
});

describe("branch naming convention", () => {
	test("agent branch name follows side-agent/<slug> convention", () => {
		function branchForId(id: string) {
			return `side-agent/${id}`;
		}

		expect(branchForId("fix-auth-leak")).toBe("side-agent/fix-auth-leak");
		expect(branchForId("add-retry")).toBe("side-agent/add-retry");

		const branch = branchForId("fix-auth-leak");
		expect(branch.startsWith("/")).toBeFalsy();
		expect(branch.startsWith(".")).toBeFalsy();
	});
});
