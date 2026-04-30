import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

// ══════════════════════════════════════════════════════════════════════════
//  Shared helpers
// ══════════════════════════════════════════════════════════════════════════

function progressBar(pct: number, width: number, theme: Theme): string {
	const filled = Math.round((pct / 100) * width);
	const empty = width - filled;
	return (
		theme.fg(pct > 85 ? "error" : pct > 60 ? "warning" : "success", "█".repeat(filled)) +
		theme.fg("dim", "░".repeat(empty))
	);
}

function formatUsd(value: number): string {
	return `$${value.toFixed(2)}`;
}

function formatTimeRemaining(target: Date): string {
	const ms = target.getTime() - Date.now();
	if (ms <= 0) return "now";
	const totalMin = Math.ceil(ms / 60_000);
	const hours = Math.floor(totalMin / 60);
	const mins = totalMin % 60;
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

// ══════════════════════════════════════════════════════════════════════════
//  OpenRouter types & fetch
// ══════════════════════════════════════════════════════════════════════════

interface OpenRouterKeyData {
	limit: number | null;
	limit_remaining: number;
	usage_daily: number;
	usage_weekly: number;
	usage_monthly: number;
	label?: string;
	rate_limit?: number;
}

interface OpenRouterCreditsData {
	total_credits: number;
	total_usage: number;
}

interface ORData {
	key: OpenRouterKeyData;
	credits: OpenRouterCreditsData | null;
}

function nextMidnightUTC(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
function nextMondayUTC(): Date {
	const now = new Date();
	const day = now.getUTCDay();
	const d = day === 0 ? 1 : 8 - day;
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
}
function nextMonthStartUTC(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function fetchORKey(apiKey: string): Promise<OpenRouterKeyData> {
	const r = await fetch("https://openrouter.ai/api/v1/key", {
		headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!r.ok) {
		const t = await r.text().catch(() => r.statusText);
		throw new Error(`GET /key: HTTP ${r.status}: ${t}`);
	}
	return ((await r.json()) as { data: OpenRouterKeyData }).data;
}

async function fetchORCredits(apiKey: string): Promise<OpenRouterCreditsData | null> {
	try {
		const r = await fetch("https://openrouter.ai/api/v1/credits", {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (!r.ok) return null;
		return ((await r.json()) as { data: OpenRouterCreditsData }).data;
	} catch { return null; }
}

async function fetchOR(apiKey: string): Promise<ORData> {
	const [key, credits] = await Promise.all([fetchORKey(apiKey), fetchORCredits(apiKey)]);
	return { key, credits };
}

// ══════════════════════════════════════════════════════════════════════════
//  ZAI types & fetch
// ══════════════════════════════════════════════════════════════════════════

interface UsageDetail { modelCode: string; usage: number }
interface ZaiLimit {
	type: string; unit: number; number: number;
	usage?: number; currentValue?: number; remaining?: number;
	percentage: number; nextResetTime: number; usageDetails?: UsageDetail[];
}
interface ZaiData { limits: ZaiLimit[]; level: string }

function unitLabel(u: number): string { return u === 5 ? "monthly" : u === 3 ? "daily" : `unit-${u}`; }
function typeLabel(t: string): string {
	return t === "TIME_LIMIT" ? "⏱  Time Limit" : t === "TOKENS_LIMIT" ? "🔤 Tokens Limit" : t;
}
function formatResetMs(ms: number): string {
	const diffMs = ms - Date.now();
	if (diffMs <= 0) return "now";
	const dm = Math.floor(diffMs / 60_000);
	const dh = Math.floor(dm / 60);
	const dd = Math.floor(dh / 24);
	if (dd > 0) return `${dd}d ${dh % 24}h`;
	if (dh > 0) return `${dh}h ${dm % 60}m`;
	return `${dm}m`;
}

async function fetchZAI(apiKey: string): Promise<ZaiData> {
	const r = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
		headers: { Authorization: apiKey, "Content-Type": "application/json", "Accept-Language": "en-US,en" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	const json = (await r.json()) as { data: ZaiData };
	return json.data;
}

// ══════════════════════════════════════════════════════════════════════════
//  Shared section helpers (unified layout for both tabs)
// ══════════════════════════════════════════════════════════════════════════

/** Shared bar width — uses most of the terminal */
function barWidth(width: number): number {
	return Math.min(30, Math.max(12, width - 24));
}

/** Render a compact section: progress bar + stats on one line */
function section(
	th: Theme, width: number, bw: number,
	icon: string, title: string,
	pct: number,
	stats: Array<{ label: string; value: string; color: string }>,
	resetLabel: string, resetValue: string,
	lines: string[],
): void {
	lines.push(truncateToWidth(`  ${th.fg("accent", th.bold(`${icon} ${title}`))}`, width));
	lines.push(truncateToWidth(`    ${progressBar(pct, bw, th)} ${th.fg("accent", `${pct}%`)}`, width));
	const statParts = stats.map(
		(s) => `${th.fg("text", `${s.label}:`)} ${th.fg(s.color, s.value)}`,
	);
	let statLine = `    ${statParts.join("  ")}`;
	if (resetLabel) {
		statLine += `  ${th.fg("dim", `${resetLabel}:`)} ${th.fg("accent", resetValue)}`;
	}
	lines.push(truncateToWidth(statLine, width));
}

// ══════════════════════════════════════════════════════════════════════════
//  Tab renderer: OpenRouter
// ══════════════════════════════════════════════════════════════════════════

function renderOpenRouter(data: ORData, th: Theme, width: number): string[] {
	const lines: string[] = [];
	const bw = barWidth(width);
	const d = data;

	// ── Balance ──────────────────────────────────────────────────────
	if (d.credits) {
		const { total_credits, total_usage } = d.credits;
		const rem = total_credits - total_usage;
		const pct = total_credits > 0 ? Math.min(100, Math.round((total_usage / total_credits) * 100)) : 0;

		section(th, width, bw, "💳", "Balance", pct, [
			{ label: "Total", value: formatUsd(total_credits), color: "success" },
			{ label: "Used", value: formatUsd(total_usage), color: "warning" },
			{ label: "Remaining", value: formatUsd(rem), color: "success" },
		], "", "", lines);
	}

	// ── Monthly Budget ───────────────────────────────────────────────
	if (d.key.limit != null && d.key.limit > 0) {
		const used = d.key.usage_monthly;
		const budget = d.key.limit;
		const pct = Math.min(100, Math.round((used / budget) * 100));
		const rem = Math.max(0, budget - used);

		section(th, width, bw, "💰", "Monthly Budget", pct, [
			{ label: "Spent", value: formatUsd(used), color: "warning" },
			{ label: "Budget", value: formatUsd(budget), color: "muted" },
			{ label: "Remaining", value: formatUsd(rem), color: "success" },
		], "Resets", formatTimeRemaining(nextMonthStartUTC()), lines);
	} else if (d.key.limit_remaining != null && d.key.limit_remaining >= 0 && !d.credits) {
		section(th, width, bw, "💳", "Credits", 0, [
			{ label: "Remaining", value: formatUsd(d.key.limit_remaining), color: "success" },
		], "", "", lines);
	}

	// ── Usage (compact single-line) ──────────────────────────────────
	lines.push("");
	lines.push(truncateToWidth(`  ${th.fg("accent", th.bold("📊 Usage"))}`, width));

	const windows = [
		{ label: "Daily", amount: d.key.usage_daily, resetsAt: nextMidnightUTC() },
		{ label: "Weekly", amount: d.key.usage_weekly, resetsAt: nextMondayUTC() },
	];

	for (const w of windows) {
		const pct = d.key.limit && d.key.limit > 0
			? Math.min(100, Math.round((w.amount / d.key.limit) * 100))
			: 0;
		const miniBw = Math.min(20, Math.max(8, bw - 24));
		lines.push(
			truncateToWidth(
				`    ${th.fg("dim", w.label.padEnd(7))} ${progressBar(pct, miniBw, th)} ${th.fg("text", formatUsd(w.amount).padStart(8))}  ${th.fg("dim", formatTimeRemaining(w.resetsAt))}`,
				width,
			),
		);
	}

	if (d.key.rate_limit != null) {
		lines.push(truncateToWidth(`    ${th.fg("dim", `⏱ ${d.key.rate_limit} req/min`)}`, width));
	}
	return lines;
}

// ══════════════════════════════════════════════════════════════════════════
//  Tab renderer: ZAI
// ══════════════════════════════════════════════════════════════════════════

function renderZAI(data: ZaiData, th: Theme, width: number): string[] {
	const lines: string[] = [];
	const bw = barWidth(width);

	// Plan badge
	lines.push(truncateToWidth(`  ${th.fg("accent", th.bold("🏷  Plan"))}  ${th.fg("accent", th.bold(data.level.toUpperCase()))}`, width));

	for (const limit of data.limits) {
		const icon = limit.type === "TIME_LIMIT" ? "⏱ " : limit.type === "TOKENS_LIMIT" ? "🔤" : "📊";
		const title = limit.type === "TIME_LIMIT" ? "Time" : limit.type === "TOKENS_LIMIT" ? "Tokens" : limit.type;

		if (limit.type === "TIME_LIMIT") {
			const used = limit.currentValue ?? 0;
			const total = limit.usage ?? 0;
			const rem = limit.remaining ?? 0;
			const pct = limit.percentage;

			section(th, width, bw, icon, `${title} (${unitLabel(limit.unit)})`, pct, [
				{ label: "Used", value: `${used}`, color: "warning" },
				{ label: "Total", value: `${total}`, color: "muted" },
				{ label: "Left", value: `${rem}`, color: "success" },
			], "Resets", formatResetMs(limit.nextResetTime), lines);

			// Per-model breakdown (compact)
			if (limit.usageDetails && limit.usageDetails.length > 0) {
				for (const det of limit.usageDetails) {
					const mp = total > 0 ? Math.round((det.usage / total) * 100) : 0;
					const mbw = Math.min(15, Math.max(6, bw - 30));
					lines.push(
						truncateToWidth(
							`      ${th.fg("muted", det.modelCode.padEnd(20))} ${progressBar(mp, mbw, th)} ${th.fg("dim", `${det.usage} (${mp}%)`)}`,
							width,
						),
					);
				}
			}
		} else if (limit.type === "TOKENS_LIMIT") {
			const pct = limit.percentage;
			section(th, width, bw, icon, `${title} (${unitLabel(limit.unit)})`, pct, [],
				"Resets", formatResetMs(limit.nextResetTime), lines);
		} else {
			const pct = limit.percentage;
			section(th, width, bw, icon, title, pct, [],
				"Resets", formatResetMs(limit.nextResetTime), lines);
		}
	}
	return lines;
}

// ══════════════════════════════════════════════════════════════════════════
//  Dashboard component
// ══════════════════════════════════════════════════════════════════════════

type LoadState<T> =
	| { tag: "loading" }
	| { tag: "ok"; data: T }
	| { tag: "err"; msg: string }
	| { tag: "nokey"; env: string };

class Dashboard {
	private state: { or: LoadState<ORData>; zai: LoadState<ZaiData> };
	private theme: Theme;
	private onClose: () => void;
	private cachedW?: number;
	private cachedLines?: string[];
	private tab: "zai" | "or" = "zai";

	constructor(theme: Theme, onClose: () => void) {
		this.theme = theme;
		this.onClose = onClose;
		this.state = {
			or: process.env.OPENROUTER_API_KEY ? { tag: "loading" } : { tag: "nokey", env: "OPENROUTER_API_KEY" },
			zai: process.env.ZAI_API_KEY ? { tag: "loading" } : { tag: "nokey", env: "ZAI_API_KEY" },
		};
	}

	// ── public mutators ──────────────────────────────────────────────

	setOR(state: LoadState<ORData>): void { this.state.or = state; this.invalidate(); }
	setZAI(state: LoadState<ZaiData>): void { this.state.zai = state; this.invalidate(); }
	get activeTab(): "zai" | "or" { return this.tab; }

	// ── input ────────────────────────────────────────────────────────

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "q") {
			this.onClose();
			return;
		}
		if (matchesKey(data, "tab") || matchesKey(data, Key.right)) {
			this.tab = this.tab === "zai" ? "or" : "zai";
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.left)) {
			this.tab = this.tab === "or" ? "zai" : "or";
			this.invalidate();
			return;
		}
	}

	// ── render ───────────────────────────────────────────────────────

	render(width: number): string[] {
		if (this.cachedLines && this.cachedW === width) return this.cachedLines;

		const th = this.theme;
		const lines: string[] = [];

		// ── Tab-bar header ────────────────────────────────────────────
		const zaiLabel = this.tab === "zai"
			? th.fg("error", th.bold(" ZAI "))
			: th.fg("dim", " ZAI ");
		const orLabel = this.tab === "or"
			? th.fg("error", th.bold(" OpenRouter "))
			: th.fg("dim", " OpenRouter ");
		const sep = th.fg("error", "│");
		const tabBar = ` ${zaiLabel} ${sep} ${orLabel} `;
		const tabBarRaw = " ZAI │ OpenRouter ";
		const leftDash = Math.max(1, Math.floor((width - tabBarRaw.length) / 2));
		const rightDash = Math.max(1, width - tabBarRaw.length - leftDash);
		lines.push(truncateToWidth(
			th.fg("error", "─".repeat(leftDash)) + tabBar + th.fg("error", "─".repeat(rightDash)),
			width,
		));

		lines.push("");

		// ── Active tab content ────────────────────────────────────────
		if (this.tab === "zai") {
			const zai = this.state.zai;
			if (zai.tag === "loading") {
				lines.push(th.fg("muted", "  ⏳ Fetching..."));
			} else if (zai.tag === "nokey") {
				lines.push(th.fg("error", `  ✗ ${zai.env} environment variable is not set`));
			} else if (zai.tag === "err") {
				lines.push(th.fg("error", `  ✗ ${zai.msg}`));
			} else if (zai.tag === "ok") {
				lines.push(...renderZAI(zai.data, th, width));
			}
		} else {
			const or = this.state.or;
			if (or.tag === "loading") {
				lines.push(th.fg("muted", "  ⏳ Fetching..."));
			} else if (or.tag === "nokey") {
				lines.push(th.fg("error", `  ✗ ${or.env} environment variable is not set`));
			} else if (or.tag === "err") {
				lines.push(th.fg("error", `  ✗ ${or.msg}`));
			} else if (or.tag === "ok") {
				lines.push(...renderOpenRouter(or.data, th, width));
			}
		}

		// Red bottom border + footer
		lines.push("");
		lines.push(th.fg("error", "─".repeat(width)));
		lines.push(truncateToWidth(`  ${th.fg("dim", "←/→ switch  ·  r refresh  ·  q/Esc close")}`, width));

		this.cachedW = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedW = undefined;
		this.cachedLines = undefined;
	}
}

// ══════════════════════════════════════════════════════════════════════════
//  Data loading helpers
// ══════════════════════════════════════════════════════════════════════════

function loadOpenRouter(dash: Dashboard, requestRender: () => void): () => void {
	let cancelled = false;
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) {
		dash.setOR({ tag: "nokey", env: "OPENROUTER_API_KEY" });
		requestRender();
		return () => {};
	}
	fetchOR(key)
		.then((data) => { if (!cancelled) { dash.setOR({ tag: "ok", data }); requestRender(); } })
		.catch((e: any) => { if (!cancelled) { dash.setOR({ tag: "err", msg: e.message }); requestRender(); } });
	return () => { cancelled = true; };
}

function loadZAI(dash: Dashboard, requestRender: () => void): () => void {
	let cancelled = false;
	const key = process.env.ZAI_API_KEY;
	if (!key) {
		dash.setZAI({ tag: "nokey", env: "ZAI_API_KEY" });
		requestRender();
		return () => {};
	}
	fetchZAI(key)
		.then((data) => { if (!cancelled) { dash.setZAI({ tag: "ok", data }); requestRender(); } })
		.catch((e: any) => { if (!cancelled) { dash.setZAI({ tag: "err", msg: e.message }); requestRender(); } });
	return () => { cancelled = true; };
}

// ══════════════════════════════════════════════════════════════════════════
//  Extension
// ══════════════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
	pi.registerCommand("quota", {
		description: "Show unified quota dashboard for OpenRouter and ZAI",
		handler: async (_args, ctx) => {
			const orKey = process.env.OPENROUTER_API_KEY;
			const zaiKey = process.env.ZAI_API_KEY;

			// ── Non-interactive fallback ─────────────────────────────
			if (!ctx.hasUI) {
				const parts: string[] = [];
				if (orKey) {
					try {
						const d = await fetchOR(orKey);
						if (d.credits) {
							const rem = d.credits.total_credits - d.credits.total_usage;
							parts.push(`OR Balance: ${formatUsd(rem)}/${formatUsd(d.credits.total_credits)}`);
						}
						parts.push(`OR Daily: ${formatUsd(d.key.usage_daily)}`);
					} catch (e: any) { parts.push(`OR: err ${e.message}`); }
				}
				if (zaiKey) {
					try {
						const d = await fetchZAI(zaiKey);
						parts.push(`ZAI: ${d.level}, ${d.limits.length} limits`);
					} catch (e: any) { parts.push(`ZAI: err ${e.message}`); }
				}
				ctx.ui.notify(parts.length ? parts.join(" | ") : "No API keys configured", "info");
				return;
			}

			// ── Interactive overlay ──────────────────────────────────
			pi?.events?.emit("custom-ui:shown", { timestamp: Date.now() });
			try {
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				let closed = false;

				const dash = new Dashboard(theme, () => { closed = true; done(); });

				// Load both tabs in parallel
				const cancelOR = loadOpenRouter(dash, () => tui.requestRender());
				const cancelZAI = loadZAI(dash, () => tui.requestRender());

				return {
					render: (w: number) => dash.render(w),
					invalidate: () => dash.invalidate(),
					handleInput: (data: string) => {
						if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "q") {
							cancelOR(); cancelZAI(); closed = true; done(); return;
						}
						if (matchesKey(data, "tab") || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
							dash.handleInput(data);
							tui.requestRender();
							return;
						}
						if (data === "r") {
							// Refresh active tab
							if (dash.activeTab === "zai") {
								dash.setZAI({ tag: "loading" });
								tui.requestRender();
								loadZAI(dash, () => tui.requestRender());
							} else {
								dash.setOR({ tag: "loading" });
								tui.requestRender();
								loadOpenRouter(dash, () => tui.requestRender());
							}
						}
					},
				};
			}, { overlay: true, overlayOptions: { anchor: 'center', width: '50%', minWidth: 40, maxHeight: '80%' } });
			} finally { pi?.events?.emit("custom-ui:hidden", { timestamp: Date.now() }); }
		},
	});
}
