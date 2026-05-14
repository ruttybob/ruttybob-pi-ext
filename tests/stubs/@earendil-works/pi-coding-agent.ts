/**
 * Stub-модуль для @earendil-works/pi-coding-agent.
 *
 * Предоставляет минимальные экспорты, необходимые для тестирования расширений,
 * которые импортируют типы и функции из pi SDK.
 */

// --- Типы ---
export interface ExtensionAPI {
	on(event: string, handler: (...args: any[]) => any): void;
	registerTool(tool: any): void;
	registerCommand(name: string, definition: {
		description: string;
		handler: (args: string[], ctx: ExtensionCommandContext) => Promise<void> | void;
		[key: string]: unknown;
	}): void;
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
	sendMessage(message: string | Record<string, unknown>, options?: Record<string, unknown>): void;
	registerMessageRenderer<T = unknown>(customType: string, renderer: (message: Message & { details?: T }, options: MessageRenderOptions, theme: Theme) => string[] | { render(width: number): string[]; invalidate(): void } | undefined): void;
	getModelName(): string;
	setSessionName(name: string): void;
	getThinkingLevel(): any;
	events?: { on(event: string, handler: (...args: any[]) => void): void; emit(event: string, data: unknown): void };
	[key: string]: unknown;
}

export interface ExtensionCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: string): void;
		select(prompt: string, options: string[]): Promise<string | undefined>;
		input(prompt: string, defaultValue?: string): Promise<string | undefined>;
		confirm(title: string, message?: string): Promise<boolean>;
		custom<T>(factory: (...args: any[]) => any, options?: Record<string, unknown>): Promise<T>;
		setWidget(
			key: string,
			lines: string[] | undefined,
			options?: Record<string, unknown>,
		): void;
		setStatus(text: string, extra?: unknown): void;
		setHeader(factory: (tui: any, theme: any) => { render(width: number): string[]; invalidate(): void }): void;
		theme: { fg(color: string, text: string): string; bold(text: string): string };
	};
	sessionManager: {
		getBranch(): any[];
		getEntries(): any[];
		getSessionFile(): string | undefined;
		getSessionId(): string;
		getLeafId(): string | undefined;
		getHeader(): any;
		addCustomEntry?(key: string, data: any): void;
	};
	hasUI: boolean;
	modelRegistry?: {
		find(provider: string, model: string): any;
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
		getAvailable(): { provider: string; id: string }[];
		getApiKeyAndHeaders(model: any): Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }>;
	};
	model?: { provider: string; id: string; reasoning?: string } & Record<string, unknown>;
	getSystemPrompt(): string;
	getContextUsage?(): { tokens: number; contextWindow: number; percent: number };
	switchSession?(sessionFile: string, options: { withSession: (ctx: ExtensionCommandContext) => Promise<void> }): Promise<void>;
	[key: string]: unknown;
}

export interface ExtensionContext {
	config?: Record<string, unknown>;
	cwd: string;
	ui: {
		notify(message: string, level?: string): void;
		setStatus(key: string, status: string | undefined): void;
		setFooter(factory: any): void;
		setEditorComponent(factory: any): void;
		setWidget(key: string, factory: any, options?: Record<string, unknown>): void;
		setHeader(factory: any): void;
		theme: { fg(color: string, text: string): string; bold(text: string): string };
	};
	sessionManager: {
		getEntry(id: string): SessionEntry | undefined;
		getAll(): Record<string, unknown>;
		getEntries(): any[];
	};
	model?: { provider: string; id: string; name?: string; reasoning?: string; contextWindow?: number } & Record<string, unknown>;
	modelRegistry?: {
		isUsingOAuth(model: any): boolean;
		[key: string]: unknown;
	};
	getContextUsage(): { tokens: number; contextWindow: number; percent: number };
	hasUI?: boolean;
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

export interface AgentToolResult<T = unknown> {
	details?: T;
	[key: string]: unknown;
}

export type AgentToolUpdateCallback<T = unknown> = (update: T) => void;

export interface MessageRenderer {
	render(message: Message, options?: MessageRenderOptions): string[];
}

export interface MessageRenderOptions {
	[key: string]: unknown;
}

export type ThemeColor = string;

export interface EditorTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
	[key: string]: unknown;
}

export interface Theme {
	fg(color: string, text: string): string;
	bold(text: string): string;
	[key: string]: unknown;
}

export class CustomEditor {
	private _tui: any;
	private _theme: any;
	private _keybindings: any;
	protected _text: string = '';

	constructor(tui: any, theme: any, keybindings: any) {
		this._tui = tui;
		this._theme = theme;
		this._keybindings = keybindings;
	}

	getText(): string { return this._text; }
	setText(text: string) { this._text = text; }

	render(width: number): string[] {
		return [this._text || ''];
	}
	invalidate() {}
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

export interface Message {
	role: string;
	content: string | { type: string; text: string }[];
	[key: string]: unknown;
}

// ВНИМАНИЕ: Message дублирован в stubs/@earendil-works/pi-ai.ts.
// При изменении структуры — обновить оба файла одновременно.

export class DynamicBorder {
	constructor(private _fn: (s: string) => string) {}
	render(_width?: number): string[] { return []; }
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
export class SessionManager {
	static forkFrom(_sourcePath: string, _targetDir: string): SessionManager { return new SessionManager(); }
	getSessionFile(): string | undefined { return undefined; }
	getHeader(): any { return {}; }
}
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

export class BorderedLoader {
	private _controller = new AbortController();
	constructor(_tui: any, _theme: any, _text?: string) {}
	onAbort?: () => void;
	signal: AbortSignal = this._controller.signal;
	invalidate() {}
	render(_width?: number): string[] { return []; }
}

export const VERSION = "0.0.0-stub";

// --- truncateHead stub ---
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINES = 2000;

export interface TruncateResult {
	content: string;
	truncated: boolean;
	truncatedBy: "lines" | "bytes";
	outputLines: number;
	totalLines: number;
	outputBytes: number;
	totalBytes: number;
	maxLines: number;
	maxBytes: number;
	lastLinePartial: boolean;
	firstLineExceedsLimit: boolean;
}

export function withFileMutationQueue<T>(
	_filePath: string,
	fn: () => Promise<T>,
): Promise<T> {
	return fn();
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateHead(
	text: string,
	options?: { maxLines?: number; maxBytes?: number },
): TruncateResult {
	const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
	const lines = text.split("\n");
	const totalLines = lines.length;
	const totalBytes = Buffer.byteLength(text, "utf8");

	const truncated = totalLines > maxLines || totalBytes > maxBytes;
	if (!truncated) {
		return {
			content: text,
			truncated: false,
			truncatedBy: "lines",
			outputLines: totalLines,
			totalLines,
			outputBytes: totalBytes,
			totalBytes,
			maxLines,
			maxBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
		};
	}

	const truncatedBy = totalLines > maxLines ? "lines" : "bytes";

	let outputLines: number;
	let content: string;

	if (truncatedBy === "lines") {
		outputLines = maxLines;
		content = lines.slice(0, outputLines).join("\n");
	} else {
		// Byte-based truncation: drop lines from the end until outputBytes <= maxBytes
		outputLines = totalLines;
		content = text;
		while (outputLines > 1 && Buffer.byteLength(content, "utf8") > maxBytes) {
			outputLines--;
			content = lines.slice(0, outputLines).join("\n");
		}
	}
	const outputBytes = Buffer.byteLength(content, "utf8");

	return {
		content,
		truncated: true,
		truncatedBy,
		outputLines,
		totalLines,
		outputBytes,
		totalBytes,
		maxLines,
		maxBytes,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
	};
}
