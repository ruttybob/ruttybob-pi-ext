/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports two modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import { loadSubagentConfig } from "./config.js";
import { buildSchema, buildDescription } from "./schema.js";
import { runSingleAgent } from "./runner.js";
import { renderCall, renderResult } from "./render.js";
import type { OnUpdateCallback, SingleResult, SubagentDetails } from "./types.js";
import { getFinalOutput } from "./utils.js";

export default function (pi: ExtensionAPI) {
	// --- Команда: /agents:list ---

	pi.registerCommand("agents:list", {
		description: "List available agents",

		async handler(_args: string, ctx: ExtensionCommandContext) {
			if (!ctx.hasUI) return;

			const runtimeConfig = loadSubagentConfig(ctx.cwd);
			const discovery = discoverAgents(ctx.cwd, runtimeConfig.agentScope);

			if (discovery.agents.length === 0) {
				ctx.ui.notify("No agents available.", "info");
				return;
			}

			const lines = discovery.agents.map(
				(a) => `${a.name} (${a.source}): ${a.description}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --- Команда: /agents:spawn ---

	pi.registerCommand("agents:spawn", {
		description: "Spawn an agent: /agents:spawn <agent> <task>",

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
				ctx.ui.notify("Usage: /agents:spawn <agent> <task>", "warning");
				return;
			}

			const firstSpace = trimmed.indexOf(" ");
			const agentName = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
			const task = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

			if (!task) {
				ctx.ui.notify("Usage: /agents:spawn <agent> <task>", "warning");
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
		description: buildDescription(bootAgents),
		parameters: buildSchema(),

		async execute(_toolCallId: string, params: Record<string, any>, signal: AbortSignal, onUpdate: ((update: any) => void) | undefined, ctx: ExtensionCommandContext) {
			// Конфиг перечитывается при каждом вызове — hot-reload
			const runtimeConfig = loadSubagentConfig(ctx.cwd);

			const agentScope: AgentScope = runtimeConfig.agentScope;
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = runtimeConfig.confirmProjectAgents;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasSingle);

			const makeDetails =
				(mode: "single" | "chain") =>
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
							details: makeDetails(hasChain ? "chain" : "single")([]),
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
