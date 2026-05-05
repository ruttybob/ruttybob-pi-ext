// extensions/presets/prompt-commands.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { exec } from "node:child_process";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptSource = "user" | "project";

export interface PromptCommand {
	name: string;
	description: string;
	content: string;
	filePath: string;
	preset?: string;
	model?: string[];           // comma-separated → array (override preset.model)
	thinking?: string;           // override preset.thinkingLevel
	run?: string;                // deterministic step command
	handoff: "always" | "never" | "on-success" | "on-failure";
	timeout: number;             // ms, default 30000
	source: PromptSource;
}

export interface DeterministicResult {
	command: string;
	exitCode: number | null;
	timedOut: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	truncated: boolean;
}

// ---------------------------------------------------------------------------
// Reserved command names — skip these to avoid conflicts with pi builtins
// ---------------------------------------------------------------------------

export const RESERVED_COMMAND_NAMES = new Set([
	"chain-prompts", "prompt-tool", "settings", "model", "scoped-models",
	"export", "share", "copy", "name", "session", "changelog", "hotkeys",
	"fork", "tree", "login", "logout", "new", "compact", "resume",
	"reload", "quit", "preset",
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_HANDOFF_VALUES = new Set(["always", "never", "on-success", "on-failure"]);
const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function isValidModelSpec(spec: string): boolean {
	if (!spec || spec.includes("*") || /\s/.test(spec)) return false;
	const segments = spec.split("/");
	if (segments.length === 1) return true;
	if (segments.length !== 2) return false;
	return segments[0].length > 0 && segments[1].length > 0;
}

// ---------------------------------------------------------------------------
// discoverPromptCommands
// ---------------------------------------------------------------------------

/**
 * Scan prompt directories for .md files with extension-specific frontmatter.
 * Returns prompts that have at least one of: preset, run, model, thinking.
 */
export function discoverPromptCommands(
	cwd: string,
	agentDir?: string,
): PromptCommand[] {
	const resolvedAgentDir = agentDir ?? "";
	const globalDir = join(homedir(), ".pi", "agent", "prompts");
	const projectDir = resolve(cwd, ".pi", "prompts");

	const results: PromptCommand[] = [];

	scanDirectory(globalDir, "user", results);
	scanDirectory(projectDir, "project", results);

	// Deduplicate by name — project overrides global
	const byName = new Map<string, PromptCommand>();
	for (const cmd of results) {
		byName.set(cmd.name, cmd); // last wins = project wins
	}

	return [...byName.values()];
}

function scanDirectory(
	dir: string,
	source: PromptSource,
	results: PromptCommand[],
): void {
	if (!existsSync(dir)) return;

	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
		);
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

		const filePath = join(dir, entry.name);
		const name = entry.name.slice(0, -3);

		if (RESERVED_COMMAND_NAMES.has(name)) continue;

		try {
			const rawContent = readFileSync(filePath, "utf-8");
			const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(rawContent);

			// Check if this prompt has our extension-specific fields
			const hasPreset = typeof frontmatter.preset === "string" && frontmatter.preset.trim();
			const hasRun = typeof frontmatter.run === "string" && frontmatter.run.trim();
			const hasModel = typeof frontmatter.model === "string" && frontmatter.model.trim();
			const hasThinking = typeof frontmatter.thinking === "string" && frontmatter.thinking.trim();

			// Only register if any extension-specific field present
			if (!hasPreset && !hasRun && !hasModel && !hasThinking) continue;

			// Parse model specs (comma-separated → array)
			let modelSpecs: string[] | undefined;
			if (typeof frontmatter.model === "string" && frontmatter.model.trim()) {
				const specs = frontmatter.model.split(",").map(s => s.trim()).filter(Boolean);
				const invalid = specs.find(s => !isValidModelSpec(s));
				if (invalid) continue; // skip prompt with invalid model spec
				modelSpecs = specs.length > 0 ? specs : undefined;
			}

			// Parse thinking level
			let thinking: string | undefined;
			if (typeof frontmatter.thinking === "string" && frontmatter.thinking.trim()) {
				const normalized = frontmatter.thinking.trim().toLowerCase();
				if (VALID_THINKING_LEVELS.has(normalized)) {
					thinking = normalized;
				}
			}

			// Parse handoff
			let handoff: PromptCommand["handoff"] = "always";
			if (typeof frontmatter.handoff === "string" && frontmatter.handoff.trim()) {
				const normalized = frontmatter.handoff.trim().toLowerCase();
				if (VALID_HANDOFF_VALUES.has(normalized)) {
					handoff = normalized as PromptCommand["handoff"];
				}
			}

			// Parse timeout
			let timeout = 30000;
			if (typeof frontmatter.timeout === "number" && frontmatter.timeout > 0) {
				timeout = frontmatter.timeout;
			} else if (typeof frontmatter.timeout === "string") {
				const parsed = parseInt(frontmatter.timeout as string, 10);
				if (!isNaN(parsed) && parsed > 0) timeout = parsed;
			}

			const description = typeof frontmatter.description === "string"
				? frontmatter.description
				: "";

			results.push({
				name,
				description,
				content: body,
				filePath,
				preset: hasPreset ? frontmatter.preset as string : undefined,
				model: modelSpecs,
				thinking,
				run: hasRun ? frontmatter.run as string : undefined,
				handoff,
				timeout,
				source,
			});
		} catch {
			// Skip unreadable/invalid files
		}
	}
}

// ---------------------------------------------------------------------------
// Argument substitution
// ---------------------------------------------------------------------------

/**
 * Parse command args string into array, respecting quoted strings.
 */
export function parseCommandArgs(argsString: string): string[] {
	const args: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (let i = 0; i < argsString.length; i++) {
		const char = argsString[i];

		if (inQuote) {
			if (char === inQuote) {
				inQuote = null;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuote = char;
		} else if (/\s/.test(char)) {
			if (current) {
				args.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}

	if (current) {
		args.push(current);
	}

	return args;
}

/**
 * Substitute argument placeholders in template content.
 * - $@ → all args joined
 * - $1, $2, ... → nth arg (1-indexed)
 * - ${@:N} → args from N onward
 * - ${@:N:M} → M args from N onward
 */
export function substituteArgs(content: string, args: string[]): string {
	let result = content;

	// ${@:N:M} and ${@:N} — must process before $@
	result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
		let start = parseInt(startStr, 10) - 1;
		if (start < 0) start = 0;

		if (lengthStr) {
			const length = parseInt(lengthStr, 10);
			return args.slice(start, start + length).join(" ");
		}

		return args.slice(start).join(" ");
	});

	// $1, $2, ... — must process before $@
	result = result.replace(/\$(\d+)/g, (_, num) => {
		const index = parseInt(num, 10) - 1;
		return args[index] ?? "";
	});

	// $@ — all args
	const allArgs = args.join(" ");
	result = result.replace(/\$@/g, allArgs);

	return result;
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

const PREFERRED_PROVIDERS = ["openai-codex", "anthropic", "github-copilot", "openrouter"];

export interface ResolvedModel {
	model: any;
	alreadyActive: boolean;
}

/**
 * Resolve model from comma-separated specs with provider fallback.
 * If current model matches one of specs → return alreadyActive.
 * Otherwise try each spec in order.
 */
export async function resolveModel(
	specs: string[],
	currentModel: any,
	modelRegistry: any,
): Promise<ResolvedModel | undefined> {
	// Check if current model matches
	if (currentModel) {
		for (const spec of specs) {
			if (modelSpecMatches(spec, currentModel)) {
				return { model: currentModel, alreadyActive: true };
			}
		}
	}

	// Try each spec
	for (const spec of specs) {
		const slashIndex = spec.indexOf("/");
		if (slashIndex !== -1) {
			const provider = spec.slice(0, slashIndex);
			const modelId = spec.slice(slashIndex + 1);
			const model = modelRegistry.find?.(provider, modelId);
			if (model) {
				const auth = await modelRegistry.getApiKeyAndHeaders?.(model);
				if (auth?.ok) return { model, alreadyActive: false };
			}
		} else {
			// Bare model ID — try preferred providers
			const allModels = modelRegistry.getAvailable?.() ?? modelRegistry.getAll?.() ?? [];
			const matches = allModels.filter((m: any) => m.id === spec);

			// Sort by provider preference
			matches.sort((a: any, b: any) => {
				const aIdx = PREFERRED_PROVIDERS.indexOf(a.provider);
				const bIdx = PREFERRED_PROVIDERS.indexOf(b.provider);
				return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
			});

			for (const model of matches) {
				const auth = await modelRegistry.getApiKeyAndHeaders?.(model);
				if (auth?.ok) return { model, alreadyActive: false };
			}
		}
	}

	return undefined;
}

function modelSpecMatches(spec: string, model: any): boolean {
	const slashIndex = spec.indexOf("/");
	if (slashIndex !== -1) {
		const provider = spec.slice(0, slashIndex);
		const modelId = spec.slice(slashIndex + 1);
		return provider === model.provider && modelId === model.id;
	}
	return spec === model.id;
}

// ---------------------------------------------------------------------------
// Deterministic step execution
// ---------------------------------------------------------------------------

const MAX_OUTPUT_BYTES = 10 * 1024; // 10KB cap per stream

/**
 * Run a shell command with timeout. Returns structured result.
 */
export async function runDeterministicStep(
	command: string,
	timeoutMs: number,
	cwd: string,
): Promise<DeterministicResult> {
	const startTime = Date.now();

	return new Promise<DeterministicResult>((resolve) => {
		const child = exec(command, { cwd, timeout: timeoutMs }, (error, stdoutBuf, stderrBuf) => {
			const durationMs = Date.now() - startTime;

			let out = (stdoutBuf ?? "").toString();
			let err = (stderrBuf ?? "").toString();
			let truncated = false;

			if (out.length > MAX_OUTPUT_BYTES) {
				out = out.slice(0, MAX_OUTPUT_BYTES);
				truncated = true;
			}
			if (err.length > MAX_OUTPUT_BYTES) {
				err = err.slice(0, MAX_OUTPUT_BYTES);
				truncated = true;
			}

			resolve({
				command,
				exitCode: error?.killed ? null : (error?.code as number ?? 0),
				timedOut: error?.killed ?? false,
				durationMs,
				stdout: out,
				stderr: err,
				truncated,
			});
		});
	});
}

/**
 * Build a structured preamble for the LLM from a deterministic step result.
 */
export function buildDeterministicPreamble(result: DeterministicResult): string {
	const lines: string[] = [];
	lines.push(`[Deterministic step]`);
	lines.push(`  status: ${result.timedOut ? "TIMEOUT" : (result.exitCode === 0 ? "SUCCESS" : "FAILED")}`);
	lines.push(`  exitCode: ${result.exitCode ?? "N/A"}`);
	lines.push(`  command: ${result.command}`);
	lines.push(`  duration: ${result.durationMs}ms`);

	if (result.stdout) {
		const preview = result.stdout.length > 500
			? result.stdout.slice(0, 500) + "..."
			: result.stdout;
		lines.push(`  stdout:`);
		for (const line of preview.split("\n")) {
			lines.push(`    ${line}`);
		}
	}

	if (result.stderr) {
		const preview = result.stderr.length > 500
			? result.stderr.slice(0, 500) + "..."
			: result.stderr;
		lines.push(`  stderr:`);
		for (const line of preview.split("\n")) {
			lines.push(`    ${line}`);
		}
	}

	if (result.truncated) {
		lines.push(`  (output truncated at ${MAX_OUTPUT_BYTES} bytes)`);
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command description for autocomplete
// ---------------------------------------------------------------------------

/**
 * Build a human-readable description for the command palette.
 */
export function buildCommandDescription(cmd: PromptCommand): string {
	const parts: string[] = [];
	if (cmd.preset) parts.push(`preset:${cmd.preset}`);
	if (cmd.model?.length) parts.push(cmd.model.join("|"));
	if (cmd.thinking) parts.push(`thinking:${cmd.thinking}`);
	if (cmd.run) parts.push(`run:${cmd.run.length > 20 ? cmd.run.slice(0, 17) + "..." : cmd.run}`);
	const source = `(${cmd.source})`;
	const details = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
	return cmd.description ? `${cmd.description} ${details}${source}` : `${details}${source}`;
}
