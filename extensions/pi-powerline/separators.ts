/**
 * Separator styles for pi-powerline modern status bar.
 *
 * Adapted from yapi-line/separators.ts.
 */

import { hasNerdFonts } from "./breadcrumb.js";
import type { SeparatorDef, StatusLineSeparatorStyle } from "./types.js";

interface SeparatorChars {
	powerlineLeft: string;
	powerlineRight: string;
	powerlineThinLeft: string;
	powerlineThinRight: string;
	slash: string;
	pipe: string;
	block: string;
	space: string;
	asciiLeft: string;
	asciiRight: string;
	dot: string;
}

const NERD_SEPARATORS: SeparatorChars = {
	powerlineLeft: "\uE0B0",
	powerlineRight: "\uE0B2",
	powerlineThinLeft: "\uE0B1",
	powerlineThinRight: "\uE0B3",
	slash: "/",
	pipe: "|",
	block: "█",
	space: " ",
	asciiLeft: ">",
	asciiRight: "<",
	dot: "·",
};

const ASCII_SEPARATORS: SeparatorChars = {
	powerlineLeft: ">",
	powerlineRight: "<",
	powerlineThinLeft: "|",
	powerlineThinRight: "|",
	slash: "/",
	pipe: "|",
	block: "#",
	space: " ",
	asciiLeft: ">",
	asciiRight: "<",
	dot: ".",
};

function getSeparatorChars(): SeparatorChars {
	return hasNerdFonts() ? NERD_SEPARATORS : ASCII_SEPARATORS;
}

export function getSeparator(style: StatusLineSeparatorStyle): SeparatorDef {
	const chars = getSeparatorChars();

	switch (style) {
		case "powerline":
			return {
				left: chars.powerlineLeft,
				right: chars.powerlineRight,
				endCaps: { left: chars.powerlineRight, right: chars.powerlineLeft, useBgAsFg: true },
			};
		case "powerline-thin":
			return {
				left: chars.powerlineThinLeft,
				right: chars.powerlineThinRight,
				endCaps: { left: chars.powerlineRight, right: chars.powerlineLeft, useBgAsFg: true },
			};
		case "slash":
			return { left: ` ${chars.slash} `, right: ` ${chars.slash} ` };
		case "pipe":
			return { left: ` ${chars.pipe} `, right: ` ${chars.pipe} ` };
		case "block":
			return { left: chars.block, right: chars.block };
		case "none":
			return { left: chars.space, right: chars.space };
		case "ascii":
			return { left: chars.asciiLeft, right: chars.asciiRight };
		case "dot":
			return { left: chars.dot, right: chars.dot };
		case "chevron":
			return { left: "›", right: "‹" };
		case "star":
			return { left: "✦", right: "✦" };
		default:
			return getSeparator("powerline-thin");
	}
}
