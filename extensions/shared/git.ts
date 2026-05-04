import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export type CommandResult = {
	ok: boolean;
	status: number | null;
	stdout: string;
	stderr: string;
	error?: string;
};

/**
 * Запускает команду через spawnSync и возвращает структурированный результат.
 */
export function run(
	command: string,
	args: string[],
	options?: { cwd?: string; input?: string },
): CommandResult {
	const result = spawnSync(command, args, {
		cwd: options?.cwd,
		input: options?.input,
		encoding: "utf8",
	});

	if (result.error) {
		return {
			ok: false,
			status: result.status,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			error: result.error.message,
		};
	}

	return {
		ok: result.status === 0,
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

/**
 * Как run, но бросает Error при неудаче.
 */
export function runOrThrow(
	command: string,
	args: string[],
	options?: { cwd?: string; input?: string },
): CommandResult {
	const result = run(command, args, options);
	if (!result.ok) {
		const reason = result.error ? `error=${result.error}` : `exit=${result.status}`;
		throw new Error(
			`Command failed: ${command} ${args.join(" ")} (${reason})\n${result.stderr || result.stdout}`.trim(),
		);
	}
	return result;
}

/**
 * Оборачивает строку в одинарные кавычки для shell, экранируя внутренние кавычки.
 */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Определяет корень git-репозитория для указанного каталога.
 * Fallback на cwd, если не внутри репозитория.
 */
export function resolveGitRoot(cwd: string): string {
	const result = run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
	if (result.ok) {
		const root = result.stdout.trim();
		if (root.length > 0) return resolve(root);
	}
	return resolve(cwd);
}

/**
 * Возвращает имя текущей ветки или пустую строку.
 */
export function getCurrentBranch(cwd: string): string {
	const result = run("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]);
	if (!result.ok) return "";
	const branch = result.stdout.trim();
	if (!branch || branch === "HEAD") return "";
	return branch;
}
