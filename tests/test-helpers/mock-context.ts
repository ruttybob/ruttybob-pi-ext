/**
 * Мок ExtensionContext и ExtensionCommandContext для unit-тестов.
 *
 * Базовый мок покрывает подмножество свойств, используемых
 * в расширениях rutty-pi. Через `overrides` можно переопределить
 * любое поле.
 */

export interface MockContext {
	hasUI: boolean;
	cwd: string;
	model: { provider: string; id: string };
	signal: undefined;
	ui: {
		notify: (...args: any[]) => void;
		confirm: (...args: any[]) => Promise<any>;
		select: (...args: any[]) => Promise<any>;
		input: (...args: any[]) => Promise<any>;
		editor: (...args: any[]) => Promise<any>;
		custom: (...args: any[]) => Promise<any>;
		setWorkingMessage: (...args: any[]) => void;
		setEditorText: (...args: any[]) => void;
		setTheme: (...args: any[]) => any;
		getAllThemes: (...args: any[]) => string[];
		setStatus: (...args: any[]) => void;
		setWidget: (...args: any[]) => void;
		setTitle: (...args: any[]) => void;
		theme?: { fg: (color: string, text: string) => string; bold: (text: string) => string };
	};
	sessionManager: {
		getEntries: (...args: any[]) => any[];
		getBranch: (...args: any[]) => any[];
		getLeafId: (...args: any[]) => string;
		getSessionFile: (...args: any[]) => string;
	};
	modelRegistry: {
		getApiKeyAndHeaders: (...args: any[]) => Promise<any>;
		find: (...args: any[]) => any;
		getAll: (...args: any[]) => any[];
		getAvailable: (...args: any[]) => any[];
	};
	getSystemPrompt: (...args: any[]) => string;
	getContextUsage: (...args: any[]) => { tokens: number; contextWindow: number; percent: number };
	isIdle: (...args: any[]) => boolean;
	abort: (...args: any[]) => void;
	hasPendingMessages: (...args: any[]) => boolean;
	shutdown: (...args: any[]) => void;
	compact: (...args: any[]) => void;
}

/**
 * Базовый мок ExtensionContext.
 * Все методы — no-op или возвращают безопасные значения по умолчанию.
 */
export function createMockContext(overrides?: Partial<MockContext>): MockContext {
	return {
		hasUI: true,
		cwd: "/tmp/test-project",
		model: { provider: "anthropic", id: "claude-sonnet-4-5" },
		signal: undefined,

		ui: {
			notify: () => {},
			confirm: async () => true,
			select: async () => undefined,
			input: async () => undefined,
			editor: async () => undefined,
			custom: async <T>(factory: (tui: any, theme: any, kb: any, done: (result: T) => void) => any) => {
				return new Promise<T | undefined>((resolve) => {
					const mockTheme = {
						fg: (_c: string, t: string) => t,
						bold: (t: string) => t,
						success: (t: string) => t,
						dim: (t: string) => t,
						warning: (t: string) => t,
						accent: (t: string) => t,
						muted: (t: string) => t,
					};
					const mockTui = { requestRender: () => {} };
					const mockKb = {};
					let resolved = false;
					factory(mockTui, mockTheme, mockKb, (result: T) => {
						resolved = true;
						resolve(result);
					});
					// If done() wasn't called synchronously, resolve with undefined after a tick
					if (!resolved) {
						setTimeout(() => resolve(undefined), 0);
					}
				});
			},
			setWorkingMessage: () => {},
			setEditorText: () => {},
			setTheme: () => ({ success: true }),
			getAllThemes: () => [],
			setStatus: () => {},
			setWidget: () => {},
			setTitle: () => {},
		},

		sessionManager: {
			getEntries: () => [],
			getBranch: () => [],
			getLeafId: () => "leaf-1",
			getSessionFile: () => "/tmp/test-session.jsonl",
		},

		modelRegistry: {
			getApiKeyAndHeaders: async (_model: any) => ({
				ok: true,
				apiKey: "test-key",
			}),
			find: (_provider: string, _id: string) => ({
				provider: "anthropic",
				id: "claude-sonnet-4-5",
			}),
			getAll: () => [],
			getAvailable: () => [],
		},

		getSystemPrompt: () => "You are a test assistant.",
		getContextUsage: () => ({ tokens: 1000, contextWindow: 200000, percent: 0.5 }),
		isIdle: () => true,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		compact: () => {},

		...overrides,
	} as any;
}

/**
 * Мок ExtensionCommandContext (для /команд).
 * Расширяет базовый контекст методами управления сессиями.
 */
export function createMockCommandContext(
	overrides?: Partial<MockContext>,
): MockContext & {
	waitForIdle: () => Promise<void>;
	newSession: () => Promise<{ cancelled: boolean }>;
	fork: () => Promise<{ cancelled: boolean }>;
	switchSession: () => Promise<{ cancelled: boolean }>;
	reload: () => Promise<void>;
	sendUserMessage: () => void;
} {
	const base = createMockContext(overrides);
	return {
		...base,
		waitForIdle: async () => {},
		newSession: async () => ({ cancelled: false }),
		fork: async () => ({ cancelled: false }),
		switchSession: async () => ({ cancelled: false }),
		reload: async () => {},
		sendUserMessage: () => {},
	} as any;
}
