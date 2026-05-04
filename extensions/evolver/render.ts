/**
 * render.ts — TUI render-функции для evolve и evolve_review tools.
 */

import { Text } from "@mariozechner/pi-tui";
import type { EvolveDetails } from "./types.js";
import { formatDuration } from "./utils.js";

// ---------------------------------------------------------------------------
// Evolve tool
// ---------------------------------------------------------------------------

export function renderEvolveCall(args: Record<string, unknown>): Text {
	const strategy = (args.strategy as string) || "balanced";
	return new Text(`evolve ${strategy}`, 0, 0);
}

export function renderEvolveResult(
	result: { content: Array<{ type: string; text?: string }>; details?: EvolveDetails },
	expanded: boolean,
	theme: { fg: (color: string, text: string) => string; bold: (text: string) => string },
): Text {
	const details = result.details;
	const text = result.content[0];
	const contentText = text?.type === "text" ? text.text ?? "(no output)" : "(no output)";

	const hasError =
		(details?.exitCode !== undefined && details?.exitCode !== 0) ||
		details?.aborted ||
		details?.timedOut;
	const icon = hasError ? theme.fg("error", "✗") : theme.fg("success", "✓");

	const parts = [
		`${icon} `,
		theme.fg("toolTitle", theme.bold("evolve")),
		theme.fg("muted", ` [${details?.strategy || "?"}]`),
		theme.fg("dim", ` ${formatDuration(details?.durationMs || 0)}`),
	];

	if (details?.aborted) parts.push(" ", theme.fg("warning", "[aborted]"));
	if (details?.timedOut) parts.push(" ", theme.fg("warning", "[timeout]"));

	const header = new Text(parts.join(""), 0, 0);

	if (!expanded) {
		const lines = contentText.split("\n");
		const preview = lines.slice(0, 3).join("\n");
		const fullText = `${header.toString()}\n${preview}${lines.length > 3 ? "\n..." : ""}`;
		return new Text(fullText, 0, 0);
	}

	return new Text(`${header.toString()}\n\n${contentText}`, 0, 0);
}

// ---------------------------------------------------------------------------
// Evolve Review tool
// ---------------------------------------------------------------------------

export function renderEvolveReviewCall(args: Record<string, unknown>): Text {
	const action = args.reject ? "reject" : "approve + solidify";
	return new Text(`evolve_review ${action}`, 0, 0);
}

export function renderEvolveReviewResult(
	result: { content: Array<{ type: string; text?: string }>; details?: EvolveDetails },
	theme: { fg: (color: string, text: string) => string; bold: (text: string) => string },
): Text {
	const details = result.details;
	const text = result.content[0];
	const contentText = text?.type === "text" ? text.text ?? "(no output)" : "(no output)";

	const hasError = (details?.exitCode ?? 0) !== 0;
	const icon = hasError ? theme.fg("error", "✗") : theme.fg("success", "✓");

	const parts = [
		`${icon} `,
		theme.fg("toolTitle", theme.bold("evolve_review")),
		theme.fg("muted", ` [${details?.strategy || "?"}]`),
		theme.fg("dim", ` ${formatDuration(details?.durationMs || 0)}`),
	];

	const header = new Text(parts.join(""), 0, 0);
	return new Text(`${header.toString()}\n\n${contentText}`, 0, 0);
}
