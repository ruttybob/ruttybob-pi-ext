/**
 * Default preset for pi-powerline modern status bar.
 */

import type { PresetDef } from "./types.js";
import { getDefaultColors } from "./theme.js";

const DEFAULT_COLORS = getDefaultColors();

export const DEFAULT_PRESET: PresetDef = {
	leftSegments: ["git"],
	rightSegments: ["context_pct", "token_total", "cost", "thinking"],
	secondarySegments: ["extension_statuses"],
	separator: "powerline-thin",
	colors: DEFAULT_COLORS,
	segmentOptions: {
		model: { showThinkingLevel: false },
		path: { mode: "basename" },
		git: {
			showBranch: true,
			showStaged: true,
			showUnstaged: true,
			showUntracked: true,
		},
	},
};

export function getPreset(): PresetDef {
	return DEFAULT_PRESET;
}
