/**
 * Отслеживание прогресса дочерней сессии Ralph loop.
 *
 * Агрегирует JSON-события от `pi --mode json` дочернего процесса
 * и рендерит строки для TUI-виджета в реальном времени.
 */

// --- Типы ---

export interface ToolCallRecord {
	toolName: string;
	toolCallId: string;
	/** Краткое описание (команда, путь файла, etc). */
	input: string;
	status: "running" | "done" | "error";
	/** Краткий результат (обрезанный). */
	result?: string;
	startedAt: number;
	endedAt?: number;
}

export interface ProgressState {
	/** Видимые tool calls (rolling window). */
	toolCalls: ToolCallRecord[];
	/** Счётчик завершённых ходов (turn_end). */
	turnCount: number;
	/** Время старта текущей итерации (Date.now()). */
	startTime: number;
	/** Общее число tool calls (для футера). */
	totalToolCalls: number;
}

export interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

// --- Константы ---

/** Максимальное количество tool calls в виджете (rolling window). */
const MAX_VISIBLE_TOOL_CALLS = 8;

/** Максимальная длина summary ввода. */
const MAX_INPUT_LENGTH = 60;

/** Максимальная длина summary результата. */
const MAX_RESULT_LENGTH = 80;

/** Минимальный интервал между обновлениями TUI (ms). */
export const RENDER_THROTTLE_MS = 100;

// --- Создание состояния ---

export function createProgressState(): ProgressState {
	return {
		toolCalls: [],
		turnCount: 0,
		startTime: Date.now(),
		totalToolCalls: 0,
	};
}

// --- Обработка событий ---

/**
 * Обновляет ProgressState по событию от `pi --mode json`.
 *
 * Поддерживаемые события:
 * - `tool_execution_start` — добавить ToolCallRecord (running)
 * - `tool_execution_end` — обновить статус, записать результат
 * - `turn_end` — инкремент turnCount
 */
export function handleEvent(
	state: ProgressState,
	event: { type: string; [key: string]: unknown },
): void {
	switch (event.type) {
		case "tool_execution_start": {
			state.totalToolCalls++;
			const record: ToolCallRecord = {
				toolName: String(event.toolName ?? "unknown"),
				toolCallId: String(event.toolCallId ?? ""),
				input: summarizeToolInput(
					String(event.toolName ?? "unknown"),
					(event as Record<string, unknown>).args,
				),
				status: "running",
				startedAt: Date.now(),
			};
			state.toolCalls.push(record);
			// Rolling window: убрать старые записи
			while (state.toolCalls.length > MAX_VISIBLE_TOOL_CALLS) {
				state.toolCalls.shift();
			}
			break;
		}
		case "tool_execution_end": {
			const toolCallId = String(event.toolCallId ?? "");
			const record = state.toolCalls.find(
				(r) => r.toolCallId === toolCallId,
			);
			if (record) {
				const isError = !!(event as Record<string, unknown>).isError;
				record.status = isError ? "error" : "done";
				record.result = summarizeToolResult(
					record.toolName,
					(event as Record<string, unknown>).result,
					isError,
				);
				record.endedAt = Date.now();
			}
			break;
		}
		case "turn_end": {
			state.turnCount++;
			break;
		}
	}
}

// --- Суммаризация ---

/**
 * Краткое описание аргументов инструмента для виджета.
 * bash → команда, read/edit/write → путь, grep → паттерн, etc.
 */
export function summarizeToolInput(
	toolName: string,
	args: unknown,
): string {
	if (!args || typeof args !== "object") return toolName;
	const a = args as Record<string, unknown>;

	switch (toolName) {
		case "bash":
		case "shell": {
			const cmd = String(a.command ?? a.script ?? "");
			return truncate(cmd, MAX_INPUT_LENGTH);
		}
		case "read":
			return truncate(String(a.path ?? a.filePath ?? toolName), MAX_INPUT_LENGTH);
		case "edit": {
			const p = String(a.path ?? a.filePath ?? "");
			const n = Array.isArray(a.edits) ? ` (${(a.edits as unknown[]).length} edits)` : "";
			return truncate(p, MAX_INPUT_LENGTH - n.length) + n;
		}
		case "write":
			return truncate(String(a.path ?? a.filePath ?? toolName), MAX_INPUT_LENGTH);
		case "grep":
		case "rg":
			return truncate(String(a.pattern ?? a.query ?? toolName), MAX_INPUT_LENGTH);
		case "find":
		case "ls":
			return truncate(String(a.path ?? a.directory ?? toolName), MAX_INPUT_LENGTH);
		default: {
			// Первое строковое поле
			const vals = Object.values(a).filter(
				(v) => typeof v === "string" && v.length > 0,
			);
			if (vals.length > 0) {
				return truncate(String(vals[0]), MAX_INPUT_LENGTH);
			}
			return toolName;
		}
	}
}

/**
 * Краткое описание результата инструмента.
 */
export function summarizeToolResult(
	_toolName: string,
	result: unknown,
	isError: boolean,
): string {
	if (isError) {
		const msg =
			typeof result === "string"
				? result
				: (result as Record<string, unknown>)?.message ??
					(result as Record<string, unknown>)?.error ??
					JSON.stringify(result);
		return truncate(`❌ ${msg}`, MAX_RESULT_LENGTH);
	}

	if (typeof result === "string") {
		const firstLine =
			result.split("\n").find((l) => l.trim()) ?? "";
		return truncate(firstLine.trim(), MAX_RESULT_LENGTH);
	}

	if (
		result &&
		typeof result === "object" &&
		Array.isArray((result as Record<string, unknown>).content)
	) {
		for (const part of (result as { content: unknown[] }).content) {
			if (
				(part as Record<string, unknown>).type === "text" &&
				typeof (part as Record<string, unknown>).text === "string"
			) {
				const firstLine =
					((part as Record<string, unknown>).text as string)
						.split("\n")
						.find((l) => l.trim()) ?? "";
				return truncate(firstLine.trim(), MAX_RESULT_LENGTH);
			}
		}
	}

	return "";
}

// --- Рендеринг ---

const TOOL_ICONS: Record<string, string> = {
	bash: "⚡",
	shell: "⚡",
	read: "📄",
	edit: "✏️",
	write: "📝",
	grep: "🔍",
	rg: "🔍",
	find: "📂",
	ls: "📂",
};

const STATUS_ICONS: Record<string, string> = {
	running: "⏳",
	done: "  ✓",
	error: "  ✗",
};

/**
 * Рендерит строки для TUI-виджета.
 *
 * Формат:
 * ```
 * 🔄 loop-name (1/50)
 * ─────────────────────────────────────
 * ⚡ bash: grep -r "swarm" src/
 *   → 12 matches
 * 📄 read: src/swarm/index.ts
 * ✏️ edit: src/swarm/store.ts (3 edits)
 * ⏳ bash: npm test
 * ─────────────────────────────────────
 * Tools: 8 calls | Turn: 2 | ⏱ 1m 23s
 * ```
 */
export function renderWidget(
	state: ProgressState,
	loopName: string,
	iteration: number,
	maxIterations: number,
	theme: ThemeLike,
): string[] {
	const maxStr = maxIterations > 0 ? `/${maxIterations}` : "";
	const lines: string[] = [];

	// Заголовок
	lines.push(
		theme.fg(
			"accent",
			theme.bold(`🔄 ${loopName} (${iteration}${maxStr})`),
		),
	);
	lines.push(theme.fg("dim", "─────────────────────────────────────"));

	// Tool calls
	if (state.toolCalls.length === 0) {
		lines.push(theme.fg("dim", "  Waiting for agent..."));
	} else {
		for (const tc of state.toolCalls) {
			const icon = TOOL_ICONS[tc.toolName] ?? "🔧";
			const statusIcon = STATUS_ICONS[tc.status] ?? "";

			if (tc.status === "error") {
				lines.push(theme.fg("warning", `${icon} ${tc.toolName}: ${tc.input}`));
			} else if (tc.status === "running") {
				lines.push(
					theme.fg("accent", `${statusIcon} ${icon} ${tc.toolName}: ${tc.input}`),
				);
			} else {
				lines.push(
					theme.fg("muted", `${statusIcon} ${icon} ${tc.toolName}: ${tc.input}`),
				);
			}

			if (tc.result) {
				lines.push(theme.fg("dim", `  → ${tc.result}`));
			}
		}
	}

	// Футер
	lines.push(theme.fg("dim", "─────────────────────────────────────"));
	const elapsed = formatElapsed(Date.now() - state.startTime);
	const footerParts = [`Tools: ${state.totalToolCalls}`];
	if (state.turnCount > 0) footerParts.push(`Turn: ${state.turnCount}`);
	footerParts.push(`⏱ ${elapsed}`);
	lines.push(theme.fg("dim", footerParts.join(" | ")));

	return lines;
}

/**
 * Форматирует текст для status bar — показывает текущий инструмент.
 */
export function formatStatusText(
	state: ProgressState,
	loopName: string,
	iteration: number,
	maxIterations: number,
): string {
	const maxStr = maxIterations > 0 ? `/${maxIterations}` : "";
	const running = [...state.toolCalls]
		.reverse()
		.find((r) => r.status === "running");

	if (running) {
		return `🔄 ${loopName} (${iteration}${maxStr}) ⚡ ${running.toolName}: ${running.input}`;
	}
	return `🔄 ${loopName} (${iteration}${maxStr})`;
}

// --- Внутренние утилиты ---

function truncate(str: string, maxLen: number): string {
	if (!str || str.length <= maxLen) return str;
	return str.slice(0, maxLen - 1) + "…";
}

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes}m ${secs}s`;
}
