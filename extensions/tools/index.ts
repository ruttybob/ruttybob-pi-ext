/**
 * Tools Extension for pi
 *
 * Interactive UI for enabling/disabling tools via the /tools command.
 * State persists across session reloads and respects branch navigation.
 *
 * Instruments listed in toolignore.json (global or project-level) are
 * hidden from the /tools selector UI. They are NOT added or removed
 * from the active tool set — that is managed by each extension.
 *
 * Usage:
 *   /tools          — open tool selector (checkboxes)
 *   /tools <group>  — toggle group on/off
 *   /tools-group    — manage groups (create, delete, toggle)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadDisabledPatterns, loadIgnorePatterns, resolveIgnoredTools } from "./ignore.js";
import { ToolSelector, type ToolItem } from "./tool-selector.js";
import {
	loadGroups,
	saveGroups,
	resolveGroupTools,
	isGroupEnabled,
	findGroup,
	type ToolGroup,
} from "./groups.js";
import { GroupManager, type GroupItem, type GroupAction } from "./group-manager.js";

// Минимальный theme для ToolSelector
const selectorTheme = {
	fg: (color: string, text: string) => text,
	bold: (text: string) => text,
	dim: (text: string) => text,
	success: (text: string) => text,
	accent: (text: string) => text,
	muted: (text: string) => text,
};

// State persisted to session
interface ToolsState {
	enabledTools: string[];
}

/**
 * Restore enabled tools from session branch entries.
 *
 * Walks the current branch to find the last `tools-config` entry,
 * then filters the saved tool names against currently available tools.
 * Disabled patterns from settings.json are excluded from the initial set.
 *
 * @param pi       - Extension API for reading tools and applying selection
 * @param ctx      - Extension context for accessing session manager
 * @returns Set of enabled tool names after restoration
 */
export function restoreFromBranch(pi: ExtensionAPI, ctx: any): Set<string> {
	const allTools = pi.getAllTools();
	const allToolNames = new Set(allTools.map((t: any) => t.name));

	const cwd = ctx.cwd ?? process.cwd();

	// Resolve disabled patterns from settings.json
	const disabledPatterns = loadDisabledPatterns(cwd);
	const disabledTools = resolveIgnoredTools(Array.from(allToolNames), disabledPatterns);

	const branchEntries = ctx.sessionManager.getBranch();
	let savedTools: string[] | undefined;

	for (const entry of branchEntries) {
		if (entry.type === "custom" && entry.customType === "tools-config") {
			const data = entry.data as ToolsState | undefined;
			if (data?.enabledTools) {
				savedTools = data.enabledTools;
			}
		}
	}

	let enabledTools: Set<string>;

	if (savedTools) {
		enabledTools = new Set(savedTools.filter((t: string) => allToolNames.has(t)));
	} else {
		// No saved state — sync with currently active tools
		enabledTools = new Set(pi.getActiveTools());
		// Убираем disabled-инструменты из начального набора
		for (const name of disabledTools) {
			enabledTools.delete(name);
		}
	}

	pi.setActiveTools(Array.from(enabledTools));
	return enabledTools;
}

export default function toolsExtension(pi: ExtensionAPI) {
	let enabledTools: Set<string> = new Set();

	function persistState() {
		pi.appendEntry<ToolsState>("tools-config", {
			enabledTools: Array.from(enabledTools),
		});
	}

	function applyTools() {
		pi.setActiveTools(Array.from(enabledTools));
	}

	function restore(ctx: any) {
		enabledTools = restoreFromBranch(pi, ctx);
	}

	/** Возвращает множество игнорируемых инструментов для текущего cwd */
	function getIgnoredTools(ctx: any): Set<string> {
		const cwd = ctx.cwd ?? process.cwd();
		const allTools = pi.getAllTools();
		const allToolNames = allTools.map((t: any) => t.name);
		const patterns = loadIgnorePatterns(cwd);
		return resolveIgnoredTools(allToolNames, patterns);
	}

	// -----------------------------------------------------------------------
	// /tools <group> — toggle группы по имени
	// -----------------------------------------------------------------------

	function toggleGroup(groupName: string, ctx: any) {
		const cwd = ctx.cwd ?? process.cwd();
		const allTools = pi.getAllTools();
		const allToolNames = allTools.map((t: any) => t.name);
		const groups = loadGroups(cwd);
		const group = findGroup(groups, groupName);

		if (!group) {
			ctx.ui.notify(`Group "${groupName}" not found. Use /tools-group to create groups.`, "error");
			return;
		}

		const groupTools = resolveGroupTools(group, allToolNames);
		if (groupTools.length === 0) {
			ctx.ui.notify(`Group "${groupName}" (${group.pattern}) — no matching tools found.`, "warning");
			return;
		}

		const wasEnabled = isGroupEnabled(groupTools, Array.from(enabledTools));

		if (wasEnabled) {
			// Выключаем — убираем инструменты группы из enabledTools
			for (const name of groupTools) {
				enabledTools.delete(name);
			}
		} else {
			// Включаем — добавляем инструменты группы в enabledTools
			for (const name of groupTools) {
				enabledTools.add(name);
			}
		}

		applyTools();
		persistState();

		const status = wasEnabled ? "disabled" : "enabled";
		const count = groupTools.length;
		ctx.ui.notify(
			`Group "${groupName}" ${status} (${count} tool${count !== 1 ? "s" : ""})`,
			"info",
		);
	}

	// -----------------------------------------------------------------------
	// /tools — селектор или toggle группы
	// -----------------------------------------------------------------------

	pi.registerCommand("tools", {
		description: "Enable/disable tools or toggle a group",
		handler: async (args, ctx) => {
			// Если передан аргумент — toggle группы
			const groupName = typeof args === "string" ? args.trim() : "";
			if (groupName) {
				toggleGroup(groupName, ctx);
				return;
			}

			// Без аргументов — TUI-селектор
			const allTools = pi.getAllTools();
			const ignoredTools = getIgnoredTools(ctx);

			await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: (result: any) => void) => {
				// Фильтруем locked-инструменты, формируем чекбоксы
				const toggleableTools = allTools.filter(
					(tool: any) => !ignoredTools.has(tool.name),
				);
				const items: ToolItem[] = toggleableTools.map((tool: any) => ({
					name: tool.name,
					enabled: enabledTools.has(tool.name),
				}));

				const selector = new ToolSelector({
					tools: items,
					theme: selectorTheme,
					onToggle: (name: string, newEnabled: boolean) => {
						if (newEnabled) {
							enabledTools.add(name);
						} else {
							enabledTools.delete(name);
						}
						applyTools();
						persistState();
					},
					onCancel: () => {
						done(undefined);
					},
				});

				return {
					render(width: number) {
						return selector.render(width);
					},
					invalidate() {
						selector.invalidate();
					},
					handleInput(data: string) {
						selector.handleInput(data);
						tui.requestRender();
					},
				};
			});
		},
	});

	// -----------------------------------------------------------------------
	// /tools-group — управление группами
	// -----------------------------------------------------------------------

	pi.registerCommand("tools-group", {
		description: "Manage tool groups (create, delete, toggle)",
		handler: async (_args, ctx) => {
			const cwd = ctx.cwd ?? process.cwd();
			const allTools = pi.getAllTools();
			const allToolNames = allTools.map((t: any) => t.name);

			function buildGroupItems(): GroupItem[] {
				const groups = loadGroups(cwd);
				return groups.map((g) => {
					const tools = resolveGroupTools(g, allToolNames);
					return {
						name: g.name,
						pattern: g.pattern,
						description: g.description,
						enabled: isGroupEnabled(tools, Array.from(enabledTools)),
						toolCount: tools.length,
					};
				});
			}

			await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: (result: any) => void) => {
				let groupItems = buildGroupItems();

				const manager = new GroupManager({
					groups: groupItems,
					theme: selectorTheme,
					onAction: (action: GroupAction) => {
						if (action.type === "toggle") {
							const groups = loadGroups(cwd);
							const group = findGroup(groups, action.name);
							if (!group) return;

							const tools = resolveGroupTools(group, allToolNames);
							if (action.enabled) {
								for (const name of tools) enabledTools.add(name);
							} else {
								for (const name of tools) enabledTools.delete(name);
							}
							applyTools();
							persistState();
							// Обновляем TUI
							groupItems = buildGroupItems();
							manager.updateGroups(groupItems);
							tui.requestRender();
						} else if (action.type === "delete") {
							const groups = loadGroups(cwd);
							const filtered = groups.filter((g) => g.name !== action.name);
							saveGroups(cwd, filtered);
							ctx.ui.notify(`Group "${action.name}" deleted`, "info");
							// Обновляем TUI
							groupItems = buildGroupItems();
							manager.updateGroups(groupItems);
							tui.requestRender();
						} else if (action.type === "create") {
							// Закрываем TUI, переходим к интерактивному вводу
							done(undefined);
							createGroupInteractive(cwd, allToolNames, ctx, () => {
								// После создания группы — показываем уведомление
								// Повторный вызов /tools-group не нужен — пользователь увидит notify
							});
						}
					},
					onCancel: () => {
						done(undefined);
					},
				});

				return {
					render(width: number) {
						return manager.render(width);
					},
					invalidate() {
						manager.invalidate();
					},
					handleInput(data: string) {
						manager.handleInput(data);
						tui.requestRender();
					},
				};
			});
		},
	});

	/** Интерактивное создание группы через ctx.ui.input() */
	async function createGroupInteractive(
		cwd: string,
		allToolNames: string[],
		ctx: any,
		_onDone: () => void,
	) {
		const name = await ctx.ui.input("Group name", "my-group");
		if (!name?.trim()) {
			ctx.ui.notify("Group creation cancelled", "info");
			return;
		}

		const pattern = await ctx.ui.input(
			"Tool name pattern (glob: * and ?)",
			`${name.trim()}_*`,
		);
		if (!pattern?.trim()) {
			ctx.ui.notify("Group creation cancelled", "info");
			return;
		}

		const description = await ctx.ui.input(
			"Description (optional)",
			"",
		);

		const newGroup: ToolGroup = {
			name: name.trim(),
			pattern: pattern.trim(),
		};
		if (description?.trim()) {
			newGroup.description = description.trim();
		}

		const groups = loadGroups(cwd);
		// Проверяем дубликат
		if (findGroup(groups, newGroup.name)) {
			ctx.ui.notify(`Group "${newGroup.name}" already exists`, "error");
			return;
		}

		groups.push(newGroup);
		saveGroups(cwd, groups);

		const matchedTools = resolveGroupTools(newGroup, allToolNames);
		ctx.ui.notify(
			`Group "${newGroup.name}" created (${matchedTools.length} tool${matchedTools.length !== 1 ? "s" : ""} match "${newGroup.pattern}")`,
			"info",
		);
	}

	// Restore state on session start
	pi.on("session_start", async (_event, ctx) => {
		restore(ctx);
	});

	// Restore state when navigating the session tree
	pi.on("session_tree", async (_event, ctx) => {
		restore(ctx);
	});
}
