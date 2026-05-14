/**
 * Types for pi-powerline modern status bar segments.
 *
 * Adapted from yapi-line/types.ts — segment-based status bar architecture.
 */

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

// ── Colors ────────────────────────────────────────────────────────────────────

export type ColorValue = ThemeColor | `#${string}`;
export type ThemeLike = Pick<Theme, "fg">;

export type SemanticColor =
	| "pi"
	| "model"
	| "path"
	| "gitDirty"
	| "gitClean"
	| "thinking"
	| "thinkingMinimal"
	| "thinkingLow"
	| "thinkingMedium"
	| "context"
	| "contextWarn"
	| "contextError"
	| "cost"
	| "tokens"
	| "separator"
	| "border";

export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// ── Segments ──────────────────────────────────────────────────────────────────

export type StatusLineSegmentId =
	| "pi"
	| "model"
	| "thinking"
	| "path"
	| "git"
	| "token_total"
	| "cost"
	| "context_pct"
	| "time_spent"
	| "extension_statuses";

export type StatusLineSeparatorStyle =
	| "powerline"
	| "powerline-thin"
	| "slash"
	| "pipe"
	| "block"
	| "none"
	| "ascii"
	| "dot"
	| "chevron"
	| "star";

// ── Git ───────────────────────────────────────────────────────────────────────

export interface GitStatus {
	branch: string | null;
	staged: number;
	unstaged: number;
	untracked: number;
}

// ── Usage stats ───────────────────────────────────────────────────────────────

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

// ── Preset ────────────────────────────────────────────────────────────────────

export interface StatusLineSegmentOptions {
	model?: { showThinkingLevel?: boolean };
	path?: { mode?: "basename" | "abbreviated" | "full"; maxLength?: number };
	git?: {
		showBranch?: boolean;
		showStaged?: boolean;
		showUnstaged?: boolean;
		showUntracked?: boolean;
	};
}

export interface PresetDef {
	leftSegments: StatusLineSegmentId[];
	rightSegments: StatusLineSegmentId[];
	secondarySegments?: StatusLineSegmentId[];
	separator: StatusLineSeparatorStyle;
	segmentOptions?: StatusLineSegmentOptions;
	colors?: ColorScheme;
}

// ── Separator ─────────────────────────────────────────────────────────────────

export interface SeparatorDef {
	left: string;
	right: string;
	endCaps?: { left: string; right: string; useBgAsFg: boolean };
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface SegmentContext {
	model: { id: string; name?: string; reasoning?: boolean; contextWindow?: number } | undefined;
	thinkingLevel: string;
	sessionId: string | undefined;
	usageStats: UsageStats;
	contextPercent: number;
	contextWindow: number;
	autoCompactEnabled: boolean;
	usingSubscription: boolean;
	sessionStartTime: number;
	cwd: string;
	git: GitStatus;
	extensionStatuses: ReadonlyMap<string, string>;
	options: StatusLineSegmentOptions;
	theme: ThemeLike;
	colors: ColorScheme;
}

// ── Rendered output ───────────────────────────────────────────────────────────

export interface RenderedSegment {
	content: string;
	visible: boolean;
}

