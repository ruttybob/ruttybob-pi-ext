/**
 * advisor-ui — bordered select-panel builders for the /advisor command.
 *
 * Two public functions (showAdvisorPicker, showEffortPicker) share a private
 * buildSelectPanel helper that owns the bordered-container layout and the
 * SelectList theme wiring.
 */

import type { ThinkingLevel } from "@earendil-works/pi-ai";
import { DynamicBorder, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, getKeybindings, Input, matchesKey } from "@earendil-works/pi-tui";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui";

const MAX_VISIBLE_ROWS = 10;
const NAV_HINT = "type to search • ↑↓ navigate • enter select • esc cancel";

const ADVISOR_HEADER_TITLE = "Advisor Tool";
const ADVISOR_HEADER_PROSE_1 =
	"When the active model needs stronger judgment — a complex decision, an ambiguous " +
	"failure, a problem it's circling without progress — it escalates to the " +
	"advisor model for guidance, then resumes. The advisor runs server-side " +
	"and uses additional tokens.";
const ADVISOR_HEADER_PROSE_2 =
	"For certain workloads, pairing a faster model as the main model with a " +
	"more capable one as the advisor gives near-top-tier performance with " +
	"reduced token usage.";

const EFFORT_HEADER_TITLE = "Reasoning Level";
const EFFORT_HEADER_PROSE =
	"Choose the reasoning effort level for the advisor. " +
	"Higher levels produce stronger judgment but use more tokens.";

function selectListTheme(theme: Theme) {
	return {
		selectedPrefix: (t: string) => theme.bg("selectedBg", theme.fg("accent", t)),
		selectedText: (t: string) => theme.bg("selectedBg", theme.bold(t)),
		description: (t: string) => theme.fg("muted", t),
		scrollInfo: (t: string) => theme.fg("dim", t),
		noMatch: (t: string) => theme.fg("warning", t),
	};
}

function buildSelectPanel(theme: Theme, title: string, proseLines: string[], selectList: SelectList): Container {
	const container = new Container();
	const border = () => new DynamicBorder((s: string) => theme.fg("accent", s));

	container.addChild(border());
	container.addChild(new Spacer(1));
	container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
	container.addChild(new Spacer(1));
	for (const line of proseLines) {
		container.addChild(new Text(line, 1, 0));
		container.addChild(new Spacer(1));
	}
	container.addChild(selectList);
	container.addChild(new Spacer(1));
	container.addChild(new Text(theme.fg("dim", NAV_HINT), 1, 0));
	container.addChild(new Spacer(1));
	container.addChild(border());
	return container;
}

export async function showAdvisorPicker(ctx: ExtensionContext, items: SelectItem[]): Promise<string | null> {
	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const searchInput = new Input();
		const allItems = items;
		const selectList = new SelectList(items, Math.min(items.length, MAX_VISIBLE_ROWS), selectListTheme(theme));

		const border = () => new DynamicBorder((s: string) => theme.fg("accent", s));

		const container = new Container();
		container.addChild(border());
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("accent", theme.bold(ADVISOR_HEADER_TITLE)), 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(ADVISOR_HEADER_PROSE_1, 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(ADVISOR_HEADER_PROSE_2, 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(searchInput);
		container.addChild(new Spacer(1));
		container.addChild(selectList);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", NAV_HINT), 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(border());

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				const kb = getKeybindings();

				if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down")) {
					selectList.handleInput(data);
				} else if (kb.matches(data, "tui.select.confirm")) {
					const selected = selectList.getSelectedItem();
					if (selected) done(selected.value);
				} else if (kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) {
					done(null);
				} else {
						searchInput.handleInput(data);
					const query = searchInput.getValue().trim();
					const sl = selectList as any;
					if (!query) {
						sl.filteredItems = allItems;
						sl.selectedIndex = 0;
					} else {
						const matched = fuzzyFilter(allItems, query, (item) => item.label ?? item.value);
						sl.filteredItems = matched;
						sl.selectedIndex = 0;
					}
				}
				tui.requestRender();
			},
		};
	});
}

export async function showEffortPicker(
	ctx: ExtensionContext,
	items: SelectItem[],
	currentEffort: ThinkingLevel | undefined,
	defaultEffort: ThinkingLevel,
): Promise<string | null> {
	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const selectList = new SelectList(items, Math.min(items.length, MAX_VISIBLE_ROWS), selectListTheme(theme));
		const preferredIdx = currentEffort ? items.findIndex((item) => item.value === currentEffort) : -1;
		selectList.setSelectedIndex(
			preferredIdx >= 0 ? preferredIdx : items.findIndex((item) => item.value === defaultEffort),
		);
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);

		const container = buildSelectPanel(theme, EFFORT_HEADER_TITLE, [EFFORT_HEADER_PROSE], selectList);

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});
}
