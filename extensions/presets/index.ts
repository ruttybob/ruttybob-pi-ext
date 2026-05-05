/**
 * Presets Extension for pi
 *
 * Named presets that configure model, thinking level, tools,
 * and system prompt instructions.
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/presets.json (global)
 * - <cwd>/.pi/presets.json (project-local)
 *
 * Widget:
 *   preset-indicator (belowEditor) — shows all presets with active highlighted
 *
 * Commands:
 *   /preset              — show selector
 *   /preset <name>       — apply preset
 *   Ctrl+;        — cycle presets forward (overridable via keybindings.json)
 *   Ctrl+'        — cycle presets backward (overridable via keybindings.json)
 *   --preset <name>      — CLI flag
 *
 * Keybindings (~/.pi/agent/keybindings.json):
 *   presets.cycle-forward   — shortcut for forward cycling  (default: ctrl+')
 *   presets.cycle-backward  — shortcut for backward cycling (default: ctrl+;)
 */

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join, posix, resolve, relative } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import {
	discoverPromptCommands,
	parseCommandArgs,
	substituteArgs,
	resolveModel,
	runDeterministicStep,
	buildDeterministicPreamble,
	type PromptCommand,
} from "./prompt-commands.js";

// ---------------------------------------------------------------------------
// Keybindings
// ---------------------------------------------------------------------------

export const KB_CYCLE_FORWARD = "presets.cycle-forward";
export const KB_CYCLE_BACKWARD = "presets.cycle-backward";
export const DEFAULT_CYCLE_FORWARD = "ctrl+'";
export const DEFAULT_CYCLE_BACKWARD = "ctrl+;";

type ShortcutKey = Parameters<ExtensionAPI["registerShortcut"]>[0];

function getKeybindingsPath(): string {
	return join(process.env.HOME ?? os.homedir(), ".pi", "agent", "keybindings.json");
}

function normalizeShortcut(value: unknown): ShortcutKey | null {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized.length > 0 ? (normalized as ShortcutKey) : null;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const normalized = normalizeShortcut(entry);
			if (normalized !== null) return normalized;
		}
	}
	return null;
}

export function readKeybinding(keyId: string, kbPath = getKeybindingsPath()): ShortcutKey | null {
	try {
		const parsed = JSON.parse(readFileSync(kbPath, "utf8")) as Record<string, unknown>;
		return normalizeShortcut(parsed[keyId]);
	} catch {
		return null;
	}
}

export function resolveCycleForwardShortcut(kbPath?: string): ShortcutKey {
	return readKeybinding(KB_CYCLE_FORWARD, kbPath) ?? DEFAULT_CYCLE_FORWARD;
}

export function resolveCycleBackwardShortcut(kbPath?: string): ShortcutKey {
	return readKeybinding(KB_CYCLE_BACKWARD, kbPath) ?? DEFAULT_CYCLE_BACKWARD;
}

// ---------------------------------------------------------------------------
// Preset configuration
// ---------------------------------------------------------------------------
interface Preset {
	disabled?: boolean;
	provider?: string;
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	tools?: string[];
	instructions?: string;
	/**
	 * Glob patterns restricting where write/edit tools can write.
	 * Only paths matching at least one pattern are allowed.
	 * Patterns are relative to cwd. Supports *, **, and ?.
	 */
	restrictWritesTo?: string[];
}

interface PresetsConfig {
	[name: string]: Preset;
}

// ---------------------------------------------------------------------------
// Glob matching for file path restrictions
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern to a RegExp.
 * Supports: * → [^/]*, ** → .*, ? → [^/]
 *
 * @param glob - Glob pattern (e.g. ".plans/**", "*.md").
 * @returns Anchored RegExp.
 */
export function globPathToRegex(glob: string): RegExp {
	const parts = glob.split("**");
	const escaped = parts.map((part) =>
		part.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, "[^/]*")
			.replace(/\?/g, "[^/]"),
	);
	return new RegExp(`^${escaped.join(".*")}$`);
}

/**
 * Check whether a file path matches any of the given glob patterns.
 *
 * @param patterns  - Glob patterns (relative to cwd).
 * @param filePath  - Normalized relative file path.
 * @returns true if at least one pattern matches.
 */
export function matchesFilePath(patterns: string[], filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/");
	return patterns.some((p) => globPathToRegex(p).test(normalized));
}

/**
 * Normalize a tool path to a relative posix path from cwd.
 *
 * @param toolPath - Path from tool input (may be relative or absolute).
 * @param cwd      - Current working directory.
 * @returns Posix-style relative path (e.g. ".plans/plan.md").
 */
export function normalizeToolPath(toolPath: string, cwd: string): string {
	const abs = resolve(cwd, toolPath);
	const rel = relative(cwd, abs);
	return rel.replace(/\\/g, "/");
}

/**
 * Expand tool masks (e.g. "zai_*") into concrete tool names.
 * Returns expanded names + unresolved (masks or names with no match).
 */
export function expandToolMasks(tools: string[], allToolNames: string[]): { expanded: string[]; unresolved: string[] } {
	const expanded: string[] = [];
	const unresolved: string[] = [];

	for (const tool of tools) {
		if (tool.endsWith("*")) {
			const prefix = tool.slice(0, -1); // "zai_" from "zai_*"
			const matched = allToolNames.filter((n) => n.startsWith(prefix));
			if (matched.length > 0) {
				expanded.push(...matched);
			} else {
				unresolved.push(tool);
			}
		} else {
			if (allToolNames.includes(tool)) {
				expanded.push(tool);
			} else {
				unresolved.push(tool);
			}
		}
	}

	return { expanded, unresolved };
}

/**
 * Load presets from config files.
 * Project-local presets override global presets with the same name.
 */
export function loadPresets(cwd: string, agentDir?: string): PresetsConfig {
	const resolvedAgentDir = agentDir ?? getAgentDir();
	const globalPath = join(resolvedAgentDir, "presets.json");
	const projectPath = join(cwd, ".pi", "presets.json");

	let globalPresets: PresetsConfig = {};
	let projectPresets: PresetsConfig = {};

	if (existsSync(globalPath)) {
		try {
			globalPresets = JSON.parse(readFileSync(globalPath, "utf-8"));
		} catch {}
	}

	if (existsSync(projectPath)) {
		try {
			projectPresets = JSON.parse(readFileSync(projectPath, "utf-8"));
		} catch {}
	}

	const merged = { ...globalPresets, ...projectPresets };

	for (const [name, preset] of Object.entries(merged)) {
		if (preset.disabled === true) {
			delete merged[name];
		}
	}

	return merged;
}

interface OriginalState {
	model: any;
	thinkingLevel: string;
	tools: string[];
}

/**
 * Find the last active preset name from session branch entries.
 * Walks the branch (which includes parent sessions from reload/handoff)
 * and returns the most recent preset-state name.
 * Falls back to getEntries() when getBranch() is unavailable.
 */
export function findPresetInBranch(sessionManager: any): string | undefined {
	const branch = sessionManager.getBranch?.() ?? sessionManager.getEntries?.() ?? [];
	let presetName: string | undefined;
	for (const entry of branch) {
		if (entry.type === "custom" && entry.customType === "preset-state") {
			const data = entry.data as { name: string } | undefined;
			if (data?.name) {
				presetName = data.name;
			}
		}
	}
	return presetName;
}

export default function presetsExtension(pi: ExtensionAPI) {
	let presets: PresetsConfig = {};
	let activePresetName: string | undefined;
	let activePreset: Preset | undefined;
	let originalState: OriginalState | undefined;
	let widgetHandle: { invalidate(): void } | undefined;

	// ---------------------------------------------------------------------------
	// Prompt commands (frontmatter-driven)
	// ---------------------------------------------------------------------------

	let promptCommands = new Map<string, PromptCommand>();

	function refreshPromptCommands(cwd: string) {
		const discovered = discoverPromptCommands(cwd);
		promptCommands.clear();
		for (const cmd of discovered) {
			promptCommands.set(cmd.name, cmd);
		}
	}

	pi.on("input", async (event: any, ctx: any) => {
		const text: string = event.text;
		if (!text.startsWith("/")) return;

		const spaceIndex = text.indexOf(" ");
		const name = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const cmd = promptCommands.get(name);
		if (!cmd) return; // не наш — pi обработает как обычный template

		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

		// 1. Apply preset
		if (cmd.preset) {
			const preset = presets[cmd.preset];
			if (preset) {
				await applyPreset(cmd.preset, preset, ctx);
				ctx.ui.notify(`Preset "${cmd.preset}" activated`, "info");
				invalidateWidget();
			} else {
				ctx.ui.notify(`Preset "${cmd.preset}" not found`, "warning");
			}
		}

		// 2. Override model
		if (cmd.model && cmd.model.length > 0) {
			const resolved = await resolveModel(cmd.model, ctx.model, ctx.modelRegistry);
			if (resolved) {
				if (!resolved.alreadyActive) {
					await pi.setModel(resolved.model);
					ctx.ui.notify(`Model → ${resolved.model.id}`, "info");
				}
			} else {
				ctx.ui.notify(
					`No available model matching [${cmd.model.join(", ")}]`,
					"warning",
				);
			}
		}

		// 3. Override thinking
		if (cmd.thinking) {
			pi.setThinkingLevel(cmd.thinking);
		}

		// 4. Deterministic step
		let preamble = "";
		if (cmd.run) {
			const result = await runDeterministicStep(cmd.run, cmd.timeout, ctx.cwd);
			const icon = result.timedOut ? "⏱" : result.exitCode === 0 ? "✓" : "✗";
			ctx.ui.notify(
				`${icon} ${result.command} → exit ${result.exitCode} (${result.durationMs}ms)`,
				result.exitCode === 0 ? "info" : "error",
			);

			const shouldHandoff =
				cmd.handoff === "always" ? true :
				cmd.handoff === "never" ? false :
				cmd.handoff === "on-success" ? result.exitCode === 0 :
				cmd.handoff === "on-failure" ? result.exitCode !== 0 :
				true;

			if (!shouldHandoff) {
				return { action: "handled" as const };
			}
			preamble = buildDeterministicPreamble(result) + "\n\n";
		}

		// 5. Substitute args into template content
		const parsedArgs = parseCommandArgs(args);
		const expanded = substituteArgs(cmd.content, parsedArgs);

		// 6. Transform — pi обработает expanded text normally
		return { action: "transform" as const, text: preamble + expanded };
	});

	pi.registerFlag("preset", {
		description: "Preset configuration to use",
		type: "string",
	});

	/**
	 * Render preset indicator bar.
	 * Shows all preset names with the active one highlighted.
	 */
	function renderPresetBar(theme: any, _width: number): string[] {
		const names = Object.keys(presets).sort();
		if (names.length === 0) return [];

		const gear = activePresetName
			? theme.fg("accent", "⚙")
			: theme.fg("warning", "⚙");

		const parts: string[] = [];
		for (const name of names) {
			if (name === activePresetName) {
				parts.push(theme.bold(theme.fg("accent", name)));
			} else {
				parts.push(theme.fg("dim", name));
			}
		}

		return [" " + gear + " " + parts.join(theme.fg("dim", " ▸ ")) + " "];
	}

	function invalidateWidget() {
		widgetHandle?.invalidate();
	}

	async function applyPreset(name: string, preset: Preset, ctx: any): Promise<boolean> {
		// Snapshot state before first preset
		if (activePresetName === undefined) {
			originalState = {
				model: ctx.model,
				thinkingLevel: pi.getThinkingLevel(),
				tools: pi.getActiveTools(),
			};
		}

		// Apply model
		if (preset.provider && preset.model) {
			const model = ctx.modelRegistry.find(preset.provider, preset.model);
			if (model) {
				const success = await pi.setModel(model);
				if (!success) {
					ctx.ui.notify(`Preset "${name}": No API key for ${preset.provider}/${preset.model}`, "warning");
				}
			} else {
				ctx.ui.notify(`Preset "${name}": Model ${preset.provider}/${preset.model} not found`, "warning");
			}
		}

		// Apply thinking level
		if (preset.thinkingLevel) {
			pi.setThinkingLevel(preset.thinkingLevel);
		}

		// Apply tools — expand masks, then filter out unknown
		if (preset.tools && preset.tools.length > 0) {
			const allToolNames = pi.getAllTools().map((t: any) => t.name);
			const { expanded, unresolved } = expandToolMasks(preset.tools, allToolNames);

			if (unresolved.length > 0) {
				ctx.ui.notify(`Preset "${name}": Unknown tools: ${unresolved.join(", ")}`, "warning");
			}

			// Deduplicate
			const unique = [...new Set(expanded)];

			if (unique.length > 0) {
				pi.setActiveTools(unique);
			}
		}

		activePresetName = name;
		activePreset = preset;
		return true;
	}

	function buildPresetDescription(preset: Preset): string {
		const parts: string[] = [];
		if (preset.provider && preset.model) parts.push(`${preset.provider}/${preset.model}`);
		if (preset.thinkingLevel) parts.push(`thinking:${preset.thinkingLevel}`);
		if (preset.tools) parts.push(`tools:${preset.tools.join(",")}`);
		if (preset.instructions) {
			const t = preset.instructions.length > 30 ? `${preset.instructions.slice(0, 27)}...` : preset.instructions;
			parts.push(`"${t}"`);
		}
		return parts.join(" | ");
	}

	async function showPresetSelector(ctx: any): Promise<void> {
		const presetNames = Object.keys(presets);
		if (presetNames.length === 0) {
			ctx.ui.notify("No presets defined. Add presets to ~/.pi/agent/presets.json or .pi/presets.json", "warning");
			return;
		}

		const items: SelectItem[] = presetNames.map((name) => {
			const preset = presets[name];
			return {
				value: name,
				label: name === activePresetName ? `${name} (active)` : name,
				description: buildPresetDescription(preset),
			};
		});

		items.push({ value: "(none)", label: "(none)", description: "Clear active preset" });

		const result = await ctx.ui.custom<string | null>((tui: any, theme: any, _kb: any, done: (result: string | null) => void) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold("Select Preset"))));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text: string) => theme.fg("accent", text),
				selectedText: (text: string) => theme.fg("accent", text),
				description: (text: string) => theme.fg("muted", text),
				scrollInfo: (text: string) => theme.fg("dim", text),
				noMatch: (text: string) => theme.fg("warning", text),
			});

			selectList.onSelect = (item: SelectItem) => done(item.value);
			selectList.onCancel = () => done(null);

			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));

			return {
				render(width: number) { return container.render(width); },
				invalidate() { container.invalidate(); },
				handleInput(data: string) { selectList.handleInput(data); tui.requestRender(); },
			};
		});

		if (!result) return;

		if (result === "(none)") {
			activePresetName = undefined;
			activePreset = undefined;
			if (originalState) {
				if (originalState.model) await pi.setModel(originalState.model);
				pi.setThinkingLevel(originalState.thinkingLevel);
				pi.setActiveTools(originalState.tools);
			} else {
				pi.setActiveTools(["read", "bash", "edit", "write"]);
			}
			ctx.ui.notify("Preset cleared, defaults restored", "info");
			invalidateWidget();
			return;
		}

		const preset = presets[result];
		if (preset) {
			await applyPreset(result, preset, ctx);
			ctx.ui.notify(`Preset "${result}" activated`, "info");
			invalidateWidget();
		}
	}



	async function cyclePreset(ctx: any, direction: 1 | -1 = 1): Promise<void> {
		const presetNames = Object.keys(presets).sort();
		if (presetNames.length === 0) {
			ctx.ui.notify("No presets defined. Add presets to ~/.pi/agent/presets.json or .pi/presets.json", "warning");
			return;
		}

		const cycleList = ["(none)", ...presetNames];
		const currentName = activePresetName ?? "(none)";
		const currentIndex = cycleList.indexOf(currentName);
		const nextIndex = currentIndex === -1
			? (direction === 1 ? 0 : cycleList.length - 1)
			: (currentIndex + direction + cycleList.length) % cycleList.length;
		const nextName = cycleList[nextIndex];

		if (nextName === "(none)") {
			activePresetName = undefined;
			activePreset = undefined;
			if (originalState) {
				if (originalState.model) await pi.setModel(originalState.model);
				pi.setThinkingLevel(originalState.thinkingLevel);
				pi.setActiveTools(originalState.tools);
			} else {
				pi.setActiveTools(["read", "bash", "edit", "write"]);
			}
			ctx.ui.notify("Preset cleared, defaults restored", "info");
			invalidateWidget();
			return;
		}

		const preset = presets[nextName];
		if (!preset) return;

		await applyPreset(nextName, preset, ctx);
		ctx.ui.notify(`Preset "${nextName}" activated`, "info");
		invalidateWidget();
	}

	const cycleForwardKey = resolveCycleForwardShortcut();
	const cycleBackwardKey = resolveCycleBackwardShortcut();

	pi.registerShortcut(cycleForwardKey, {
		description: "Cycle presets forward",
		handler: async (ctx: any) => { await cyclePreset(ctx, 1); },
	});

	pi.registerShortcut(cycleBackwardKey, {
		description: "Cycle presets backward",
		handler: async (ctx: any) => { await cyclePreset(ctx, -1); },
	});

	pi.registerCommand("preset", {
		description: "Switch preset configuration",
		handler: async (args: string, ctx: any) => {
			if (args?.trim()) {
				const name = args.trim();
				const preset = presets[name];
				if (!preset) {
					const available = Object.keys(presets).join(", ") || "(none defined)";
					ctx.ui.notify(`Unknown preset "${name}". Available: ${available}`, "error");
					return;
				}
				await applyPreset(name, preset, ctx);
				ctx.ui.notify(`Preset "${name}" activated`, "info");
				invalidateWidget();
				return;
			}
			await showPresetSelector(ctx);
		},
	});

	// Intercept write/edit tool calls and enforce restrictWritesTo.
	const WRITE_TOOLS = new Set(["write", "edit"]);

	pi.on("tool_call", async (event: any, ctx: any) => {
		if (!activePreset?.restrictWritesTo || !WRITE_TOOLS.has(event.toolName)) return undefined;

		const toolPath = event.input?.path as string | undefined;
		if (!toolPath) return undefined;

		const normalized = normalizeToolPath(toolPath, ctx.cwd);
		const allowed = matchesFilePath(activePreset.restrictWritesTo, normalized);

		if (!allowed) {
			return {
				block: true,
				reason: `Write to "${normalized}" denied by preset "${activePresetName}". Allowed patterns: ${activePreset.restrictWritesTo.join(", ")}`,
			};
		}

		return undefined;
	});

	pi.on("before_agent_start", async (event: any) => {
		if (activePreset?.instructions) {
			return { systemPrompt: `${event.systemPrompt}\n\n${activePreset.instructions}` };
		}
	});

	pi.on("session_start", async (_event: any, ctx: any) => {
		presets = loadPresets(ctx.cwd, (ctx as any)?.agentDir);

		// Register prompt commands
		refreshPromptCommands(ctx.cwd);

		const presetFlag = pi.getFlag("preset");
		if (typeof presetFlag === "string" && presetFlag) {
			const preset = presets[presetFlag];
			if (preset) {
				await applyPreset(presetFlag, preset, ctx);
				ctx.ui.notify(`Preset "${presetFlag}" activated`, "info");
			} else {
				const available = Object.keys(presets).join(", ") || "(none defined)";
				ctx.ui.notify(`Unknown preset "${presetFlag}". Available: ${available}`, "warning");
			}
		}

		// Restore from session branch (survives reload/handoff)
		if (!presetFlag) {
			const restoredName = findPresetInBranch(ctx.sessionManager);
			if (restoredName) {
				const preset = presets[restoredName];
				if (preset) {
					await applyPreset(restoredName, preset, ctx);
				}
			}
		}

		// Register preset-indicator widget below editor
		ctx.ui.setWidget("preset-indicator", (tui: any, theme: any) => {
			const handle = {
				dispose() {},
				invalidate() {
					tui?.requestRender?.();
				},
				render(width: number): string[] {
					return renderPresetBar(theme, width);
				},
			};
			widgetHandle = handle;
			return handle;
		}, { placement: "belowEditor" });
	});

	pi.on("session_tree", async (_event: any, ctx: any) => {
		const restoredName = findPresetInBranch(ctx.sessionManager);
		if (restoredName) {
			const preset = presets[restoredName];
			if (preset) {
				await applyPreset(restoredName, preset, ctx);
				invalidateWidget();
			}
		} else if (activePresetName) {
			// No preset state in this branch — clear
			activePresetName = undefined;
			activePreset = undefined;
			if (originalState) {
				if (originalState.model) await pi.setModel(originalState.model);
				pi.setThinkingLevel(originalState.thinkingLevel);
				pi.setActiveTools(originalState.tools);
			}
			invalidateWidget();
		}
	});

	pi.on("turn_start", async () => {
		if (activePresetName) {
			pi.appendEntry("preset-state", { name: activePresetName });
		}
	});
}
