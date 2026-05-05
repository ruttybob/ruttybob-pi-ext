// tests/presets/prompt-commands.test.ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
	discoverPromptCommands,
	parseCommandArgs,
	substituteArgs,
	resolveModel,
	runDeterministicStep,
	buildDeterministicPreamble,
	buildCommandDescription,
	type PromptCommand,
} from "../../extensions/presets/prompt-commands.js";

describe("prompt-commands", () => {
	const testDir = join(tmpdir(), `prompt-cmd-test-${process.pid}`);
	const projectPromptsDir = join(testDir, "project", ".pi", "prompts");

	const originalHomedir = process.env.HOME;

	beforeEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		mkdirSync(join(testDir, ".pi", "agent", "prompts"), { recursive: true });
		mkdirSync(projectPromptsDir, { recursive: true });
		process.env.HOME = testDir;
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
		process.env.HOME = originalHomedir;
	});

	function writeGlobalPrompt(name: string, content: string) {
		writeFileSync(join(testDir, ".pi", "agent", "prompts", `${name}.md`), content);
	}

	function writeProjectPrompt(name: string, content: string) {
		writeFileSync(join(projectPromptsDir, `${name}.md`), content);
	}

	// ── discoverPromptCommands ──────────────────────────────

	describe("discoverPromptCommands", () => {
		it("discovers prompt with preset field", () => {
			writeGlobalPrompt("my-cmd", `---
description: My command
preset: architect
---
Do the thing: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(1);
			expect(cmds[0].name).toBe("my-cmd");
			expect(cmds[0].preset).toBe("architect");
			expect(cmds[0].description).toBe("My command");
			expect(cmds[0].content).toContain("Do the thing: $@");
		});

		it("discovers prompt with run field", () => {
			writeGlobalPrompt("test-runner", `---
description: Run tests
run: npm test
handoff: on-failure
timeout: 60000
---
Fix the failing tests: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(1);
			expect(cmds[0].run).toBe("npm test");
			expect(cmds[0].handoff).toBe("on-failure");
			expect(cmds[0].timeout).toBe(60000);
		});

		it("discovers prompt with model field only", () => {
			writeGlobalPrompt("model-only", `---
description: Just a model
model: claude-sonnet-4
---
Analyze: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(1);
			expect(cmds[0].model).toEqual(["claude-sonnet-4"]);
		});

		it("discovers prompt with thinking field only", () => {
			writeGlobalPrompt("think-only", `---
description: Just thinking
thinking: high
---
Analyze: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(1);
			expect(cmds[0].thinking).toBe("high");
		});

		it("skips prompts without any extension fields", () => {
			writeGlobalPrompt("plain", `---
description: Plain prompt
argument-hint: "<task>"
---
Do stuff: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(0);
		});

		it("skips prompts with empty preset", () => {
			writeGlobalPrompt("empty-preset", `---
description: Empty preset
preset:
---
Do stuff
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(0);
		});

		it("skips reserved command names", () => {
			writeGlobalPrompt("preset", `---
description: Conflicts with /preset
preset: architect
---
Bad name
`);
			writeGlobalPrompt("model", `---
description: Conflicts with /model
preset: architect
---
Bad name
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(0);
		});

		it("parses model as comma-separated array", () => {
			writeGlobalPrompt("multi-model", `---
description: Multi model
preset: architect
model: claude-haiku-4-5, claude-sonnet-4
---
Analyze: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds[0].model).toEqual(["claude-haiku-4-5", "claude-sonnet-4"]);
		});

		it("parses thinking level", () => {
			writeGlobalPrompt("think-high", `---
description: Deep think
preset: architect
thinking: high
---
Think deep: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds[0].thinking).toBe("high");
		});

		it("ignores invalid thinking level", () => {
			writeGlobalPrompt("think-bad", `---
description: Bad think
preset: architect
thinking: super-duper
---
Think: $@
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds[0].thinking).toBeUndefined();
		});

		it("defaults handoff to always", () => {
			writeGlobalPrompt("default-handoff", `---
run: echo hi
---
Do stuff
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds[0].handoff).toBe("always");
		});

		it("defaults timeout to 30000", () => {
			writeGlobalPrompt("default-timeout", `---
run: echo hi
---
Do stuff
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds[0].timeout).toBe(30000);
		});

		it("project prompts override global with same name", () => {
			writeGlobalPrompt("review", `---
description: Global review
preset: coder
---
Global content
`);
			writeProjectPrompt("review", `---
description: Project review
preset: architect
---
Project content
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(1);
			expect(cmds[0].preset).toBe("architect");
			expect(cmds[0].source).toBe("project");
		});

		it("discovers from both global and project", () => {
			writeGlobalPrompt("cmd-a", `---
preset: architect
---
A
`);
			writeProjectPrompt("cmd-b", `---
preset: coder
---
B
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(2);
			const names = cmds.map(c => c.name).sort();
			expect(names).toEqual(["cmd-a", "cmd-b"]);
		});

		it("skips non-.md files", () => {
			writeFileSync(join(testDir, ".pi", "agent", "prompts", "ignore.txt"), "not a prompt");
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(0);
		});

		it("handles missing directories gracefully", () => {
			const cmds = discoverPromptCommands(join(testDir, "nonexistent"));
			expect(cmds).toHaveLength(0);
		});

		it("skips prompt with invalid model spec", () => {
			writeGlobalPrompt("bad-model", `---
preset: architect
model: has spaces
---
Do stuff
`);
			const cmds = discoverPromptCommands(join(testDir, "project"));
			expect(cmds).toHaveLength(0);
		});
	});

	// ── parseCommandArgs ────────────────────────────────────

	describe("parseCommandArgs", () => {
		it("splits by whitespace", () => {
			expect(parseCommandArgs("hello world")).toEqual(["hello", "world"]);
		});

		it("respects double quotes", () => {
			expect(parseCommandArgs('"hello world" foo')).toEqual(["hello world", "foo"]);
		});

		it("respects single quotes", () => {
			expect(parseCommandArgs("'hello world' foo")).toEqual(["hello world", "foo"]);
		});

		it("handles empty string", () => {
			expect(parseCommandArgs("")).toEqual([]);
		});

		it("handles multiple spaces", () => {
			expect(parseCommandArgs("a   b")).toEqual(["a", "b"]);
		});
	});

	// ── substituteArgs ──────────────────────────────────────

	describe("substituteArgs", () => {
		it("replaces $@ with all args", () => {
			expect(substituteArgs("hello $@", ["world", "foo"])).toBe("hello world foo");
		});

		it("replaces $1, $2 with indexed args", () => {
			expect(substituteArgs("$1 and $2", ["alice", "bob"])).toBe("alice and bob");
		});

		it("replaces ${@:N} with args from N", () => {
			expect(substituteArgs("${@:2}", ["a", "b", "c"])).toBe("b c");
		});

		it("replaces ${@:N:M} with M args from N", () => {
			expect(substituteArgs("${@:2:1}", ["a", "b", "c"])).toBe("b");
		});

		it("returns empty for missing args", () => {
			expect(substituteArgs("$1 and $9", ["only"])).toBe("only and ");
		});

		it("handles no placeholders", () => {
			expect(substituteArgs("plain text", ["arg"])).toBe("plain text");
		});

		it("handles empty args array", () => {
			expect(substituteArgs("$@", [])).toBe("");
		});

		it("handles $0 gracefully (empty)", () => {
			expect(substituteArgs("$0", ["a"])).toBe("");
		});
	});

	// ── resolveModel ────────────────────────────────────────

	describe("resolveModel", () => {
		it("returns alreadyActive when current model matches", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const registry = {
				find: vi.fn(),
				getAvailable: vi.fn(() => []),
				getApiKeyAndHeaders: vi.fn(),
			};

			const result = await resolveModel(["claude-sonnet-4"], currentModel, registry);
			expect(result).toEqual({ model: currentModel, alreadyActive: true });
		});

		it("returns alreadyActive with provider/model match", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const registry = {
				find: vi.fn(),
				getAvailable: vi.fn(() => []),
				getApiKeyAndHeaders: vi.fn(),
			};

			const result = await resolveModel(
				["anthropic/claude-sonnet-4"],
				currentModel,
				registry,
			);
			expect(result).toEqual({ model: currentModel, alreadyActive: true });
		});

		it("finds model with provider/model spec", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const targetModel = { provider: "openrouter", id: "claude-haiku-4-5" };
			const registry = {
				find: vi.fn((_p: string, _m: string) => targetModel),
				getAvailable: vi.fn(() => []),
				getApiKeyAndHeaders: vi.fn(async () => ({ ok: true })),
			};

			const result = await resolveModel(
				["openrouter/claude-haiku-4-5"],
				currentModel,
				registry,
			);
			expect(result).toEqual({ model: targetModel, alreadyActive: false });
		});

		it("tries fallback for bare model ID", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const targetModel = { provider: "openrouter", id: "claude-haiku-4-5" };
			const registry = {
				find: vi.fn(),
				getAvailable: vi.fn(() => [targetModel]),
				getApiKeyAndHeaders: vi.fn(async () => ({ ok: true })),
			};

			const result = await resolveModel(
				["claude-haiku-4-5"],
				currentModel,
				registry,
			);
			expect(result).toEqual({ model: targetModel, alreadyActive: false });
		});

		it("returns undefined when no model found", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const registry = {
				find: vi.fn(() => undefined),
				getAvailable: vi.fn(() => []),
				getApiKeyAndHeaders: vi.fn(async () => ({ ok: false })),
			};

			const result = await resolveModel(
				["nonexistent-model"],
				currentModel,
				registry,
			);
			expect(result).toBeUndefined();
		});

		it("tries multiple specs in order", async () => {
			const currentModel = { provider: "anthropic", id: "claude-sonnet-4" };
			const firstModel = { provider: "openai", id: "gpt-4" };
			const secondModel = { provider: "anthropic", id: "claude-haiku-4-5" };
			let findCallCount = 0;
			const registry = {
				find: vi.fn(() => {
					findCallCount++;
					if (findCallCount === 1) return firstModel;
					return secondModel;
				}),
				getAvailable: vi.fn(() => []),
				getApiKeyAndHeaders: vi.fn(async (_m: any) => {
					if (_m === firstModel) return { ok: false };
					return { ok: true };
				}),
			};

			const result = await resolveModel(
				["openai/gpt-4", "anthropic/claude-haiku-4-5"],
				currentModel,
				registry,
			);
			expect(result?.model).toBe(secondModel);
		});
	});

	// ── runDeterministicStep ────────────────────────────────

	describe("runDeterministicStep", () => {
		it("runs a command and captures output", async () => {
			const result = await runDeterministicStep("echo hello", 5000, testDir);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("hello");
			expect(result.timedOut).toBe(false);
		});

		it("captures stderr", async () => {
			const result = await runDeterministicStep("echo error >&2", 5000, testDir);
			expect(result.stderr.trim()).toBe("error");
		});

		it("captures non-zero exit code", async () => {
			const result = await runDeterministicStep("exit 42", 5000, testDir);
			expect(result.exitCode).toBe(42);
		});

		it("times out long-running commands", async () => {
			const result = await runDeterministicStep("sleep 10", 100, testDir);
			expect(result.timedOut).toBe(true);
		});

		it("records duration", async () => {
			const result = await runDeterministicStep("echo fast", 5000, testDir);
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});
	});

	// ── buildDeterministicPreamble ──────────────────────────

	describe("buildDeterministicPreamble", () => {
		it("formats success result", () => {
			const result = buildDeterministicPreamble({
				command: "npm test",
				exitCode: 0,
				timedOut: false,
				durationMs: 1234,
				stdout: "all tests passed",
				stderr: "",
				truncated: false,
			});
			expect(result).toContain("[Deterministic step]");
			expect(result).toContain("SUCCESS");
			expect(result).toContain("npm test");
			expect(result).toContain("1234ms");
			expect(result).toContain("all tests passed");
		});

		it("formats failure result", () => {
			const result = buildDeterministicPreamble({
				command: "npm test",
				exitCode: 1,
				timedOut: false,
				durationMs: 500,
				stdout: "",
				stderr: "test failed",
				truncated: false,
			});
			expect(result).toContain("FAILED");
			expect(result).toContain("test failed");
		});

		it("formats timeout result", () => {
			const result = buildDeterministicPreamble({
				command: "sleep 10",
				exitCode: null,
				timedOut: true,
				durationMs: 30000,
				stdout: "",
				stderr: "",
				truncated: false,
			});
			expect(result).toContain("TIMEOUT");
		});

		it("shows truncated notice", () => {
			const result = buildDeterministicPreamble({
				command: "cat big-file",
				exitCode: 0,
				timedOut: false,
				durationMs: 100,
				stdout: "x",
				stderr: "",
				truncated: true,
			});
			expect(result).toContain("truncated");
		});
	});

	// ── buildCommandDescription ─────────────────────────────

	describe("buildCommandDescription", () => {
		it("builds description with preset", () => {
			const desc = buildCommandDescription({
				name: "review",
				description: "Review code",
				content: "",
				filePath: "",
				preset: "architect",
				handoff: "always",
				timeout: 30000,
				source: "user",
			});
			expect(desc).toContain("Review code");
			expect(desc).toContain("preset:architect");
			expect(desc).toContain("(user)");
		});

		it("builds description with all fields", () => {
			const desc = buildCommandDescription({
				name: "deep",
				description: "Deep analysis",
				content: "",
				filePath: "",
				preset: "architect",
				model: ["claude-haiku-4-5", "claude-sonnet-4"],
				thinking: "high",
				run: "npm test",
				handoff: "on-failure",
				timeout: 60000,
				source: "project",
			});
			expect(desc).toContain("preset:architect");
			expect(desc).toContain("claude-haiku-4-5|claude-sonnet-4");
			expect(desc).toContain("thinking:high");
			expect(desc).toContain("run:npm test");
		});

		it("builds description without description field", () => {
			const desc = buildCommandDescription({
				name: "minimal",
				description: "",
				content: "",
				filePath: "",
				preset: "coder",
				handoff: "always",
				timeout: 30000,
				source: "user",
			});
			expect(desc).toContain("preset:coder");
			expect(desc).toContain("(user)");
		});

		it("truncates long run command", () => {
			const desc = buildCommandDescription({
				name: "long-run",
				description: "",
				content: "",
				filePath: "",
				run: "this is a very very very very very long command",
				handoff: "always",
				timeout: 30000,
				source: "user",
			});
			expect(desc).toContain("run:this is a very ve...");
		});
	});
});
