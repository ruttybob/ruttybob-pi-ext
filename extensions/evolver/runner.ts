/**
 * evolver CLI runner — обёртка для запуска evolver как subprocess.
 *
 * Evolver — GEP-powered self-evolution engine для AI agents.
 * Сканирует ./memory/ на предмет сигналов, мэтчит с Gene/Capsule,
 * эмитит GEP prompt в stdout.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface EvolverRunOptions {
	/** Рабочая директория (должна быть git-репозиторием) */
	cwd: string;
	/** Стратегия эволюции */
	strategy?: "balanced" | "innovate" | "harden" | "repair-only";
	/** Режим ревью — пауза перед применением */
	review?: boolean;
	/** Дополнительный контекст для эволюции */
	query?: string;
	/** AbortSignal для отмены */
	signal?: AbortSignal;
	/** Таймаут в мс (default 180 000) */
	timeoutMs?: number;
	/** Callback для стриминга partial output */
	onOutput?: (chunk: string) => void;
}

export interface EvolverResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut: boolean;
	aborted: boolean;
}

export interface EvolverCheckResult {
	installed: boolean;
	path: string | null;
	version: string | null;
	error?: string;
}

// ---------------------------------------------------------------------------
// Проверка наличия evolver
// ---------------------------------------------------------------------------

export async function checkEvolverInstalled(): Promise<EvolverCheckResult> {
	try {
		const result = await execCommand("which", ["evolver"], { timeout: 5000 });
		if (result.exitCode !== 0 || !result.stdout.trim()) {
			return { installed: false, path: null, version: null, error: "evolver CLI не найден. Установите: npm install -g @evomap/evolver" };
		}
		const binPath = result.stdout.trim();

		let version: string | null = null;
		try {
			const vResult = await execCommand("evolver", ["--version"], { timeout: 5000 });
			if (vResult.exitCode === 0) version = vResult.stdout.trim();
		} catch {
			// --version может не поддерживаться
		}

		return { installed: true, path: binPath, version };
	} catch (err: any) {
		return { installed: false, path: null, version: null, error: err.message };
	}
}

// ---------------------------------------------------------------------------
// Проверка git-репозитория
// ---------------------------------------------------------------------------

/**
 * Проверяет, находится ли cwd внутри git-репозитория.
 * Поднимается вверх по дереву, пока не найдёт .git или не достигнет корня.
 */
export function isGitRepo(cwd: string): boolean {
	let dir = cwd;
	for (let i = 0; i < 100; i++) {
		try {
			if (fs.existsSync(path.join(dir, ".git"))) {
				return true;
			}
		} catch {
			// ignore
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return false;
}

/**
 * Возвращает корень git-репозитория для указанного cwd.
 * Поднимается вверх по дереву. Fallback на cwd, если .git не найден.
 */
export function findGitRoot(cwd: string): string {
	let dir = cwd;
	for (let i = 0; i < 100; i++) {
		try {
			if (fs.existsSync(path.join(dir, ".git"))) {
				return dir;
			}
		} catch {
			// ignore
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return cwd;
}

// ---------------------------------------------------------------------------
// Запуск evolver
// ---------------------------------------------------------------------------

export async function runEvolver(options: EvolverRunOptions): Promise<EvolverResult> {
	const { cwd, strategy, review, query, signal, onOutput } = options;
	const timeoutMs = options.timeoutMs ?? 180_000;

	const startTime = Date.now();

	// Собираем аргументы CLI
	const args: string[] = [];
	if (review) args.push("--review");

	// Собираем env vars
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	if (strategy) env.EVOLVE_STRATEGY = strategy;

	return new Promise<EvolverResult>((resolve) => {
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let aborted = false;

		const proc = spawn("evolver", args, {
			cwd,
			env,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Таймаут
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 5000);
		}, timeoutMs);

		// AbortSignal propagation
		const onAbort = () => {
			aborted = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 5000);
		};

		if (signal) {
			if (signal.aborted) {
				onAbort();
			} else {
				signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		let stdoutBuffer = "";

		proc.stdout.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stdout += chunk;
			stdoutBuffer += chunk;

			// Стримим по строкам
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() || "";
			for (const line of lines) {
				if (line.trim() && onOutput) {
					onOutput(line + "\n");
				}
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", onAbort);
			if (stdoutBuffer.trim() && onOutput) {
				onOutput(stdoutBuffer);
			}
			resolve({
				exitCode: code ?? 1,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				durationMs: Date.now() - startTime,
				timedOut,
				aborted,
			});
		});

		proc.on("error", (err) => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", onAbort);
			resolve({
				exitCode: 1,
				stdout: stdout.trim(),
				stderr: stderr.trim() + `\n${err.message}`,
				durationMs: Date.now() - startTime,
				timedOut: false,
				aborted: false,
			});
		});
	});
}

// ---------------------------------------------------------------------------
// Хелперы (встроенные, без внешних зависимостей)
// ---------------------------------------------------------------------------

interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface ExecOptions {
	timeout?: number;
	cwd?: string;
}

function execCommand(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: options?.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			timeout: options?.timeout ?? 30000,
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
		proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
		proc.on("close", (code) => {
			resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
		});
		proc.on("error", (err) => {
			resolve({ exitCode: 1, stdout: "", stderr: err.message });
		});
	});
}


