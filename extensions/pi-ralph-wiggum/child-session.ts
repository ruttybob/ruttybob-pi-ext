/**
 * Spawn дочерних pi-сессий в --mode json.
 *
 * Каждая итерация Ralph-цикла запускается как отдельный процесс:
 *   pi --mode json -p --no-session --append-system-prompt <file> --tools <tools> "prompt"
 *
 * Stdout дочернего процесса содержит JSON-события (одна строка = одно событие).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { COMPLETE_MARKER } from "./files.js";

// --- Типы ---

export interface SpawnOptions {
	/** Рабочая директория для дочернего процесса. */
	cwd: string;
	/** Содержимое файла для --append-system-prompt. */
	systemPromptAppend: string;
	/** Промпт (последний аргумент командной строки). */
	prompt: string;
	/** Модель (опционально, --model). */
	model?: string;
	/** Инструменты (по умолчанию read,bash,edit,write,grep,find,ls). */
	tools?: string[];
	/** AbortSignal для отмены. */
	signal?: AbortSignal;
	/** Callback для streaming-обновлений. */
	onMessage?: (event: JsonEvent) => void;
}

export interface ChildResult {
	/** Код выхода процесса. */
	exitCode: number;
	/** Собранные assistant messages. */
	output: string;
	/** Stderr дочернего процесса. */
	stderr: string;
	/** Был ли обнаружен маркер COMPLETE. */
	complete: boolean;
	/** Все распарсенные JSON события. */
	events: JsonEvent[];
}

export interface JsonEvent {
	type: string;
	[key: string]: unknown;
}

// --- Утилиты ---

const DEFAULT_TOOLS = "read,bash,edit,write,grep,find,ls";

/**
 * Определяет, как вызвать pi:
 * - Если текущий скрипт существует и не bun virtual — node script.js args
 * - Если runtime — нестандартный (не node/bun) — runtime args
 * - Иначе — pi args
 */
export function getPiInvocation(
	args: string[],
): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");

	if (
		currentScript &&
		!isBunVirtualScript &&
		fs.existsSync(currentScript)
	) {
		return {
			command: process.execPath,
			args: [currentScript, ...args],
		};
	}

	const execName = path
		.basename(process.execPath)
		.toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

/**
 * Парсит JSON-строки из stdout дочернего процесса.
 * Невалидные и пустые строки пропускаются.
 */
export function parseJsonLines(output: string): JsonEvent[] {
	const events: JsonEvent[] = [];
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			events.push(JSON.parse(trimmed));
		} catch {
			// skip invalid JSON
		}
	}
	return events;
}

/**
 * Записать system prompt append во временный файл.
 * Возвращает пути к файлу и директории для последующей очистки.
 */
async function writeSystemPromptToTempFile(
	content: string,
): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "ralph-session-"),
	);
	const filePath = path.join(tmpDir, "system-prompt-append.md");
	await fs.promises.writeFile(filePath, content, {
		encoding: "utf-8",
		mode: 0o600,
	});
	return { dir: tmpDir, filePath };
}

// --- Основная функция ---

/**
 * Spawn дочерний pi-процесс и дождаться его завершения.
 */
export async function spawnChildSession(
	options: SpawnOptions,
): Promise<ChildResult> {
	const args: string[] = [
		"--mode",
		"json",
		"-p",
		"--no-session",
	];

	if (options.model) {
		args.push("--model", options.model);
	}

	const tools = options.tools ?? DEFAULT_TOOLS.split(",");
	args.push("--tools", tools.join(","));

	// Записать system prompt append во временный файл
	const tmpFile = await writeSystemPromptToTempFile(
		options.systemPromptAppend,
	);
	args.push("--append-system-prompt", tmpFile.filePath);

	// Промпт — последний аргумент
	args.push(options.prompt);

	let wasAborted = false;
	const events: JsonEvent[] = [];
	let output = "";
	let stderr = "";

	const exitCode = await new Promise<number>((resolve) => {
		const invocation = getPiInvocation(args);
		const proc = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdoutBuffer = "";

		const processLine = (line: string) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			let event: JsonEvent;
			try {
				event = JSON.parse(trimmed);
			} catch {
				return;
			}

			events.push(event);

			// Собираем output из message_end assistant сообщений
			if (event.type === "message_end" && event.message) {
				const msg = event.message as any;
				if (msg.role === "assistant") {
					if (Array.isArray(msg.content)) {
						for (const part of msg.content) {
							if (part.type === "text")
								output += part.text;
						}
					} else if (typeof msg.content === "string") {
						output += msg.content;
					}
				}
			}

			options.onMessage?.(event);
		};

		proc.stdout.on("data", (data: Buffer) => {
			stdoutBuffer += data.toString();
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (stdoutBuffer.trim()) processLine(stdoutBuffer);
			resolve(code ?? 0);
		});

		proc.on("error", () => {
			resolve(1);
		});

		if (options.signal) {
			const killProc = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			};
			if (options.signal.aborted) killProc();
			else
				options.signal.addEventListener("abort", killProc, {
					once: true,
				});
		}
	});

	// Удалить временный файл
	try {
		fs.unlinkSync(tmpFile.filePath);
		fs.rmdirSync(tmpFile.dir);
	} catch {
		/* ignore */
	}

	if (wasAborted) {
		throw new Error("Child session was aborted");
	}

	return {
		exitCode,
		output,
		stderr,
		complete: output.includes(COMPLETE_MARKER),
		events,
	};
}
