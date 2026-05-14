/**
 * Color system for pi-powerline modern status bar.
 *
 * Adapted from yapi-line/theme.ts.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ColorScheme, ColorValue, SemanticColor, ThemeLike } from "./types.js";

const RAINBOW_COLORS = [
	"#b281d6", "#d787af", "#febc38", "#e4c00f",
	"#89d281", "#00afaf", "#178fb9", "#b281d6",
];

function isHexColor(color: ColorValue): color is `#${string}` {
	return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
}

function hexToAnsi(hex: string): string {
	const h = hex.replace("#", "");
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

/** hex → ANSI true color without reset (for inline colored segments). */
export function hexFg(hex: string, text: string): string {
	return hexToAnsi(hex) + text;
}

export function applyColor(theme: ThemeLike, color: ColorValue, text: string): string {
	if (isHexColor(color)) {
		return `${hexToAnsi(color)}${text}\x1b[0m`;
	}
	try {
		return theme.fg(color as ThemeColor, text);
	} catch {
		return theme.fg("text", text);
	}
}

export function fg(
	theme: ThemeLike,
	semantic: SemanticColor,
	text: string,
	presetColors?: ColorScheme,
): string {
	const color = presetColors?.[semantic] ?? DEFAULT_COLORS[semantic];
	return applyColor(theme, color, text);
}

export function rainbow(text: string): string {
	let result = "";
	let colorIndex = 0;
	for (const char of text) {
		if (char === " " || char === ":") {
			result += char;
		} else {
			result += hexToAnsi(RAINBOW_COLORS[colorIndex % RAINBOW_COLORS.length]) + char;
			colorIndex++;
		}
	}
	return result + "\x1b[0m";
}

const DEFAULT_COLORS: Required<ColorScheme> = {
	pi: "accent",
	model: "#d787af",
	path: "#00afaf",
	gitDirty: "warning",
	gitClean: "success",
	thinking: "thinkingOff",
	thinkingMinimal: "thinkingMinimal",
	thinkingLow: "thinkingLow",
	thinkingMedium: "thinkingMedium",
	context: "dim",
	contextWarn: "warning",
	contextError: "error",
	cost: "text",
	tokens: "muted",
	separator: "dim",
	border: "borderMuted",
};

export function getDefaultColors(): Required<ColorScheme> {
	return { ...DEFAULT_COLORS };
}
