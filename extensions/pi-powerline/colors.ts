/**
 * ANSI color utilities for pi-powerline.
 *
 * Used for border/separator rendering in modern mode.
 */

export const ansi = {
	getFgAnsi: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
	getFgAnsi256: (code: number) => `\x1b[38;5;${code}m`,
	reset: "\x1b[0m",
} as const;

/** Separator color — ANSI 256 code 244 (gray). */
export const SEP_ANSI = ansi.getFgAnsi256(244);
