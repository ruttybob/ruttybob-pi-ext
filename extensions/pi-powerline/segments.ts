/**
 * Status bar segment implementations for pi-powerline modern mode.
 *
 * Adapted from yapi-line/segments.ts.
 */

import { basename } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { hasNerdFonts } from "./breadcrumb.js";
import { fg, rainbow, applyColor } from "./theme.js";
import { getPreset } from "./presets.js";
import type {
	RenderedSegment,
	SegmentContext,
	SemanticColor,
	StatusLineSegmentId,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function color(ctx: SegmentContext, semantic: SemanticColor, text: string): string {
	return fg(ctx.theme, semantic, text, ctx.colors);
}

function strWidth(s: string): number {
	return visibleWidth(s);
}

function withIcon(icon: string, text: string): string {
	return icon ? `${icon} ${text}` : text;
}

function formatTokens(n: number): string {
	if (n < 1000) return n.toString();
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1000000) return `${Math.round(n / 1000)}k`;
	if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
	return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) return `${hours}h${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m${seconds % 60}s`;
	return `${seconds}s`;
}

// ── Icons (reuse nerd font detection from breadcrumb.ts) ──────────────────────

const NERD = hasNerdFonts();

const ICONS = NERD
	? {
			pi: "",
			model: "\uF4BC",
			folder: "\uF115",
			branch: "\uF126",
			git: "\uF1D3",
			tokens: "\u{0F19A1}",
			context: "\uF1C0",
			cost: "\uEF8D",
			time: "\uF017",
			auto: "\uEEAF",
			warning: "\uF071",
			think: "\uF0E7",
		}
	: {
			pi: "",
			model: "◉‿◉",
			folder: "dir",
			branch: "⎇",
			git: "⎇",
			tokens: "⊛",
			context: "◫",
			cost: "$",
			time: "◷",
			auto: "AC",
			warning: "!",
			think: "",
		};

const THINKING_TEXT: Record<string, string> = NERD
	? {
			minimal: `${ICONS.think} min`,
			low: `${ICONS.think} low`,
			medium: `${ICONS.think} med`,
			high: `${ICONS.think} high`,
			xhigh: `${ICONS.think} xhi`,
		}
	: {
			minimal: "[min]",
			low: "[low]",
			medium: "[med]",
			high: "[high]",
			xhigh: "[xhi]",
		};

function getThinkingText(level: string): string | undefined {
	return THINKING_TEXT[level];
}

/** Normalize extension status for inline display */
function normalizeStatus(value: string): string | null {
	if (!value || strWidth(value) <= 0) return null;
	if (value.trimStart().startsWith("[")) return null; // notification style
	const stripped = value.replace(/(\x1b\[[0-9;]*m|\s|·|[|])+$/, "");
	return strWidth(stripped) > 0 ? stripped : null;
}

// ── Segment implementations ──────────────────────────────────────────────────

const piSegment = {
	id: "pi" as const,
	render(ctx: SegmentContext): RenderedSegment {
		if (!ICONS.pi) return { content: "", visible: false };
		return { content: color(ctx, "pi", `${ICONS.pi} `), visible: true };
	},
};

const modelSegment = {
	id: "model" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const opts = ctx.options.model ?? {};
		let modelName = ctx.model?.name || ctx.model?.id || "no-model";
		if (modelName.startsWith("Claude ")) modelName = modelName.slice(7);
		let content = withIcon(ICONS.model, modelName);
		if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
			const level = ctx.thinkingLevel || "off";
			if (level !== "off") {
				const t = getThinkingText(level);
				if (t) content += ` · ${t}`;
			}
		}
		return { content: color(ctx, "model", content), visible: true };
	},
};

const thinkingSegment = {
	id: "thinking" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const level = ctx.thinkingLevel || "off";
		const labels: Record<string, string> = { off: "off", minimal: "min", low: "low", medium: "med", high: "high", xhigh: "xhigh" };
		const label = labels[level] || level;
		const content = `think:${label}`;
		if (level === "high" || level === "xhigh") return { content: rainbow(content), visible: true };
		if (level === "minimal") return { content: color(ctx, "thinkingMinimal", content), visible: true };
		if (level === "low") return { content: color(ctx, "thinkingLow", content), visible: true };
		if (level === "medium") return { content: color(ctx, "thinkingMedium", content), visible: true };
		return { content: color(ctx, "thinking", content), visible: true };
	},
};

const pathSegment = {
	id: "path" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const opts = ctx.options.path ?? {};
		const mode = opts.mode ?? "basename";
		let pwd = ctx.cwd;
		const home = process.env.HOME || process.env.USERPROFILE;
		if (mode === "basename") {
			pwd = basename(pwd) || pwd;
		} else {
			if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
			if (pwd.startsWith("/work/")) pwd = pwd.slice(6);
			if (mode === "abbreviated") {
				const maxLen = opts.maxLength ?? 40;
				if (pwd.length > maxLen) pwd = `…${pwd.slice(-(maxLen - 1))}`;
			}
		}
		return { content: color(ctx, "path", withIcon(ICONS.folder, pwd)), visible: true };
	},
};

const gitSegment = {
	id: "git" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const opts = ctx.options.git ?? {};
		const { branch, staged, unstaged, untracked } = ctx.git;
		const hasStatus = staged > 0 || unstaged > 0 || untracked > 0;
		if (!branch && !hasStatus) return { content: "", visible: false };
		const isDirty = hasStatus;
		const showBranch = opts.showBranch !== false;
		const branchColor: SemanticColor = isDirty ? "gitDirty" : "gitClean";
		let content = "";
		if (showBranch && branch) {
			content = color(ctx, branchColor, withIcon(ICONS.branch, branch));
		}
		if (hasStatus) {
			const parts: string[] = [];
			if (opts.showUnstaged !== false && unstaged > 0) parts.push(applyColor(ctx.theme, "warning", `*${unstaged}`));
			if (opts.showStaged !== false && staged > 0) parts.push(applyColor(ctx.theme, "success", `+${staged}`));
			if (opts.showUntracked !== false && untracked > 0) parts.push(applyColor(ctx.theme, "muted", `?${untracked}`));
			if (parts.length > 0) {
				const ind = parts.join(" ");
				content += content ? ` ${ind}` : color(ctx, branchColor, ICONS.git ? `${ICONS.git} ` : "") + ind;
			}
		}
		if (!content) return { content: "", visible: false };
		return { content, visible: true };
	},
};

const tokenTotalSegment = {
	id: "token_total" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
		const total = input + output + cacheRead + cacheWrite;
		if (!total) return { content: "", visible: false };
		return { content: color(ctx, "tokens", withIcon(ICONS.tokens, formatTokens(total))), visible: true };
	},
};

const costSegment = {
	id: "cost" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const { cost } = ctx.usageStats;
		const sub = ctx.usingSubscription;
		if (!cost && !sub) return { content: "", visible: false };
		const display = sub ? "(sub)" : `${ICONS.cost} ${cost.toFixed(2)}`;
		return { content: color(ctx, "cost", display), visible: true };
	},
};

const contextPctSegment = {
	id: "context_pct" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const pct = ctx.contextPercent;
		const win = ctx.contextWindow;
		const autoIcon = ctx.autoCompactEnabled && ICONS.auto ? ` ${ICONS.auto}` : "";
		const text = `${pct.toFixed(1)}%/${formatTokens(win)}${autoIcon}`;
		if (pct > 90) return { content: color(ctx, "contextError", text), visible: true };
		if (pct > 70) return { content: color(ctx, "contextWarn", text), visible: true };
		return { content: color(ctx, "context", text), visible: true };
	},
};

const timeSpentSegment = {
	id: "time_spent" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const elapsed = Date.now() - ctx.sessionStartTime;
		if (elapsed < 1000) return { content: "", visible: false };
		return { content: withIcon(ICONS.time, formatDuration(elapsed)), visible: true };
	},
};

const extensionStatusesSegment = {
	id: "extension_statuses" as const,
	render(ctx: SegmentContext): RenderedSegment {
		const statuses = ctx.extensionStatuses;
		if (!statuses || statuses.size === 0) return { content: "", visible: false };
		const parts: string[] = [];
		for (const [, value] of statuses.entries()) {
			const n = normalizeStatus(value);
			if (n) parts.push(n);
		}
		if (parts.length === 0) return { content: "", visible: false };
		return { content: parts.join(" · "), visible: true };
	},
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const SEGMENTS: Record<StatusLineSegmentId, { id: StatusLineSegmentId; render(ctx: SegmentContext): RenderedSegment }> = {
	pi: piSegment,
	model: modelSegment,
	thinking: thinkingSegment,
	path: pathSegment,
	git: gitSegment,
	token_total: tokenTotalSegment,
	cost: costSegment,
	context_pct: contextPctSegment,
	time_spent: timeSpentSegment,
	extension_statuses: extensionStatusesSegment,
};

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
	const seg = SEGMENTS[id];
	if (!seg) return { content: "", visible: false };
	return seg.render(ctx);
}
