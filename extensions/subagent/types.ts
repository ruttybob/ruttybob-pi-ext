/**
 * Типы и интерфейсы для subagent-расширения.
 *
 * POS-модуль (Plain Old TypeScript Structures) — без побочных эффектов и зависимостей.
 */

import type { Message } from "@mariozechner/pi-ai";
import { type AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { AgentScope } from "./agents.js";

// --- Usage-статистика ---

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

// --- Результат одного агента ---

export interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

// --- Детали ответа subagent tool ---

export interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
}

// --- Элементы отображения ---

export type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

// --- Callback для промежуточных обновлений ---

export type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;
