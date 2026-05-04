/**
 * Ralph Wiggum - Long-running agent loops for iterative development.
 * Port of Geoffrey Huntley's approach.
 *
 * v0.4.0: spawn-режим — каждая итерация запускается как
 * отдельный pi --mode json дочерний процесс без расширений.
 * Flat-режим удалён.
 */

import * as path from "node:path";
import { readdir, rename, rmdir } from "node:fs/promises";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	RALPH_DIR,
	COMPLETE_MARKER,
	DEFAULT_TEMPLATE,
	DEFAULT_REFLECT_INSTRUCTIONS,
	sanitize,
	getPath,
	getLoopDir,
	getRalphDir,
	getArchiveDir,
	tryDelete,
	safeMtimeMs,
	tryRemoveDir,
	buildProgressTemplate,
	buildReflectionTemplate,
} from "./files.js";
import { fileExists, tryRead, atomicWrite, ensureDir } from "../shared/fs.js";
import { buildSystemPromptAppend } from "./prompt-builder.js";
import { spawnChildSession } from "./child-session.js";
import {
	createProgressState,
	handleEvent,
	renderWidget,
	formatStatusText,
	RENDER_THROTTLE_MS,
	type ProgressState,
} from "./progress-display.js";

// --- Типы ---

type LoopStatus = "active" | "paused" | "completed";

export interface LoopState {
	name: string;
	taskFile: string;
	progressFile: string;
	reflectionFile: string;
	iteration: number;
	maxIterations: number;
	itemsPerIteration: number;
	reflectEvery: number;
	reflectInstructions: string;
	active: boolean;
	status: LoopStatus;
	startedAt: string;
	completedAt?: string;
	lastReflectionAt: number;
}

const STATUS_ICONS: Record<LoopStatus, string> = {
	active: "▶",
	paused: "⏸",
	completed: "✓",
};

const SEPARATOR =
	"───────────────────────────────────────────────────────────────────────";

// --- Точка входа ---

export default function (pi: ExtensionAPI) {
	let currentLoop: string | null = null;
	let abortController: AbortController | null = null;

	// --- State management ---

	function migrateState(
		raw: Partial<LoopState> & { name: string },
	): LoopState {
		if (!raw.status)
			raw.status = raw.active ? "active" : "paused";
		raw.active = raw.status === "active";

		// Миграция старых имён полей
		if ("reflectEveryItems" in raw && !raw.reflectEvery) {
			raw.reflectEvery = (raw as any).reflectEveryItems;
		}
		if (
			"lastReflectionAtItems" in raw &&
			raw.lastReflectionAt === undefined
		) {
			raw.lastReflectionAt = (raw as any)
				.lastReflectionAtItems;
		}

		// Миграция: старые плоские пути → подпапочные
		const sName = sanitize(raw.name);
		const migratePath = (
			filePath: string | undefined,
			canonical: string,
		): string => {
			if (!filePath) {
				return path.join(RALPH_DIR, sName, canonical);
			}
			// Если путь уже подпапочный — не менять
			if (filePath.includes(`${sName}/`)) return filePath;
			// Старый плоский путь → новый
			return path.join(RALPH_DIR, sName, canonical);
		};

		raw.taskFile = migratePath(raw.taskFile, "task.md");
		raw.progressFile = migratePath(raw.progressFile, "progress.md");
		raw.reflectionFile = migratePath(
			raw.reflectionFile,
			"reflection.md",
		);

		// Удалить устаревшее поле mode (flat/spawn) если есть
		delete (raw as any).mode;

		return raw as LoopState;
	}

	async function loadState(
		ctx: ExtensionContext,
		name: string,
		archived = false,
	): Promise<LoopState | null> {
		const content = await tryRead(
			getPath(ctx.cwd, name, ".state.json", archived),
		);
		return content
			? migrateState(JSON.parse(content))
			: null;
	}

	async function saveState(
		ctx: ExtensionContext,
		state: LoopState,
		archived = false,
	): Promise<void> {
		state.active = state.status === "active";
		const filePath = getPath(
			ctx.cwd,
			state.name,
			".state.json",
			archived,
		);
		await atomicWrite(
			filePath,
			JSON.stringify(state, null, 2),
		);
	}

	async function listLoops(
		ctx: ExtensionContext,
		archived = false,
	): Promise<LoopState[]> {
		const dir = archived
			? getArchiveDir(ctx.cwd)
			: getRalphDir(ctx.cwd);
		if (!await fileExists(dir)) return [];
		const entries = await readdir(dir, { withFileTypes: true });
		const results: (LoopState | null)[] = [];
		for (const d of entries) {
			if (!d.isDirectory() || d.name === "archive") continue;
			const statePath = path.join(dir, d.name, "state.json");
			const content = await tryRead(statePath);
			results.push(
				content ? migrateState(JSON.parse(content)) : null,
			);
		}
		return results.filter((s): s is LoopState => s !== null);
	}

	// --- Loop state transitions ---

	async function pauseLoop(
		ctx: ExtensionContext,
		state: LoopState,
		message?: string,
	): Promise<void> {
		state.status = "paused";
		state.active = false;
		await saveState(ctx, state);
		currentLoop = null;
		abortController = null;
		await updateUI(ctx);
		if (message && ctx.hasUI) ctx.ui.notify(message, "info");
	}

	async function completeLoop(
		ctx: ExtensionContext,
		state: LoopState,
		banner: string,
	): Promise<string> {
		state.status = "completed";
		state.completedAt = new Date().toISOString();
		state.active = false;
		await saveState(ctx, state);
		currentLoop = null;
		abortController = null;
		await updateUI(ctx);
		return banner;
	}

	async function stopLoop(
		ctx: ExtensionContext,
		state: LoopState,
		message?: string,
	): Promise<void> {
		state.status = "completed";
		state.completedAt = new Date().toISOString();
		state.active = false;
		await saveState(ctx, state);
		currentLoop = null;
		abortController = null;
		await updateUI(ctx);
		if (message && ctx.hasUI) ctx.ui.notify(message, "info");
	}

	// --- Loop runner ---

	interface LoopResult {
		banner: string;
		status: "completed" | "paused";
	}

	async function runLoop(
		ctx: ExtensionContext,
		state: LoopState,
		signal?: AbortSignal,
		onUpdate?: (update: { content: Array<{ type: "text"; text: string }> }) => void,
	): Promise<LoopResult> {
		while (state.status === "active") {
			// Проверка внешней отмены (ESC / session_shutdown)
			if (signal?.aborted) {
				return {
					banner: `⏸ Ralph loop "${state.name}" paused (iteration ${state.iteration}) — interrupted.`,
					status: "paused",
				};
			}

			// Подготовка промпта
			const progressContent = await tryRead(
				path.resolve(ctx.cwd, state.progressFile),
			);
			const reflectionContent = await tryRead(
				path.resolve(ctx.cwd, state.reflectionFile),
			);
			const taskContent = await tryRead(
				path.resolve(ctx.cwd, state.taskFile),
			);
			if (!taskContent) {
				await pauseLoop(
					ctx,
					state,
					`Error: Could not read task file: ${state.taskFile}`,
				);
				return {
					banner: `Error: Could not read task file: ${state.taskFile}`,
					status: "paused",
				};
			}

			const systemAppend = buildSystemPromptAppend(
				state,
				progressContent,
				reflectionContent,
			);

			const needsReflection =
				state.reflectEvery > 0 &&
				state.iteration > 1 &&
				(state.iteration - 1) % state.reflectEvery === 0;

			const prompt = needsReflection
				? `${state.reflectInstructions}\n\n## Current Task\n\n${taskContent}`
				: taskContent;

			abortController = new AbortController();

			// Прогресс-трекинг для текущей итерации
			const progressState = createProgressState();
			let lastRenderTime = 0;

			let childResult;
			try {
				childResult = await spawnChildSession({
					cwd: ctx.cwd,
					systemPromptAppend: systemAppend,
					prompt,
					signal: abortController.signal,
					onMessage: ctx.hasUI
						? (event) => {
								handleEvent(progressState, event);
								const now = Date.now();
								if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
									lastRenderTime = now;
									void updateUI(ctx, progressState);
								}
							}
						: undefined,
				});
			} catch (err: any) {
				state.status = "paused";
				state.active = false;
				await saveState(ctx, state);
				currentLoop = null;
				abortController = null;
				await updateUI(ctx);
				return {
					banner: err?.message?.includes("aborted")
						? `⏸ Ralph iteration ${state.iteration} was interrupted.`
						: `Child session error: ${err?.message || err}`,
					status: "paused",
				};
			}

			// Проверка отмены после child session
			if (signal?.aborted) {
				state.status = "paused";
				state.active = false;
				await saveState(ctx, state);
				currentLoop = null;
				abortController = null;
				await updateUI(ctx);
				return {
					banner: `⏸ Ralph loop "${state.name}" paused at iteration ${state.iteration}.`,
					status: "paused",
				};
			}

			// COMPLETE_MARKER → цикл завершён
			if (childResult.complete) {
				const banner = `${SEPARATOR}\n✅ RALPH LOOP COMPLETE: ${state.name} | ${state.iteration} iterations\n${SEPARATOR}`;
				await completeLoop(ctx, state, banner);
				return { banner, status: "completed" };
			}

			// Ошибка child-сессии → пауза
			if (childResult.exitCode !== 0) {
				const msg = `Child session failed (exit code ${childResult.exitCode}): ${childResult.stderr.slice(0, 200)}`;
				await pauseLoop(ctx, state, msg);
				return { banner: msg, status: "paused" };
			}

			// Итерация завершена нормально — проверить лимит
			state.iteration++;
			if (
				state.maxIterations > 0 &&
				state.iteration > state.maxIterations
			) {
				const banner = `${SEPARATOR}\n⚠️ RALPH LOOP STOPPED: ${state.name} | Max iterations (${state.maxIterations}) reached\n${SEPARATOR}`;
				await completeLoop(ctx, state, banner);
				return { banner, status: "completed" };
			}

			await saveState(ctx, state);
			await updateUI(ctx);

			// Прогресс через onUpdate (для tool) — не sendUserMessage
			onUpdate?.({
				content: [
					{
						type: "text",
						text: `🔄 Ralph iteration ${state.iteration - 1} complete for "${state.name}". ` +
							`Next: iteration ${state.iteration}. Continuing...`,
					},
				],
			});
		}

		// Если status уже не "active" — пауза
		return {
			banner: `⏸ Ralph loop "${state.name}" paused at iteration ${state.iteration}.`,
			status: "paused",
		};
	}

	// --- UI ---

	function formatLoop(l: LoopState): string {
		const status = `${STATUS_ICONS[l.status]} ${l.status}`;
		const iter =
			l.maxIterations > 0
				? `${l.iteration}/${l.maxIterations}`
				: `${l.iteration}`;
		return `${l.name}: ${status} (iteration ${iter})`;
	}

	async function updateUI(
		ctx: ExtensionContext,
		progress?: ProgressState,
	): Promise<void> {
		if (!ctx.hasUI) return;

		const state = currentLoop
			? await loadState(ctx, currentLoop)
			: null;
		if (!state) {
			ctx.ui.setStatus("ralph", undefined);
			ctx.ui.setWidget("ralph", undefined);
			return;
		}

		const { theme } = ctx.ui;
		const maxStr =
			state.maxIterations > 0
				? `/${state.maxIterations}`
				: "";

		// Status bar — live инструмент или статичный
		const statusText = progress
			? formatStatusText(
					progress,
					state.name,
					state.iteration,
					state.maxIterations,
				)
			: `🔄 ${state.name} (${state.iteration}${maxStr})`;
		ctx.ui.setStatus("ralph", theme.fg("accent", statusText));

		// Widget — live прогресс или статичный
		let lines: string[];
		if (progress) {
			lines = renderWidget(
				progress,
				state.name,
				state.iteration,
				state.maxIterations,
				theme,
			);
		} else {
			lines = [
				theme.fg("accent", theme.bold("Ralph Wiggum")),
				theme.fg("muted", `Loop: ${state.name}`),
				theme.fg(
					"dim",
					`Status: ${STATUS_ICONS[state.status]} ${state.status}`,
				),
				theme.fg(
					"dim",
					`Iteration: ${state.iteration}${maxStr}`,
				),
				theme.fg("dim", `Task: ${state.taskFile}`),
			];
			if (state.reflectEvery > 0) {
				const next =
					state.reflectEvery -
					((state.iteration - 1) % state.reflectEvery);
				lines.push(
					theme.fg("dim", `Next reflection in: ${next} iterations`),
				);
			}
		}

		// Общие hint'ы — всегда в конце виджета
		lines.push("");
		lines.push(
			theme.fg("warning", "ESC aborts child process"),
		);
		lines.push(
			theme.fg(
				"warning",
				"/ralph-stop ends the loop when child is not running",
			),
		);
		ctx.ui.setWidget("ralph", lines);
	}

	// --- Arg parsing ---

	function parseArgs(argsStr: string) {
		const tokens =
			argsStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
		const result = {
			name: "",
			maxIterations: 50,
			itemsPerIteration: 0,
			reflectEvery: 0,
			reflectInstructions: DEFAULT_REFLECT_INSTRUCTIONS,
		};

		for (let i = 0; i < tokens.length; i++) {
			const tok = tokens[i];
			const next = tokens[i + 1];
			if (tok === "--max-iterations" && next) {
				result.maxIterations =
					parseInt(next, 10) || 0;
				i++;
			} else if (
				tok === "--items-per-iteration" &&
				next
			) {
				result.itemsPerIteration =
					parseInt(next, 10) || 0;
				i++;
			} else if (tok === "--reflect-every" && next) {
				result.reflectEvery =
					parseInt(next, 10) || 0;
				i++;
			} else if (
				tok === "--reflect-instructions" &&
				next
			) {
				result.reflectInstructions = next.replace(
					/^"|"$/g,
					"",
				);
				i++;
			} else if (!tok.startsWith("--")) {
				result.name = tok;
			}
		}
		return result;
	}

	// --- Commands ---

	const commands: Record<
		string,
		(rest: string, ctx: ExtensionContext) => Promise<void>
	> = {
		async start(rest, ctx) {
			const args = parseArgs(rest);
			if (!args.name) {
				ctx.ui.notify(
					"Usage: /ralph start <name|path> [--items-per-iteration N] [--reflect-every N] [--max-iterations N]",
					"warning",
				);
				return;
			}

			const isPath =
				args.name.includes("/") ||
				args.name.includes("\\");
			const loopName = isPath
				? sanitize(
						path.basename(
							args.name,
							path.extname(args.name),
						),
					)
				: sanitize(args.name);
			const taskFile = isPath
				? args.name
				: path.join(RALPH_DIR, loopName, "task.md");
			const progressFile = path.join(
				RALPH_DIR,
				loopName,
				"progress.md",
			);
			const reflectionFile = path.join(
				RALPH_DIR,
				loopName,
				"reflection.md",
			);

			const existing = await loadState(ctx, loopName);
			if (existing?.status === "active") {
				ctx.ui.notify(
					`Loop "${loopName}" is already active. Use /ralph resume ${loopName}`,
					"warning",
				);
				return;
			}

			// Создать taskFile если нет
			const fullPath = path.resolve(ctx.cwd, taskFile);
			if (!await fileExists(fullPath)) {
				await atomicWrite(
					fullPath,
					DEFAULT_TEMPLATE,
				);
				ctx.ui.notify(
					`Created task file: ${taskFile}`,
					"info",
				);
			}

			// Создать progressFile если нет
			const progressPath = path.resolve(
				ctx.cwd,
				progressFile,
			);
			if (!await fileExists(progressPath)) {
				await atomicWrite(
					progressPath,
					buildProgressTemplate(loopName),
				);
			}

			// Создать reflectionFile если нет
			const reflectionPath = path.resolve(
				ctx.cwd,
				reflectionFile,
			);
			if (!await fileExists(reflectionPath)) {
				await atomicWrite(
					reflectionPath,
					buildReflectionTemplate(loopName),
				);
			}

			const state: LoopState = {
				name: loopName,
				taskFile,
				progressFile,
				reflectionFile,
				iteration: 1,
				maxIterations: args.maxIterations,
				itemsPerIteration: args.itemsPerIteration,
				reflectEvery: args.reflectEvery,
				reflectInstructions: args.reflectInstructions,
				active: true,
				status: "active",
				startedAt:
					existing?.startedAt ||
					new Date().toISOString(),
				lastReflectionAt: 0,
			};

			await saveState(ctx, state);
			currentLoop = loopName;
			await updateUI(ctx);

			const content = await tryRead(fullPath);
			if (!content) {
				ctx.ui.notify(
					`Could not read task file: ${taskFile}`,
					"error",
				);
				return;
			}

			// Запустить цикл в фоне, результат отправить через sendMessage
			const loopAbort = new AbortController();
			abortController = loopAbort;
			void runLoop(ctx, state, loopAbort.signal).then(
				(result) => {
					pi.sendMessage(
						{
							customType: "ralph-result",
							content: result.banner,
							display: true,
						},
						{ triggerTurn: false },
					);
				},
			);
		},

		async stop(_rest, ctx) {
			// Сначала abort дочерний процесс если есть
			if (abortController) {
				abortController.abort();
				abortController = null;
			}

			if (!currentLoop) {
				const active = (await listLoops(ctx)).find(
					(l) => l.status === "active",
				);
				if (active) {
					await pauseLoop(
						ctx,
						active,
						`Paused Ralph loop: ${active.name} (iteration ${active.iteration})`,
					);
				} else {
					ctx.ui.notify(
						"No active Ralph loop",
						"warning",
					);
				}
				return;
			}
			const state = await loadState(ctx, currentLoop);
			if (state) {
				await pauseLoop(
					ctx,
					state,
					`Paused Ralph loop: ${currentLoop} (iteration ${state.iteration})`,
				);
			}
		},

		async resume(rest, ctx) {
			const loopName = rest.trim();
			if (!loopName) {
				ctx.ui.notify(
					"Usage: /ralph resume <name>",
					"warning",
				);
				return;
			}

			const state = await loadState(ctx, loopName);
			if (!state) {
				ctx.ui.notify(
					`Loop "${loopName}" not found`,
					"error",
				);
				return;
			}
			if (state.status === "completed") {
				ctx.ui.notify(
					`Loop "${loopName}" is completed. Use /ralph start ${loopName} to restart`,
					"warning",
				);
				return;
			}

			// Pause current loop if different
			if (currentLoop && currentLoop !== loopName) {
				const curr = await loadState(ctx, currentLoop);
				if (curr) await pauseLoop(ctx, curr);
			}

			state.status = "active";
			state.active = true;
			state.iteration++;
			await saveState(ctx, state);
			currentLoop = loopName;
			await updateUI(ctx);

			ctx.ui.notify(
				`Resumed: ${loopName} (iteration ${state.iteration})`,
				"info",
			);

			const content = await tryRead(
				path.resolve(ctx.cwd, state.taskFile),
			);
			if (!content) {
				ctx.ui.notify(
					`Could not read task file: ${state.taskFile}`,
					"error",
				);
				return;
			}

			const loopAbort = new AbortController();
			abortController = loopAbort;
			void runLoop(ctx, state, loopAbort.signal).then(
				(result) => {
					pi.sendMessage(
						{
							customType: "ralph-result",
							content: result.banner,
							display: true,
						},
						{ triggerTurn: false },
					);
				},
			);
		},

		async status(_rest, ctx) {
			const loops = await listLoops(ctx);
			if (loops.length === 0) {
				ctx.ui.notify(
					"No Ralph loops found.",
					"info",
				);
				return;
			}
			ctx.ui.notify(
				`Ralph loops:\n${loops.map((l) => formatLoop(l)).join("\n")}`,
				"info",
			);
		},

		async cancel(rest, ctx) {
			const loopName = rest.trim();
			if (!loopName) {
				ctx.ui.notify(
					"Usage: /ralph cancel <name>",
					"warning",
				);
				return;
			}
			if (!await loadState(ctx, loopName)) {
				ctx.ui.notify(
					`Loop "${loopName}" not found`,
					"error",
				);
				return;
			}
			if (currentLoop === loopName) currentLoop = null;
			if (abortController) {
				abortController.abort();
				abortController = null;
			}
			tryDelete(
				getPath(ctx.cwd, loopName, ".state.json"),
			);
			ctx.ui.notify(`Cancelled: ${loopName}`, "info");
			await updateUI(ctx);
		},

		async archive(rest, ctx) {
			const loopName = rest.trim();
			if (!loopName) {
				ctx.ui.notify(
					"Usage: /ralph archive <name>",
					"warning",
				);
				return;
			}
			const state = await loadState(ctx, loopName);
			if (!state) {
				ctx.ui.notify(
					`Loop "${loopName}" not found`,
					"error",
				);
				return;
			}
			if (state.status === "active") {
				ctx.ui.notify(
					"Cannot archive active loop. Stop it first.",
					"warning",
				);
				return;
			}

			if (currentLoop === loopName) currentLoop = null;

			const srcDir = getLoopDir(ctx.cwd, loopName);
			const dstDir = getLoopDir(ctx.cwd, loopName, true);
			await ensureDir(dstDir);

			if (await fileExists(srcDir)) {
				const files = await readdir(srcDir);
				for (const file of files) {
					const src = path.join(srcDir, file);
					const dst = path.join(dstDir, file);
					if (await fileExists(src))
						await rename(src, dst);
				}
				try {
					await rmdir(srcDir);
				} catch {
					/* ignore */
				}
			}

			ctx.ui.notify(`Archived: ${loopName}`, "info");
			await updateUI(ctx);
		},

		async clean(rest, ctx) {
			const all = rest.trim() === "--all";
			const completed = (await listLoops(ctx)).filter(
				(l) => l.status === "completed",
			);

			if (completed.length === 0) {
				ctx.ui.notify(
					"No completed loops to clean",
					"info",
				);
				return;
			}

			for (const loop of completed) {
				if (all) {
					tryRemoveDir(
						getLoopDir(ctx.cwd, loop.name),
					);
				} else {
					tryDelete(
						getPath(
							ctx.cwd,
							loop.name,
							".state.json",
						),
					);
				}
				if (currentLoop === loop.name)
					currentLoop = null;
			}

			const suffix = all
				? " (all files)"
				: " (state only)";
			ctx.ui.notify(
				`Cleaned ${completed.length} loop(s)${suffix}:\n${completed.map((l) => `  • ${l.name}`).join("\n")}`,
				"info",
			);
			await updateUI(ctx);
		},

		async list(rest, ctx) {
			const archived = rest.trim() === "--archived";
			const loops = await listLoops(ctx, archived);

			if (loops.length === 0) {
				ctx.ui.notify(
					archived
						? "No archived loops"
						: "No loops found. Use /ralph list --archived for archived.",
					"info",
				);
				return;
			}

			const label = archived
				? "Archived loops"
				: "Ralph loops";
			ctx.ui.notify(
				`${label}:\n${loops.map((l) => formatLoop(l)).join("\n")}`,
				"info",
			);
		},

		async nuke(rest, ctx) {
			const force = rest.trim() === "--yes";
			const warning =
				"This deletes all .ralph state, task, and archive files. External task files are not removed.";

			const run = async () => {
				const dir = getRalphDir(ctx.cwd);
				if (!await fileExists(dir)) {
					if (ctx.hasUI)
						ctx.ui.notify(
							"No .ralph directory found.",
							"info",
						);
					return;
				}

				currentLoop = null;
				abortController = null;
				const ok = tryRemoveDir(dir);
				if (ctx.hasUI) {
					ctx.ui.notify(
						ok
							? "Removed .ralph directory."
							: "Failed to remove .ralph directory.",
						ok ? "info" : "error",
					);
				}
				await updateUI(ctx);
			};

			if (!force) {
				if (ctx.hasUI) {
					void ctx.ui
						.confirm(
							"Delete all Ralph loop files?",
							warning,
						)
						.then(async (confirmed) => {
							if (confirmed) await run();
						});
				} else {
					ctx.ui.notify(
						`Run /ralph nuke --yes to confirm. ${warning}`,
						"warning",
					);
				}
				return;
			}

			if (ctx.hasUI) ctx.ui.notify(warning, "warning");
			await run();
		},
	};

	const HELP = `Ralph Wiggum - Long-running development loops

Commands:
  /ralph start <name|path> [options]  Start a new loop
  /ralph stop                         Pause current loop
  /ralph resume <name>                Resume a paused loop
  /ralph status                       Show all loops
  /ralph cancel <name>                Delete loop state
  /ralph archive <name>               Move loop to archive
  /ralph clean [--all]                Clean completed loops
  /ralph list --archived              Show archived loops
  /ralph nuke [--yes]                 Delete all .ralph data
  /ralph-stop                         Stop active loop (idle only)

Options:
  --items-per-iteration N  Suggest N items per turn (prompt hint)
  --reflect-every N        Reflect every N iterations
  --max-iterations N       Stop after N iterations (default 50)

To stop: press ESC to interrupt, then run /ralph-stop when idle

Examples:
  /ralph start my-feature
  /ralph start review --items-per-iteration 5 --reflect-every 10
  /ralph start refactor`;

	pi.registerCommand("ralph", {
		description:
			"Ralph Wiggum - long-running development loops",
		handler: async (args, ctx) => {
			const [cmd] = args.trim().split(/\s+/);
			const handler = commands[cmd];
			if (handler) {
				await handler(args.slice(cmd.length).trim(), ctx);
			} else {
				ctx.ui.notify(HELP, "info");
			}
		},
	});

	pi.registerCommand("ralph-stop", {
		description: "Stop active Ralph loop (idle only)",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				if (ctx.hasUI) {
					ctx.ui.notify(
						"Agent is busy. Press ESC to interrupt, then run /ralph-stop.",
						"warning",
					);
				}
				return;
			}

			let state = currentLoop
				? await loadState(ctx, currentLoop)
				: null;
			if (!state) {
				const active = (await listLoops(ctx)).find(
					(l) => l.status === "active",
				);
				if (!active) {
					if (ctx.hasUI)
						ctx.ui.notify(
							"No active Ralph loop",
							"warning",
						);
					return;
				}
				state = active;
			}

			if (state.status !== "active") {
				if (ctx.hasUI)
					ctx.ui.notify(
						`Loop "${state.name}" is not active`,
						"warning",
					);
				return;
			}

			await stopLoop(
				ctx,
				state,
				`Stopped Ralph loop: ${state.name} (iteration ${state.iteration})`,
			);
		},
	});

	// --- Tools ---

	pi.registerTool({
		name: "ralph_start",
		label: "Start Ralph Loop",
		description:
			"Start a long-running development loop. Use for complex multi-iteration tasks.",
		promptSnippet:
			"Start a persistent multi-iteration development loop with pacing and reflection controls.",
		promptGuidelines: [
			"Use ralph_start when the user explicitly wants an iterative loop, autonomous repeated passes, or paced multi-step execution.",
			"Iterations run automatically as child processes — no need to advance manually.",
		],
		parameters: Type.Object({
			name: Type.String({
				description:
					"Loop name (e.g., 'refactor-auth')",
			}),
			taskContent: Type.String({
				description:
					"Task in markdown with goals and checklist",
			}),
			itemsPerIteration: Type.Optional(
				Type.Number({
					description:
						"Suggest N items per turn (0 = no limit)",
				}),
			),
			reflectEvery: Type.Optional(
				Type.Number({
					description:
						"Reflect every N iterations",
				}),
			),
			maxIterations: Type.Optional(
				Type.Number({
					description:
						"Max iterations (default: 50)",
					default: 50,
				}),
			),
		}),
		async execute(
			_toolCallId,
			params,
			_signal,
			_onUpdate,
			ctx,
		) {
			const loopName = sanitize(params.name);
			const taskFile = path.join(
				RALPH_DIR,
				loopName,
				"task.md",
			);
			const progressFile = path.join(
				RALPH_DIR,
				loopName,
				"progress.md",
			);
			const reflectionFile = path.join(
				RALPH_DIR,
				loopName,
				"reflection.md",
			);

			if (
				(await loadState(ctx, loopName))?.status === "active"
			) {
				return {
					content: [
						{
							type: "text",
							text: `Loop "${loopName}" already active.`,
						},
					],
					details: {},
				};
			}

			// Создать файлы
			const fullPath = path.resolve(ctx.cwd, taskFile);
			await atomicWrite(
				fullPath,
				params.taskContent,
			);

			const progressPath = path.resolve(
				ctx.cwd,
				progressFile,
			);
			await atomicWrite(
				progressPath,
				buildProgressTemplate(loopName),
			);

			const reflectionPath = path.resolve(
				ctx.cwd,
				reflectionFile,
			);
			await atomicWrite(
				reflectionPath,
				buildReflectionTemplate(loopName),
			);

			const state: LoopState = {
				name: loopName,
				taskFile,
				progressFile,
				reflectionFile,
				iteration: 1,
				maxIterations: params.maxIterations ?? 50,
				itemsPerIteration:
					params.itemsPerIteration ?? 0,
				reflectEvery: params.reflectEvery ?? 0,
				reflectInstructions:
					DEFAULT_REFLECT_INSTRUCTIONS,
				active: true,
				status: "active",
				startedAt: new Date().toISOString(),
				lastReflectionAt: 0,
			};

			await saveState(ctx, state);
			currentLoop = loopName;
			await updateUI(ctx);

			const result = await runLoop(
				ctx,
				state,
				_signal,
				_onUpdate,
			);

			return {
				content: [
					{
						type: "text",
						text: result.banner,
					},
				],
				details: {
					iterations: state.iteration,
					status: result.status,
				},
				// terminate: false — агент делает follow-up LLM call с результатом loop
			};
		},
	});

	// --- Event handlers ---

	pi.on("session_start", async (_event, ctx) => {
		const active = (await listLoops(ctx)).filter(
			(l) => l.status === "active",
		);

		if (!currentLoop && active.length > 0) {
			const mostRecent = active.reduce(
				(best, candidate) => {
					const bestMtime = safeMtimeMs(
						getPath(
							ctx.cwd,
							best.name,
							".state.json",
						),
					);
					const candidateMtime = safeMtimeMs(
						getPath(
							ctx.cwd,
							candidate.name,
							".state.json",
						),
					);
					return candidateMtime > bestMtime
						? candidate
						: best;
				},
			);
			currentLoop = mostRecent.name;
		}

		if (active.length > 0 && ctx.hasUI) {
			const lines = active.map(
				(l) =>
					`  • ${l.name} (iteration ${l.iteration}${l.maxIterations > 0 ? `/${l.maxIterations}` : ""})`,
			);
			ctx.ui.notify(
				`Active Ralph loops:\n${lines.join("\n")}\n\nUse /ralph resume <name> to continue`,
				"info",
			);
		}
		await updateUI(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (currentLoop) {
			const state = await loadState(ctx, currentLoop);
			if (state) await saveState(ctx, state);
		}
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	});
}
