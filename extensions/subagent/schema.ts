/**
 * Subagent — условная сборка JSON-схемы tool.
 *
 * Если config.parallelEnabled === false, поле tasks отсутствует в схеме.
 */

import { Type } from "typebox";
import type { SubagentConfig } from "./config.js";
import type { AgentConfig } from "./agents.js";

// --- Переиспользуемые подсхемы ---

const TaskItem = Type.Object({
	agent: Type.Optional(Type.String({ description: "Agent name. Falls back to top-level agent param if omitted." })),
	task: Type.String({ description: "Task to delegate to the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

// --- Публичные функции ---

/**
 * Строит JSON-схему параметров subagent tool.
 * Если config.parallelEnabled === false — поле tasks не включается.
 */
export function buildSchema(config: SubagentConfig) {
	const properties: Record<string, any> = {
		agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
		task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
		chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),

		cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
	};

	if (config.parallelEnabled) {
		properties.tasks = Type.Optional(
			Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" }),
		);
	}

	return Type.Object(properties);
}

/**
 * Строит description для subagent tool.
 * Адаптируется под то, включён ли parallel mode.
 */
export function buildDescription(config: SubagentConfig, bootAgents?: AgentConfig[]): string {
	const parts = [
		"Delegate tasks to specialized subagents with isolated context. Modes:",
		"- single: { agent, task } — one agent, one task",
		"- chain: { chain: [{ agent, task }] } — sequential, pass output via {previous}",
	];

	if (config.parallelEnabled) {
		parts.push("- parallel: { agent?, tasks: [{ agent?, task }] } — run concurrently. Omit agent in tasks to inherit top-level agent.");
	}

	if (bootAgents && bootAgents.length > 0) {
		const names = bootAgents.map((a) => a.name).join(", ");
		parts.push(`Available agents: ${names}.`);
	}

	return parts.join(" ");
}
