/**
 * Stub-модуль для @juicesharp/rpiv-test-utils.
 *
 * Предоставляет тестовые утилиты для расширений pi (todo, btw и др.).
 */

import { vi } from "vitest";

// --- Message builders ---

export function makeUserMessage(text: string) {
	return { role: "user" as const, content: text };
}

export function makeAssistantMessage(opts: { text: string }) {
	return { role: "assistant" as const, content: [{ type: "text", text: opts.text }] };
}

export function makeTodoToolResult(details: { action: string; params: unknown; tasks: unknown[]; nextId: number }) {
	return {
		role: "toolResult" as const,
		toolName: "todo",
		content: `todo ${details.action} ok`,
		details,
	};
}

// --- Session branch builders ---

export function buildSessionEntries(messages: unknown[]) {
	return messages.map((msg, i) => ({
		type: "message",
		index: i,
		message: msg,
	}));
}

// --- Mock context factories ---

export function createMockCtx(opts: {
	branch?: unknown[];
	hasUI?: boolean;
	model?: unknown;
	cwd?: string;
} = {}) {
	const branch = opts.branch ?? [];
	const ui = {
		notify: vi.fn(),
		terminal: { columns: 80 },
		overlay: { update: vi.fn(), hide: vi.fn(), show: vi.fn() },
		setWidget: vi.fn(),
		custom: vi.fn(),
		setStatus: vi.fn(),
		select: vi.fn(),
		input: vi.fn(),
		theme: {
			fg: (_c: string, s: string) => s,
			bold: (s: string) => s,
		},
	};
	return {
		hasUI: opts.hasUI !== false,
		cwd: opts.cwd ?? "/tmp/test-cwd",
		sessionManager: {
			getBranch: () => branch,
			getSessionFile: () => "/tmp/test-session.jsonl",
			getSessionId: () => "test-session-id",
		},
		ui,
		model: 'model' in opts ? opts.model : undefined,
		config: {},
		modelRegistry: {
			getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key", headers: {} }),
		},
		controller: { signal: { aborted: false } },
		getSignal: () => new AbortController().signal,
	};
}

export function createMockPi() {
	const events = new Map<string, Function[]>();
	const captured = {
		tools: new Map<string, any>(),
		commands: new Map<string, any>(),
		renderers: new Map<string, any>(),
		events,
	};
	return {
		pi: {
			registerTool: (tool: any) => captured.tools.set(tool.name, tool),
			registerCommand: (nameOrCmd: any, opts?: any) => {
				if (typeof nameOrCmd === "string") {
					captured.commands.set(nameOrCmd, { name: nameOrCmd, ...opts });
				} else {
					captured.commands.set(nameOrCmd.name, nameOrCmd);
				}
			},
			registerMessageRenderer: (r: any) => captured.renderers.set(r.name ?? "default", r),
			registerFlag: vi.fn(),
			registerShortcut: vi.fn(),
			getAllTools: () => [...captured.tools.values()],
			getActiveTools: () => [...captured.tools.values()],
			setActiveTools: vi.fn(),
			setModel: vi.fn().mockResolvedValue(true),
			setThinkingLevel: vi.fn(),
			appendEntry: vi.fn(),
			getCommands: () => [...captured.commands.values()],
			getFlag: vi.fn().mockReturnValue(undefined),
			on: (event: string, handler: Function) => {
				if (!events.has(event)) events.set(event, []);
				events.get(event)!.push(handler);
			},
			events: {
				on: (event: string, handler: Function) => {
					if (!events.has(event)) events.set(event, []);
					events.get(event)!.push(handler);
				},
				emit: (event: string, data: any) => {
					for (const handler of events.get(event) ?? []) handler(data);
				},
			},
		},
		captured,
	};
}

export function createMockUI() {
	return {
		notify: vi.fn(),
		terminal: { columns: 80 },
		overlay: { update: vi.fn(), hide: vi.fn(), show: vi.fn() },
		setWidget: vi.fn(),
	};
}

export function makeTheme() {
	const identity = (s: string) => s;
	return {
		fg: (_color: string, s: string) => s,
		bg: (_color: string, s: string) => s,
		bold: (s: string) => s,
		strikethrough: (s: string) => s,
		primary: "cyan",
		success: "green",
		warning: "yellow",
		danger: "red",
		muted: "gray",
	};
}

export function makeTui() {
	return {
		terminal: { columns: 80, rows: 24 },
		write: vi.fn(),
		clear: vi.fn(),
		render: vi.fn(),
		requestRender: vi.fn(),
	};
}
