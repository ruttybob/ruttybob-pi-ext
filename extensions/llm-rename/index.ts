import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Api, Model, TextContent } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import {
	type CustomEntry,
	DynamicBorder,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
	type AutocompleteItem,
	Container,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	Text,
} from "@earendil-works/pi-tui";
import {
	getConversationTranscript,
	getFirstUserMessageText,
	parseRenameMd,
	sanitizeSessionName,
} from "./utils.js";
import { classifyError, classifyStopError, errorUserMessage } from "./errors.js";
import { tryRead, atomicWrite, readJsonFile } from "./fs.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-haiku-4-5";
const CUSTOM_ENTRY_TYPE = "pi-auto-rename-config";
const CONFIG_PATH = join(homedir(), ".pi", "agent", "extensions", "pi-auto-rename.json");

const SYSTEM_PROMPT =
	"You create short, descriptive session names for chat sessions with AI. " +
	"Use 2-3 words in Title Case. Respond with only the name, no quotes or punctuation.";

const SUBCOMMANDS = ["model", "prompt", "on", "off", "show", "reset", "help"];
const USAGE =
	"Usage: /rename [model [provider/model] | prompt [set <text> | reset] | on | off | show | reset | help]";

// ─── Config types ─────────────────────────────────────────────────────────────

interface ModelRef {
	provider: string;
	id: string;
}

interface Config {
	model: ModelRef;
	autoRename: boolean;
	prompt?: string;
}

const defaultConfig = (): Config => ({
	model: { provider: DEFAULT_PROVIDER, id: DEFAULT_MODEL },
	autoRename: true,
});

function formatRef(ref: ModelRef): string {
	return `${ref.provider}/${ref.id}`;
}

function parseRef(input: string): ModelRef | null {
	const trimmed = input.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0 || slash === trimmed.length - 1) return null;
	return { provider: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) };
}

// ─── Config persistence ───────────────────────────────────────────────────────

async function readConfigFile(): Promise<Config | null> {
	const raw = await readJsonFile<Record<string, unknown>>(CONFIG_PATH);
	if (!raw) return null;
	const model = raw?.model as Record<string, unknown> | undefined;
	const autoRename = raw?.autoRename;
	if (typeof model?.provider === "string" && typeof model?.id === "string") {
		return {
			model: { provider: model.provider.trim(), id: model.id.trim() },
			autoRename: typeof autoRename === "boolean" ? autoRename : true,
			prompt: typeof raw?.prompt === "string" ? raw.prompt : undefined,
		};
	}
	return null;
}

async function writeConfigFile(config: Config): Promise<boolean> {
	try {
		await atomicWrite(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
		return true;
	} catch {
		return false;
	}
}

function readSessionConfig(ctx: ExtensionCommandContext): Config | null {
	for (const entry of [...ctx.sessionManager.getEntries()].reverse()) {
		if (entry.type !== "custom") continue;
		const custom = entry as CustomEntry<Config>;
		if (custom.customType !== CUSTOM_ENTRY_TYPE || !custom.data) continue;
		const { model, autoRename, prompt } = custom.data;
		if (typeof model?.provider === "string" && typeof model?.id === "string") {
			return {
				model: { provider: model.provider, id: model.id },
				autoRename: typeof autoRename === "boolean" ? autoRename : true,
				prompt: typeof prompt === "string" ? prompt : undefined,
			};
		}
	}
	return null;
}

async function loadConfig(ctx: ExtensionCommandContext): Promise<Config | null> {
	const file = await readConfigFile();
	if (file) return file;
	const session = readSessionConfig(ctx);
	if (session) await writeConfigFile(session);
	return session;
}

// ─── Auth resolution ──────────────────────────────────────────────────────────

async function resolveAuth(
	ctx: ExtensionCommandContext,
	ref: ModelRef,
): Promise<{ model: Model<Api>; apiKey?: string; headers?: Record<string, string> } | null> {
	const model = ctx.modelRegistry!.find(ref.provider, ref.id);
	if (!model) {
		notify(ctx, `Model not found: ${formatRef(ref)}`, "warning");
		return null;
	}
	const auth = await ctx.modelRegistry!.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		notify(
			ctx,
			`No auth for ${ref.provider}: ${auth.error}. Configure via /login or models.json.`,
			"warning",
		);
		return null;
	}
	return { model, apiKey: auth.apiKey, headers: auth.headers };
}

// ─── Model picker ─────────────────────────────────────────────────────────────

async function openModelPicker(
	ctx: ExtensionCommandContext,
	current: ModelRef,
	pi: ExtensionAPI,
): Promise<ModelRef | null> {
	const available = ctx.modelRegistry!
		.getAvailable()
		.map((m): ModelRef => ({ provider: m.provider, id: m.id }))
		.sort((a, b) => formatRef(a).localeCompare(formatRef(b)));

	if (available.length === 0) {
		notify(ctx, "No models with configured auth available.", "warning");
		return null;
	}
	if (!ctx.hasUI) {
		notify(ctx, "No interactive UI. Use: /rename model provider/model", "warning");
		return null;
	}

	pi?.events?.emit("custom-ui:shown", { timestamp: Date.now() });
	try {
	return ctx.ui.custom<ModelRef | null>((tui, theme, _kb, done) => {
		const kb = getKeybindings();
		const currentLabel = formatRef(current);
		const root = new Container();
		root.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		root.addChild(new Text(theme.fg("accent", theme.bold("Select Rename Model"))));
		root.addChild(new Text(theme.fg("muted", `Current: ${currentLabel}`)));
		root.addChild(new Text(theme.fg("muted", "Search:")));

		const search = new Input();
		root.addChild(search);

		const listBox = new Container();
		root.addChild(listBox);

		const toItems = (q: string): SelectItem[] => {
			const lq = q.toLowerCase();
			return available
				.filter(
					(m) => !lq || formatRef(m).toLowerCase().includes(lq) || m.id.toLowerCase().includes(lq),
				)
				.map((m) => ({ value: formatRef(m), label: m.id, description: m.provider }));
		};

		let list: SelectList;
		let lastValue: string | undefined = currentLabel;

		const rebuild = () => {
			const items = toItems(search.getValue().trim());
			const next = new SelectList(items, 10, {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			});
			next.onSelect = (item) => done(parseRef(item.value));
			next.onCancel = () => done(null);
			next.onSelectionChange = (item) => {
				lastValue = item.value;
			};
			const idx = lastValue ? items.findIndex((i) => i.value === lastValue) : -1;
			if (idx >= 0) next.setSelectedIndex(idx);
			list = next;
			listBox.clear();
			listBox.addChild(list);
		};

		rebuild();
		root.addChild(
			new Text(theme.fg("dim", "type to search | up/down navigate | enter select | esc cancel")),
		);
		root.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render: (w: number) => root.render(w),
			invalidate: () => root.invalidate(),
			handleInput: (data: string) => {
				const isNav =
					kb.matches(data, "tui.select.up") ||
					kb.matches(data, "tui.select.down") ||
					kb.matches(data, "tui.select.confirm") ||
					kb.matches(data, "tui.select.cancel");
				if (isNav) {
					list.handleInput(data);
					const sel = list.getSelectedItem();
					if (sel) lastValue = sel.value;
				} else {
					search.handleInput(data);
					rebuild();
				}
				tui.requestRender();
			},
		};
	});
	} finally {
		pi?.events?.emit("custom-ui:hidden", { timestamp: Date.now() });
	}
}

// ─── Session naming ───────────────────────────────────────────────────────────

function notify(ctx: ExtensionCommandContext, msg: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI) ctx.ui.notify(msg, level);
}

async function generateName(
	ctx: ExtensionCommandContext,
	ref: ModelRef,
	systemPrompt: string,
	instruction: string,
	content: string,
): Promise<string | null> {
	const resolved = await resolveAuth(ctx, ref);
	if (!resolved) return null;

	try {
		const prompt = {
			role: "user" as const,
			content: [
				{ type: "text" as const, text: `${instruction}\n\n${content}` },
			] satisfies TextContent[],
			timestamp: Date.now(),
		};
		const response = await completeSimple(
			resolved.model,
			{ systemPrompt, messages: [prompt] },
			{ apiKey: resolved.apiKey, headers: resolved.headers, maxTokens: 128, reasoning: "low" },
		);

		if (response.stopReason === "error") {
			const kind = classifyStopError(response.errorMessage);
			const detail = response.errorMessage ?? "unknown error";
			notify(ctx, errorUserMessage(kind, detail), kind === "unknown" ? "warning" : "info");
			return null;
		}

		const raw = response.content
			.filter((b): b is TextContent => b.type === "text")
			.map((b) => b.text)
			.join("\n");

		return sanitizeSessionName(raw) || null;
	} catch (err) {
		const kind = classifyError(err);
		const detail = err instanceof Error ? err.message : String(err);
		notify(ctx, errorUserMessage(kind, detail), kind === "unknown" ? "warning" : "info");
		return null;
	}
}

// ─── Prompt file loading ─────────────────────────────────────────────────────

const GLOBAL_RENAME_MD = join(homedir(), ".pi", "agent", "RENAME.md");

const DEFAULT_INSTRUCTION_AUTO =
	"Name this session based on the first user message. Use 2-3 words in Title Case.";
const DEFAULT_INSTRUCTION_MANUAL =
	"Name this session based on the full conversation history. Use 2-3 words in Title Case.";

async function readPromptFile(path: string): Promise<{ system?: string; instruction?: string } | null> {
	const raw = await tryRead(path);
	if (!raw) return null;
	return parseRenameMd(raw);
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function piAutoRename(pi: ExtensionAPI) {
	let config: Config = defaultConfig();
	// Загружаем реальный конфиг асинхронно при первом событии
	void readConfigFile().then((c) => {
		if (c) config = { ...config, ...c };
	});
	let namingAttempted = false;
	let namingInProgress = false;
	let cachedModels: ModelRef[] = [];
	let turnCount = 0;
	let lastRenameTurn = 0;

	const RENAME_INTERVAL = 10;

	// ── Internal helpers ──────────────────────────────────────────────────

	async function persist(updated: Partial<Config>): Promise<boolean> {
		config = { ...config, ...updated };
		if ("prompt" in updated && updated.prompt === undefined) delete config.prompt;
		pi.appendEntry<Config>(CUSTOM_ENTRY_TYPE, config);
		return await writeConfigFile(config);
	}

	async function loadPromptOverrides(ctx: ExtensionCommandContext): Promise<{
		systemPrompt: string;
		instructionAuto: string;
		instructionManual: string;
		systemSource: string;
		instructionSource: string;
	}> {
		// 1. Global file
		const global = await readPromptFile(GLOBAL_RENAME_MD);
		// 2. Project file
		const project = await readPromptFile(join(ctx.cwd, ".pi", "RENAME.md"));

		// 3. System prompt: project > global > default
		const systemFromFiles = project?.system ?? global?.system;
		const systemPrompt = systemFromFiles ?? SYSTEM_PROMPT;
		const systemSource = project?.system
			? ".pi/RENAME.md"
			: global?.system
				? "~/.pi/agent/RENAME.md"
				: "default";

		// 4. Instruction: CLI override > project > global > default
		const cliInstruction = config.prompt;
		const fileInstruction = project?.instruction ?? global?.instruction;

		const instructionAuto = cliInstruction ?? fileInstruction ?? DEFAULT_INSTRUCTION_AUTO;
		const instructionManual = cliInstruction ?? fileInstruction ?? DEFAULT_INSTRUCTION_MANUAL;

		const instructionSource = cliInstruction
			? "CLI override"
			: fileInstruction
				? project?.instruction
					? ".pi/RENAME.md"
					: "~/.pi/agent/RENAME.md"
				: "default";

		return { systemPrompt, instructionAuto, instructionManual, systemSource, instructionSource };
	}

	async function restoreConfig(ctx: ExtensionCommandContext): Promise<void> {
		config = await loadConfig(ctx) ?? defaultConfig();
	}

	function refreshModelCache(ctx: ExtensionCommandContext): void {
		cachedModels = ctx.modelRegistry!
			.getAvailable()
			.map((m: { provider: string; id: string }): ModelRef => ({ provider: m.provider, id: m.id }));
	}

	function resetNaming(): void {
		namingAttempted = false;
		namingInProgress = false;
		turnCount = 0;
		lastRenameTurn = 0;
	}

	function shouldRename(): boolean {
		if (turnCount === 1 && lastRenameTurn === 0) return true;
		if (turnCount > 1 && turnCount - lastRenameTurn >= RENAME_INTERVAL) return true;
		return false;
	}

	async function autoName(ctx: ExtensionCommandContext): Promise<void> {
		if (!config.autoRename) return;
		if (namingAttempted || namingInProgress) return;
		if (!shouldRename()) return;

		const branch = ctx.sessionManager.getBranch();
		const firstMsg = getFirstUserMessageText(branch);
		if (!firstMsg) return;

		namingAttempted = true;
		namingInProgress = true;
		lastRenameTurn = turnCount;
		try {
			const { systemPrompt, instructionAuto } = await loadPromptOverrides(ctx);
			const name = await generateName(
				ctx,
				config.model,
				systemPrompt,
				instructionAuto,
				`First user message:\n${firstMsg}`,
			);
			if (name) {
				pi.setSessionName(name);
				notify(ctx, `Session auto-renamed: ${name}`, "info");
			}
		} finally {
			namingInProgress = false;
		}
	}

	async function onSessionEvent(_event: unknown, ctx: ExtensionCommandContext): Promise<void> {
		resetNaming();
		await restoreConfig(ctx);
		refreshModelCache(ctx);
	}

	// ── /rename command ───────────────────────────────────────────────────

	pi.registerCommand("rename", {
		description: "Rename session with AI. Subcommands: model, prompt, on, off, show, reset, help.",

		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const trimmed = prefix.trimStart();

			if (!trimmed.includes(" ")) {
				const hits = SUBCOMMANDS.filter((s) => s.startsWith(trimmed));
				return hits.length > 0 ? hits.map((value) => ({ value, label: value })) : null;
			}

			const [sub, rest] = [
				trimmed.slice(0, trimmed.indexOf(" ")),
				trimmed.slice(trimmed.indexOf(" ") + 1),
			];
			if (sub === "model") {
				const refs = cachedModels.map(formatRef).filter((r) => r.startsWith(rest));
				return refs.length > 0 ? refs.map((r) => ({ value: `model ${r}`, label: r })) : null;
			}

			if (sub === "prompt") {
				const opts = ["set", "reset"].filter((s) => s.startsWith(rest));
				return opts.length > 0 ? opts.map((value) => ({ value: `prompt ${value}`, label: value })) : null;
			}

			return null;
		},

		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();

			// No args: rename from full conversation history
			if (!trimmed) {
				const transcript = getConversationTranscript(ctx.sessionManager.getBranch());
				if (!transcript) {
					notify(ctx, "No conversation history to generate a name from.", "warning");
					return;
				}
				const { systemPrompt, instructionManual } = await loadPromptOverrides(ctx);
				const name = await generateName(
					ctx,
					config.model,
					systemPrompt,
					instructionManual,
					`Conversation history:\n${transcript}`,
				);
				if (!name) return;
				pi.setSessionName(name);
				notify(ctx, `Session renamed: ${name}`, "info");
				return;
			}

			// --- Подкоманды: on / off ---

			if (trimmed === "on") {
				const ok = await persist({ autoRename: true });
				notify(ctx, `Auto-rename enabled.${ok ? "" : " (persist failed)"}`, ok ? "info" : "warning");
				return;
			}

			if (trimmed === "off") {
				const ok = await persist({ autoRename: false });
				notify(ctx, `Auto-rename disabled.${ok ? "" : " (persist failed)"}`, ok ? "info" : "warning");
				return;
			}

			if (trimmed === "show") {
				const status = config.autoRename ? "on" : "off";
				const { systemSource, instructionSource } = await loadPromptOverrides(ctx);
				notify(
					ctx,
					`Rename model: ${formatRef(config.model)} | Auto-rename: ${status} | System: ${systemSource} | Instruction: ${instructionSource}`,
					"info",
				);
				return;
			}

			if (trimmed === "reset") {
				const def = defaultConfig();
				const ok = await persist({ model: def.model, prompt: undefined });
				notify(
					ctx,
					`Rename config reset to defaults${ok ? "" : " (persist failed)"}`,
					ok ? "info" : "warning",
				);
				return;
			}

			if (trimmed === "help") {
				notify(ctx, USAGE, "info");
				return;
			}

			// --- Prompt subcommand ---

			if (trimmed === "prompt" || trimmed.startsWith("prompt ")) {
				const promptArg = trimmed.slice(6).trim();

				// /rename prompt → show current prompt info
				if (!promptArg) {
					const { systemPrompt, instructionAuto, systemSource, instructionSource } =
						await loadPromptOverrides(ctx);
					const sysPreview =
						systemPrompt.length > 120
							? `${systemPrompt.slice(0, 120)}…`
							: systemPrompt;
					const instrPreview =
						instructionAuto.length > 120
							? `${instructionAuto.slice(0, 120)}…`
							: instructionAuto;
					notify(ctx, `System (${systemSource}): ${sysPreview}`, "info");
					notify(ctx, `Instruction (${instructionSource}): ${instrPreview}`, "info");
					return;
				}

				// /rename prompt reset
				if (promptArg === "reset") {
					const ok = await persist({ ...config, prompt: undefined });
					notify(
						ctx,
						`Instruction override reset.${ok ? "" : " (persist failed)"}`,
						ok ? "info" : "warning",
					);
					return;
				}

				// /rename prompt set <text>
				if (promptArg.startsWith("set ")) {
					const text = promptArg.slice(4).trim();
					if (!text) {
						notify(
							ctx,
							"Instruction text cannot be empty. Use '/rename prompt reset' to restore default.",
							"warning",
						);
						return;
					}
					const ok = await persist({ ...config, prompt: text });
					notify(
						ctx,
						`Instruction override set.${ok ? "" : " (persist failed)"}`,
						ok ? "info" : "warning",
					);
					return;
				}

				notify(ctx, USAGE, "warning");
				return;
			}

			if (trimmed === "model" || trimmed.startsWith("model ")) {
				const modelArg = trimmed.slice(5).trim();

				// No model arg: open interactive picker
				if (!modelArg) {
					const picked = await openModelPicker(ctx, config.model, pi);
					if (!picked) return;
					const ok = await persist({ model: picked });
					notify(
						ctx,
						`Rename model set to ${formatRef(picked)}${ok ? "" : " (persist failed)"}`,
						ok ? "info" : "warning",
					);
					return;
				}

				// Direct model arg: validate and set
				const ref = parseRef(modelArg);
				if (!ref) {
					notify(ctx, USAGE, "warning");
					return;
				}
				const resolved = await resolveAuth(ctx, ref);
				if (!resolved) return;
				const ok = await persist({ model: ref });
				notify(
					ctx,
					`Rename model set to ${formatRef(ref)}${ok ? "" : " (persist failed)"}`,
					ok ? "info" : "warning",
				);
				return;
			}

			notify(ctx, USAGE, "warning");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────

	pi.on("session_start", async (event, ctx) => {
		await onSessionEvent(event, ctx);
		await autoName(ctx);
	});

	pi.on("session_tree", async (e, ctx) => { await onSessionEvent(e, ctx); });
	pi.on("session_switch", async (e, ctx) => { await onSessionEvent(e, ctx); });
	pi.on("session_fork", async (e, ctx) => { await onSessionEvent(e, ctx); });

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role === "user") turnCount++;
		await autoName(ctx);
	});
	pi.on("agent_end", async (_event, ctx) => {
		await autoName(ctx);
	});
}
