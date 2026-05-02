/**
 * Stub-модуль для @mariozechner/pi-coding-agent.
 *
 * Предоставляет минимальные экспорты, необходимые для тестирования расширений,
 * которые импортируют типы и функции из pi SDK.
 */

// --- Типы ---
export interface ExtensionAPI {
	on(event: string, handler: (...args: any[]) => any): void;
	registerTool(tool: any): void;
	registerCommand(name: string, definition: any): void;
	registerFlag(name: string, definition: any): void;
	registerShortcut(key: string, definition: any): void;
	getActiveTools(): any[];
	getAllTools(): any[];
	setActiveTools(tools: string[]): void;
	setModel(model: any): Promise<boolean>;
	setThinkingLevel(level: any): void;
	appendEntry<T>(type: string, data: T): void;
	getCommands(): any[];
	getFlag(name: string): any;
	exec(
		cmd: string,
		args: string[],
		options?: Record<string, unknown>,
	): Promise<{ code: number; stdout: string; stderr: string }>;
	sendUserMessage(message: string, options?: Record<string, unknown>): void;
	events?: { on(event: string, handler: (...args: any[]) => void): void; emit(event: string, data: unknown): void };
	[key: string]: unknown;
}

export interface ExtensionCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: string): void;
		select(prompt: string, options: string[]): Promise<string | undefined>;
		input(prompt: string, defaultValue?: string): Promise<string | undefined>;
		custom<T>(factory: (...args: any[]) => any): Promise<T>;
		setWidget(
			key: string,
			lines: string[] | undefined,
			options?: Record<string, unknown>,
		): void;
		theme: { fg(color: string, text: string): string; bold(text: string): string };
	};
	sessionManager: {
		getBranch(): any[];
		getEntries(): any[];
	};
	hasUI: boolean;
	modelRegistry?: {
		find(provider: string, model: string): any;
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
		getAvailable(): { provider: string; id: string }[];
		getApiKeyAndHeaders(model: any): Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }>;
	};
}

export interface ExtensionContext {
	config?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ExtensionUIContext {
	[key: string]: unknown;
}

export interface SessionHeader {
	type?: string;
	parentSession?: string;
	[key: string]: unknown;
}

export interface AgentToolResult {
	[key: string]: unknown;
}

export interface MessageRenderer {
	[key: string]: unknown;
}

export interface MessageRenderOptions {
	[key: string]: unknown;
}

export interface Theme {
	[key: string]: unknown;
}

export interface ModelRegistry {
	[key: string]: unknown;
}

export interface CustomEntry<T = unknown> {
	type: "custom";
	customType: string;
	data?: T;
}

export interface SessionEntry {
	type: string;
	[key: string]: unknown;
}

export interface SessionMessageEntry {
	type: "message";
	message: {
		role: string;
		content: any;
		[key: string]: unknown;
	};
}

export class DynamicBorder {
	constructor(private _fn: (s: string) => string) {}
}

// --- Заглушки runtime-функций ---

export function buildSessionContext(
	_branch: any[],
	_leafId: string,
): { messages: any[] } {
	return { messages: [] };
}

export function convertToLlm(messages: any[]): any[] {
	return messages;
}

export function serializeConversation(messages: any[]): string {
	return JSON.stringify(messages, null, 2);
}

export function getAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? "";
}

import { join } from 'node:path';

export function getProjectPresetsPath(cwd: string): string {
	return join(cwd, '.pi', 'presets.json');
}

export function parseFrontmatter<T = Record<string, unknown>>(
	content: string,
): { frontmatter: T; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {} as T, body: content };
	}

	const frontmatter: Record<string, unknown> = {};
	const raw = match[1];
	for (const line of raw.split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value: unknown = line.slice(idx + 1).trim();
		if (value === "true") value = true;
		else if (value === "false") value = false;
		else if (value !== "" && !isNaN(Number(value))) value = Number(value);
		frontmatter[key] = value;
	}

	return { frontmatter: frontmatter as T, body: match[2] || "" };
}

export function getMarkdownTheme(): any {
	return {};
}

export function loadSkills(
	_options: Record<string, unknown>,
): { skills: { name: string; description: string }[] } {
	return { skills: [] };
}

export class AuthStorage {
	static getApiKey(_provider: string): string | undefined {
		return undefined;
	}
}

export function createAgentSession() {}
export function createAgentSessionRuntime() {}
export class SessionManager {}
export class SettingsManager {
	static create(_cwd?: string, _agentDir?: string) { return new SettingsManager(); }
}
export class DefaultPackageManager {
	constructor(_options: { cwd: string; agentDir: string; settingsManager: SettingsManager }) {}
	async resolve() {
		return { extensions: [], skills: [], prompts: [], themes: [] };
	}
}
export function defineTool() {}

// --- truncateHead stub ---
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINES = 2000;

export interface TruncateResult {
	content: string;
	truncated: boolean;
	outputLines: number;
	totalLines: number;
}

export function withFileMutationQueue<T>(
	_filePath: string,
	fn: () => Promise<T>,
): Promise<T> {
	return fn();
}

export function truncateHead(
	text: string,
	_options?: { maxLines?: number; maxBytes?: number },
): TruncateResult {
	const lines = text.split("\n");
	return {
		content: text,
		truncated: false,
		outputLines: lines.length,
		totalLines: lines.length,
	};
}
