/**
 * Задержка на указанное количество миллисекунд.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Преобразует неизвестную ошибку в строку.
 */
export function stringifyError(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
