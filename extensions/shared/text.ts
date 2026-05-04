const ANSI_CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Обрезает текст до maxChars символов, добавляя многоточие при переполнении.
 * При maxChars <= 0 возвращает пустую строку.
 */
export function truncateWithEllipsis(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	if (maxChars === 1) return "…";
	return `${text.slice(0, maxChars - 1)}…`;
}

/**
 * Удаляет ANSI-escape последовательности (CSI, OSC) и управляющие символы.
 */
export function stripTerminalNoise(text: string): string {
	return text
		.replace(ANSI_CSI_RE, "")
		.replace(ANSI_OSC_RE, "")
		.replace(/\r/g, "")
		.replace(CONTROL_RE, "");
}

/**
 * Разбивает текст на строки по \n или \r\n.
 * Удаляет пустую trailing строку (от завершающего перевода строки).
 */
export function splitLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.filter((line, i, arr) => !(i === arr.length - 1 && line.length === 0));
}

/**
 * Возвращает последние count строк из текста.
 * При count <= 0 возвращает пустой массив.
 */
export function tailLines(text: string, count: number): string[] {
	if (count <= 0) return [];
	return splitLines(text).slice(-count);
}
