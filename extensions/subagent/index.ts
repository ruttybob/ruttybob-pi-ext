/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { type ExtensionAPI, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import { type SubagentConfig, loadSubagentConfig } from "./config.js";
import { buildSchema, buildDescription } from "./schema.js";
import { runSingleAgent, mapWithConcurrencyLimit } from "./runner.js";
import { renderCall, renderResult } from "./render.js";
import type { OnUpdateCallback, SingleResult, SubagentDetails } from "./types.js";
import { getFinalOutput } from "./utils.js";

export default function (pi: ExtensionAPI) {
	// --- Команда: /subagents:list ---

	pi.registerCommand("subagents:list", {
		description: "List available subagents",

		async handler(_args: string, ctx: ExtensionCommandContext) {
			if (!ctx.hasUI) return;

			const runtimeConfig = loadSubagentConfig(ctx.cwd);
			const discovery = discoverAgents(ctx.cwd, runtimeConfig.agentScope);

			if (discovery.agents.length === 0) {
				ctx.ui.notify("No subagents available.", "info");
				return;
			}

			const lines = discovery.agents.map(
				(a) => `${a.name} (${a.source}): ${a.description}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --- Команда: /subagents:spawn ---

	pi.registerCommand("subagents:spawn", {
		description: "Spawn a subagent: /subagents:spawn <agent> <task>",

		getArgumentCompletions(argumentPrefix: string): AutocompleteItem[] {
			const runtimeConfig = loadSubagentConfig(process.cwd());
			const discovery = discoverAgents(process.cwd(), runtimeConfig.agentScope);

			const all = discovery.agents.map((a) => ({
				value: a.name,
				label: a.name,
				description: a.description,
			}));

			if (!argumentPrefix) return all;

			const lower = argumentPrefix.toLowerCase();
			return all.filter((item) => item.value.toLowerCase().startsWith(lower));
		},

		async handler(args: string, ctx: ExtensionCommandContext) {
			if (!ctx.hasUI) return;

			const trimmed = (args ?? "").trim();
			if (!trimmed) {
				ctx.ui.notify("Usage: /subagents:spawn <agent> <task>", "warning");
				return;
			}

			const firstSpace = trimmed.indexOf(" ");
			const agentName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
			const task = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

			if (!task) {
				ctx.ui.notify("Usage: /subagents:spawn <agent> <task>", "warning");
				return;
			}

			// Валидация: агент существует?
			const runtimeConfig = loadSubagentConfig(ctx.cwd);
			const discovery = discoverAgents(ctx.cwd, runtimeConfig.agentScope);
			const agent = discovery.agents.find((a) => a.name === agentName);

			if (!agent) {
				const available = discovery.agents.map((a) => a.name).join(", ") || "none";
				ctx.ui.notify(
					`Unknown agent "${agentName}". Available: ${available}`,
					"error",
				);
				return;
			}

			pi.sendUserMessage(
				`Use the subagent tool with agent "${agentName}" and task: ${task}`,
			);
		},
	});

	// Конфиг читается при загрузке — схема заморожена на всю сессию
	const config = loadSubagentConfig(process.cwd());

	// Дискавери при загрузке — чтобы перечислить имена агентов в tool description
	const bootAgents = discoverAgents(process.cwd(), config.agentScope).agents;

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: buildDescription(config, bootAgents),
		parameters: buildSchema(config),

		async execute(_toolCallId: string, params: Record<string, any>, signal: AbortSignal, onUpdate: ((update: any) => void) | undefined, ctx: ExtensionCommandContext) {
			// Конфиг перечитывается при каждом вызове — hot-reload лимитов
			const runtimeConfig = loadSubagentConfig(ctx.cwd);
			const effectiveMaxTasks = runtimeConfig.maxParallelTasks;
			const effectiveConcurrency = runtimeConfig.maxConcurrency;

			const agentScope: AgentScope = runtimeConfig.agentScope;
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = runtimeConfig.confirmProjectAgents;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): SubagentDetails => ({
					mode,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
					results,
				});

			if (modeCount !== 1) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}`,
						},
					],
					details: makeDetails("single")([]),
				};
			}

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const requestedAgentNames = new Set<string>();
				if (params.chain) for (const step of params.chain) requestedAgentNames.add(step.agent);
				if (params.tasks) for (const t of params.tasks) requestedAgentNames.add(t.agent);
				if (params.agent) requestedAgentNames.add(params.agent);

				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
					const names = projectAgentsRequested.map((a) => a.name).join(", ");
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return {
							content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
							details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([]),
						};
				}
			}

			if (params.chain && params.chain.length > 0) {
				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);

					// Create update callback that includes all previous results
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								// Combine completed results with current streaming result
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									const allResults = [...results, currentResult];
									onUpdate({
										content: partial.content,
										details: makeDetails("chain")(allResults),
									});
								}
							}
						: undefined;

					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						step.agent,
						taskWithContext,
						step.cwd,
						i + 1,
						signal,
						chainUpdate,
						makeDetails("chain"),
					);
					results.push(result);

					const isError =
						result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
					if (isError) {
						const errorMsg =
							result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
							details: makeDetails("chain")(results),
							isError: true,
						};
					}
					previousOutput = getFinalOutput(result.messages);
				}
				return {
					content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
					details: makeDetails("chain")(results),
				};
			}

			if (params.tasks && params.tasks.length > 0) {
				if (!runtimeConfig.parallelEnabled) {
					return {
						content: [
							{
								type: "text",
								text: "Parallel mode is disabled in config. This should not happen — the tasks parameter is not in the tool schema. Use single mode or chain instead.",
							},
						],
						details: makeDetails("parallel")([]),
						isError: true,
					};
				}

				if (params.tasks.length > effectiveMaxTasks)
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${params.tasks.length}). Max is ${effectiveMaxTasks}.`,
							},
						],
						details: makeDetails("parallel")([]),
					};

				// Resolve agent names: per-task agent or fallback to top-level agent
				const defaultAgent = params.agent || "worker";
				const resolvedTasks = (params.tasks as { agent?: string; task: string; cwd?: string }[]).map((t) => ({
					...t,
					agent: t.agent || defaultAgent,
				}));

				// Track all results for streaming updates
				const allResults: SingleResult[] = new Array(resolvedTasks.length);

				// Initialize placeholder results
				for (let i = 0; i < resolvedTasks.length; i++) {
					allResults[i] = {
						agent: resolvedTasks[i].agent,
						agentSource: "unknown",
						task: resolvedTasks[i].task,
						exitCode: -1, // -1 = still running
						messages: [],
						stderr: "",
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
					};
				}

				const emitParallelUpdate = () => {
					if (onUpdate) {
						const running = allResults.filter((r) => r.exitCode === -1).length;
						const done = allResults.filter((r) => r.exitCode !== -1).length;
						onUpdate({
							content: [
								{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` },
							],
							details: makeDetails("parallel")([...allResults]),
						});
					}
				};

				const results = await mapWithConcurrencyLimit(resolvedTasks, effectiveConcurrency, async (t, index) => {
					const result = await runSingleAgent(
						ctx.cwd,
						agents,
						t.agent,
						t.task,
						t.cwd,
						undefined,
						signal,
						// Per-task update callback
						(partial) => {
							if (partial.details?.results[0]) {
								allResults[index] = partial.details.results[0];
								emitParallelUpdate();
							}
						},
						makeDetails("parallel"),
					);
					allResults[index] = result;
					emitParallelUpdate();
					return result;
				});

				const successCount = results.filter((r) => r.exitCode === 0).length;
				const summaries = results.map((r) => {
					const output = getFinalOutput(r.messages) || r.stderr;
					const preview = output.slice(0, 200) + (output.length > 200 ? "..." : "");
					return `[${r.agent}] ${r.exitCode === 0 ? "completed" : "failed"}: ${preview || "(no output)"}`;
				});
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`,
						},
					],
					details: makeDetails("parallel")(results),
				};
			}

			if (params.agent && params.task) {
				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					params.agent,
					params.task,
					params.cwd,
					undefined,
					signal,
					onUpdate,
					makeDetails("single"),
				);
				const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
				if (isError) {
					const errorMsg =
						result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
					return {
						content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
						details: makeDetails("single")([result]),
						isError: true,
					};
				}
				return {
					content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
					details: makeDetails("single")([result]),
				};
			}

			const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
			return {
				content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall,
		renderResult,
	});
}
