/**
 * Subagent — условная сборка JSON-схемы tool.
 */

import { Type } from "typebox";
import type { AgentConfig } from "./agents.js";

// --- Переиспользуемые подсхемы ---

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

// --- Публичные функции ---

/**
 * Строит JSON-схему параметров subagent tool.
 */
export function buildSchema() {
	return Type.Object({
		agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
		task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
		chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
		cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
	});
}

/**
 * Строит description для subagent tool.
 */
export function buildDescription(): string {
	return "Modes: single { agent, task } or chain { chain: [{ agent, task }] } for sequential workflows.";
}

/**
 * Строит prompt guidelines для subagent tool — описания агентов для системного промпта.
 */
export function buildPromptGuidelines(agents: AgentConfig[]): string[] {
	const lines: string[] = [];

	for (const agent of agents) {
		lines.push(`subagent "${agent.name}": ${agent.description}`);
	}

	return lines;
}
