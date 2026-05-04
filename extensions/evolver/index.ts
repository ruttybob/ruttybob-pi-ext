/**
 * evolver — pi-адаптер для GEP-powered self-evolution.
 *
 * Следует протоколу evolver-а (как Claude Code / Cursor / Codex):
 * - session_start → инжект evolution memory
 * - tool_result (write/edit) → signal detection
 * - agent_end → record outcome в memory graph
 * - Tool "evolve" → evolver run (GEP prompt)
 * - Tool "evolve_review" → review --approve + solidify
 * - /evolve command → управление
 */

import {
	type EvolveDetails,
	STRATEGIES,
	StrategyEnum,
	EVOLVER_MARKER,
} from "./types.js";
import { formatDuration, makeResult } from "./utils.js";
import { appendSectionToFile, removeSectionFromFile } from "./markdown.js";
import {
	renderEvolveCall,
	renderEvolveResult,
	renderEvolveReviewCall,
	renderEvolveReviewResult,
} from "./render.js";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";

import { detectSignals, detectSignalsFromDiff } from "./signal-detect.js";
import {
	readLastNEntries,
	appendEntry,
	formatMemoryDigest,
	getEvolutionDir,
} from "./memory-graph.js";
import { getGitDiffStats } from "./git-diff.js";
import {
	runEvolver,
	checkEvolverInstalled,
	isGitRepo,
	type EvolverResult,
} from "./runner.js";

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const sessionSignals = new Set<string>();
let sessionFilesEdited = 0;
let sessionStartTime: number | null = null;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// =========================================================================
	// Lifecycle: session_start — инжект evolution memory
	// =========================================================================

	pi.on("session_start", async (_event, ctx) => {
		sessionSignals.clear();
		sessionFilesEdited = 0;
		sessionStartTime = Date.now();

		if (!isGitRepo(ctx.cwd)) return;

		const digest = await formatMemoryDigest(ctx.cwd, 5);
		if (!digest) return;

		pi.sendMessage(
			{
				customType: "evolver-memory",
				content: digest,
				display: "🧬 Evolution Memory",
				details: { entries: (await readLastNEntries(ctx.cwd, 5)).length },
			},
			{ triggerTurn: false },
		);
	});

	// =========================================================================
	// Lifecycle: tool_result — signal detection на file edits
	// =========================================================================

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		sessionFilesEdited++;

		// Извлекаем текст из content
		const textContent = event.content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");

		const signals = detectSignals(textContent);
		for (const s of signals) {
			sessionSignals.add(s);
		}

		if (signals.length > 0 && ctx.hasUI) {
			ctx.ui.setStatus("evolver", `signals: [${[...sessionSignals].join(", ")}]`);
		}
	});

	// =========================================================================
	// Lifecycle: agent_end — record outcome в memory graph
	// =========================================================================

	pi.on("agent_end", async (_event, ctx) => {
		if (!isGitRepo(ctx.cwd)) return;
		if (sessionFilesEdited === 0) return;

		const diffStats = await getGitDiffStats(ctx.cwd);
		if (!diffStats.hasChanges) return;

		// Собираем сигналы из diff + накопленные за сессию
		const diffSignals = detectSignalsFromDiff(diffStats.diffSnippet);
		for (const s of diffSignals) sessionSignals.add(s);

		const signals = [...sessionSignals];
		if (signals.length === 0) signals.push("stable_success_plateau");

		const hasErrors =
			signals.includes("log_error") || signals.includes("test_failure");
		const status = hasErrors ? "failed" : "success";
		const score = hasErrors ? 0.3 : 0.8;

		// Записываем в memory graph
		const ok = await appendEntry(ctx.cwd, {
			timestamp: new Date().toISOString(),
			gene_id: "ad_hoc",
			signals,
			outcome: {
				status,
				score,
				note: `Session end: ${diffStats.summary}. Signals: [${signals.join(", ")}]`,
			},
			source: "hook:pi-agent-session-end",
		});

		if (ok && ctx.hasUI) {
			ctx.ui.setStatus(
				"evolver",
				`recorded: ${status} (score=${score})`,
			);
		}
	});

	// =========================================================================
	// Tool: evolve — запускает evolver run (GEP prompt)
	// =========================================================================

	pi.registerTool({
		name: "evolve",
		label: "Evolve",
		description: [
			"Run GEP evolution analysis on the current project.",
			"Scans memory/evolution/ for signals, selects matching Gene, emits evolution prompt.",
			"Use after making changes to trigger evolution analysis.",
			"Requires evolver CLI installed globally and cwd to be a git repo.",
		].join(" "),
		promptSnippet:
			"evolve(strategy) - Run GEP evolution cycle on current project",
		parameters: Type.Object({
			strategy: Type.Optional(StrategyEnum),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const strategy = (params.strategy ?? "balanced") as
				| "balanced"
				| "innovate"
				| "harden"
				| "repair-only";

			if (!isGitRepo(ctx.cwd)) {
				return makeResult(
					"Ошибка: текущая директория не является git-репозиторием. Evolver требует git.",
					{
						exitCode: -1,
						strategy,
						durationMs: 0,
						aborted: false,
						timedOut: false,
					},
				);
			}

			const check = await checkEvolverInstalled();
			if (!check.installed) {
				return makeResult(
					`Ошибка: ${check.error || "evolver CLI не найден."}`,
					{
						exitCode: -1,
						strategy,
						durationMs: 0,
						aborted: false,
						timedOut: false,
					},
				);
			}

			ctx.ui?.setStatus("evolver", `running (${strategy})...`);

			const partialOutput: string[] = [];

			const result = await runEvolver({
				cwd: ctx.cwd,
				strategy,
				review: false,
				signal,
				onOutput: (chunk) => {
					partialOutput.push(chunk);
					if (onUpdate) {
						onUpdate({
							content: [
								{
									type: "text",
									text: partialOutput.join(""),
								},
							],
							details: {
								exitCode: 0,
								strategy,
								durationMs: 0,
								aborted: false,
								timedOut: false,
							},
						});
					}
				},
			});

			const details: EvolveDetails = {
				exitCode: result.exitCode,
				strategy,
				durationMs: result.durationMs,
				aborted: result.aborted,
				timedOut: result.timedOut,
			};

			ctx.ui?.setStatus("evolver", undefined);

			if (result.aborted) {
				return makeResult(
					"Evolution cycle прерван пользователем (Ctrl+C).",
					details,
				);
			}
			if (result.timedOut) {
				return makeResult(
					`Evolution cycle превысил таймаут (180s). Stderr: ${result.stderr || "(пусто)"}`,
					details,
				);
			}
			if (result.exitCode !== 0) {
				return makeResult(
					`Evolver завершился с ошибкой (exit ${result.exitCode}). ${result.stderr}`,
					details,
				);
			}

			let output = result.stdout;
			if (result.stderr) {
				output += `\n\n--- stderr ---\n${result.stderr}`;
			}

			return makeResult(output || "(evolver: no output)", details);
		},

		renderCall(args, theme, _context) {
			return renderEvolveCall(args);
		},

		renderResult(result, { expanded }, theme, _context) {
			return renderEvolveResult(result, expanded, theme);
		},
	});

	// =========================================================================
	// Tool: evolve_review — approve/reject + solidify
	// =========================================================================

	pi.registerTool({
		name: "evolve_review",
		label: "Evolve Review",
		description: [
			"Review and approve/reject evolution changes.",
			"Runs `evolver review --approve` followed by `evolver solidify` to confirm successful mutations.",
			"Or `evolver review --reject` to rollback pending changes.",
		].join(" "),
		promptSnippet:
			"evolve_review(approve, reject) - Approve or reject evolution changes",
		parameters: Type.Object({
			approve: Type.Optional(Type.Boolean({ default: true })),
			reject: Type.Optional(Type.Boolean({ default: false })),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!isGitRepo(ctx.cwd)) {
				return makeResult(
					"Ошибка: не git-репозиторий.",
					{
						exitCode: -1,
						strategy: "review",
						durationMs: 0,
						aborted: false,
						timedOut: false,
					},
				);
			}

			const check = await checkEvolverInstalled();
			if (!check.installed) {
				return makeResult(
					`Ошибка: ${check.error || "evolver CLI не найден."}`,
					{
						exitCode: -1,
						strategy: "review",
						durationMs: 0,
						aborted: false,
						timedOut: false,
					},
				);
			}

			ctx.ui?.setStatus("evolver", "reviewing...");

			if (params.reject) {
				const result = await runEvolver({
					cwd: ctx.cwd,
					review: false,
					signal,
				});
				ctx.ui?.setStatus("evolver", undefined);
				// reject не через runEvolver — нужен отдельный subprocess с аргументами
				// Пока используем exec через runner
				return makeResult(
					result.exitCode === 0
						? "Changes rejected and rolled back."
						: `Reject failed: ${result.stderr}`,
					{
						exitCode: result.exitCode,
						strategy: "review",
						durationMs: result.durationMs,
						aborted: result.aborted,
						timedOut: result.timedOut,
					},
				);
			}

			// approve: evolver review --approve → evolver solidify
			const reviewResult = await runEvolver({
				cwd: ctx.cwd,
				review: true,
				signal,
			});

			if (reviewResult.exitCode !== 0) {
				ctx.ui?.setStatus("evolver", undefined);
				return makeResult(
					`Review failed (exit ${reviewResult.exitCode}): ${reviewResult.stderr}`,
					{
						exitCode: reviewResult.exitCode,
						strategy: "review",
						durationMs: reviewResult.durationMs,
						aborted: reviewResult.aborted,
						timedOut: reviewResult.timedOut,
					},
				);
			}

			ctx.ui?.setStatus("evolver", "solidifying...");
			const solidifyResult = await runEvolver({
				cwd: ctx.cwd,
				review: false,
				signal,
			});

			ctx.ui?.setStatus("evolver", undefined);

		const solidOk = solidifyResult.exitCode === 0;
		return makeResult(
			[
				`Review: approved ✓`,
				`Solidify: ${solidOk ? "✓ success" : "✗ " + solidifyResult.stderr}`,
				solidOk ? "" : `\n--- stderr ---\n${solidifyResult.stderr}`,
			].join("\n"),
				{
					exitCode: solidifyResult.exitCode,
					strategy: "solidify",
					durationMs:
						reviewResult.durationMs + solidifyResult.durationMs,
					aborted:
						reviewResult.aborted || solidifyResult.aborted,
					timedOut:
						reviewResult.timedOut || solidifyResult.timedOut,
				},
			);
		},

		renderCall(args, theme, _context) {
			return renderEvolveReviewCall(args);
		},

		renderResult(result, { expanded }, theme, _context) {
			return renderEvolveReviewResult(result, theme);
		},
	});

	// =========================================================================
	// Slash command: /evolve
	// =========================================================================

	pi.registerCommand("evolve", {
		description:
			"Evolver adapter: /evolve [strategy] | /evolve status | /evolve review | /evolve setup | /evolve uninstall",
		getArgumentCompletions(prefix: string) {
			const opts: Array<{ label: string; detail: string }> = [];
			for (const s of STRATEGIES) {
				if (s.startsWith(prefix)) {
					opts.push({
						label: s,
						detail: `Strategy: ${s}`,
					});
				}
			}
			if ("status".startsWith(prefix))
				opts.push({
					label: "status",
					detail: "Show signals + recent memory entries",
				});
			if ("review".startsWith(prefix))
				opts.push({
					label: "review",
					detail: "Approve and solidify pending evolution",
				});
			if ("setup".startsWith(prefix))
				opts.push({
					label: "setup",
					detail: "Inject Evolution Memory section into AGENTS.md",
				});
			if ("uninstall".startsWith(prefix))
				opts.push({
					label: "uninstall",
					detail: "Remove Evolution Memory section from AGENTS.md",
				});
			return opts;
		},
		handler: async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "status";

			// ---- /evolve status ----
			if (subcommand === "status") {
				const signals = [...sessionSignals];
				const entries = await readLastNEntries(ctx.cwd, 5);
				const duration =
					sessionStartTime !== null
						? formatDuration(Date.now() - sessionStartTime)
						: "N/A";

				const lines = [
					`🧬 Evolver adapter — session status`,
					`  Files edited: ${sessionFilesEdited}`,
					`  Session duration: ${duration}`,
					`  Signals detected: ${signals.length > 0 ? signals.join(", ") : "(none)"}`,
					`  Memory graph entries: ${entries.length}`,
				];

				if (entries.length > 0) {
					const digest = await formatMemoryDigest(ctx.cwd, 5);
					if (digest) lines.push(`\n${digest}`);
				} else {
					lines.push(
						"\n  No evolution history yet. Start working — signals will be recorded at session end.",
					);
				}

				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// ---- /evolve setup ----
			if (subcommand === "setup") {
				const agentsMdPath = path.join(ctx.cwd, "AGENTS.md");
				const section = `${EVOLVER_MARKER}
## Evolution Memory (Evolver)

This project uses evolver for self-evolution. The pi-agent extension automatically:
1. Injects recent evolution memory at session start
2. Detects evolution signals during file edits
3. Records outcomes at session end

For substantive tasks, call \`evolve\` before work and \`evolve_review\` after.
Signals: log_error, perf_bottleneck, user_feature_request, capability_gap, deployment_issue, test_failure.`;

				const injected = await appendSectionToFile(
					agentsMdPath,
					EVOLVER_MARKER,
					section,
				);

				ctx.ui.notify(
					injected
						? `[evolver] Evolution Memory section injected into ${agentsMdPath}`
						: `[evolver] Evolution Memory section already present in ${agentsMdPath}`,
					injected ? "info" : "warning",
				);
				return;
			}

			// ---- /evolve uninstall ----
			if (subcommand === "uninstall") {
				const agentsMdPath = path.join(ctx.cwd, "AGENTS.md");
				const removed = await removeSectionFromFile(
					agentsMdPath,
					EVOLVER_MARKER,
				);

				ctx.ui.notify(
					removed
						? `[evolver] Evolution Memory section removed from ${agentsMdPath}`
						: `[evolver] No Evolution Memory section found in ${agentsMdPath}`,
					removed ? "info" : "warning",
				);
				return;
			}

			// ---- /evolve review ----
			if (subcommand === "review") {
				if (!isGitRepo(ctx.cwd)) {
					ctx.ui.notify("Evolver требует git-репозиторий", "error");
					return;
				}

				const check = await checkEvolverInstalled();
				if (!check.installed) {
					ctx.ui.notify(
						check.error || "evolver CLI не найден",
						"error",
					);
					return;
				}

				ctx.ui.setStatus("evolver", "reviewing...");
				ctx.ui.setWorkingMessage("Running evolver review...");

				const result = await runEvolver({
					cwd: ctx.cwd,
					review: true,
				});

				ctx.ui.setStatus("evolver", "solidifying...");

				if (result.exitCode === 0) {
					const solidResult = await runEvolver({
						cwd: ctx.cwd,
						review: false,
					});
					ctx.ui.setStatus("evolver", undefined);
					ctx.ui.setWorkingMessage();

					if (solidResult.exitCode === 0) {
						ctx.ui.notify(
							"✓ Evolution changes approved and solidified.",
							"info",
						);
					} else {
						ctx.ui.notify(
							`✗ Solidify failed: ${solidResult.stderr}`,
							"error",
						);
					}
				} else {
					ctx.ui.setStatus("evolver", undefined);
					ctx.ui.setWorkingMessage();
					ctx.ui.notify(
						`✗ Review failed: ${result.stderr}`,
						"error",
					);
				}
				return;
			}

			// ---- /evolve <strategy> — запуск evolver ----
			if (!isGitRepo(ctx.cwd)) {
				ctx.ui.notify("Evolver требует git-репозиторий", "error");
				return;
			}

			const check = await checkEvolverInstalled();
			if (!check.installed) {
				ctx.ui.notify(
					check.error || "evolver CLI не найден",
					"error",
				);
				return;
			}

			let strategy: "balanced" | "innovate" | "harden" | "repair-only" =
				"balanced";
			if (
				(STRATEGIES as readonly string[]).includes(subcommand)
			) {
				strategy = subcommand as typeof strategy;
			}

			ctx.ui.setStatus("evolver", `running (${strategy})...`);
			ctx.ui.setWorkingMessage("Running evolver...");

			const result = await runEvolver({
				cwd: ctx.cwd,
				strategy,
			});

			ctx.ui.setStatus("evolver", undefined);
			ctx.ui.setWorkingMessage();

			if (result.aborted || result.exitCode !== 0) {
				ctx.ui.notify(
					`Evolver: ${result.stderr || "ошибка"}`,
					"error",
				);
				return;
			}

			if (result.stdout) {
				pi.sendMessage(
					{
						customType: "evolver-result",
						content: result.stdout,
						display: `Evolution: ${strategy}`,
						details: {
							strategy,
							duration: result.durationMs,
						},
					},
					{ triggerTurn: false },
				);
			} else {
				ctx.ui.notify("Evolver: no output", "info");
			}
		},
	});
}
