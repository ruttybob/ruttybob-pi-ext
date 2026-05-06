/**
 * Stub-модуль для pino.
 *
 * В тестах pino заменяется на no-op логгер,
 * чтобы не создавать файлы логов.
 */

export interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	fatal: (...args: unknown[]) => void;
	trace: (...args: unknown[]) => void;
	child: (bindings: Record<string, unknown>) => Logger;
	enabled?: boolean;
}

function noopLogger(): Logger {
	const logger: Logger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {},
		trace: () => {},
		child: () => logger,
	};
	return logger;
}

interface PinoStatic {
	(options?: unknown, destination?: unknown): Logger;
	destination: (file?: unknown) => unknown;
	(extremeMode?: boolean): unknown;
}

function pino(_options?: unknown, _destination?: unknown): Logger {
	return noopLogger();
}

pino.destination = (_file?: unknown) => ({ write: () => {}, end: () => {} });

export default pino;
export { pino };
