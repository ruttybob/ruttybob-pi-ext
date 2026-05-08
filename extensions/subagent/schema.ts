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
export function buildDescription(bootAgents?: AgentConfig[]): string {
	const parts = [
		"Delegate tasks to specialized subagents with isolated context. Modes:",
		"- single: { agent, task } — one agent, one task",
		"- chain: { chain: [{ agent, task }] } — sequential, pass output via {previous}",
	];

	if (bootAgents && bootAgents.length > 0) {
		const names = bootAgents.map((a) => a.name).join(", ");
		parts.push(`Available agents: ${names}.`);
	}

	return parts.join(" ");
}
