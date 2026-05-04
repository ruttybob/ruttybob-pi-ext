/**
 * Subagent — условная сборка JSON-схемы tool.
 *
 * Если config.parallelEnabled === false, поле tasks отсутствует в схеме.
 */

import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import type { SubagentConfig } from "./config.js";

// --- Переиспользуемые подсхемы ---

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
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
		agentScope: Type.Optional(AgentScopeSchema),
		confirmProjectAgents: Type.Optional(
			Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
		),
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
export function buildDescription(config: SubagentConfig): string {
	const parts = [
		"Delegate tasks to specialized subagents with isolated context.",
		"Modes: single (agent + task)",
	];

	if (config.parallelEnabled) {
		parts[1] += ", parallel (tasks array)";
	}

	parts[1] += ", chain (sequential with {previous} placeholder).";

	if (!config.parallelEnabled) {
		parts.push('Parallel mode requires "subagent.parallelEnabled: true" in settings.');
	}

	parts.push('Default agent scope is "user" (from ~/.pi/agent/agents).');
	parts.push('To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").');

	return parts.join(" ");
}
