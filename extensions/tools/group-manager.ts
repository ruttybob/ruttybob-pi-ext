/**
 * GroupManager — TUI-компонент управления группами инструментов.
 *
 * Список групп с индикаторами [x]/[ ], курсор, fuzzy-поиск.
 * Действия: space/enter — toggle, d — удалить, n — создать (через callback).
 */

import {
	fuzzyFilter,
	getKeybindings,
	Input,
	matchesKey,
	truncateToWidth,
} from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface GroupItem {
	name: string;
	pattern: string;
	description?: string;
	enabled: boolean;
	toolCount: number;
}

export interface GroupManagerTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
	dim: (text: string) => string;
	muted?: (text: string) => string;
	success?: (text: string) => string;
	accent?: (text: string) => string;
	warning?: (text: string) => string;
}

export type GroupAction =
	| { type: "toggle"; name: string; enabled: boolean }
	| { type: "delete"; name: string }
	| { type: "create" };

export interface GroupManagerOptions {
	groups: GroupItem[];
	theme: GroupManagerTheme;
	onAction: (action: GroupAction) => void;
	onCancel: () => void;
}

// ---------------------------------------------------------------------------
// GroupManager
// ---------------------------------------------------------------------------

export class GroupManager {
	private groups: GroupItem[];
	private theme: GroupManagerTheme;
	private onAction: (action: GroupAction) => void;
	private onCancel: () => void;

	private selectedIndex = 0;
	private filteredItems: GroupItem[] = [];
	private searchInput: Input;
	private maxVisible = 15;

	constructor(options: GroupManagerOptions) {
		this.groups = [...options.groups].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		this.theme = options.theme;
		this.onAction = options.onAction;
		this.onCancel = options.onCancel;

		this.searchInput = new Input();
		this.filteredItems = [...this.groups];
		this.selectedIndex = 0;
	}

	// Обновить данные групп (после toggle/delete/create)
	updateGroups(groups: GroupItem[]): void {
		this.groups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
		this.filterItems(this.searchInput.getValue());
		// Сбросить курсор, если вышел за границы
		if (this.selectedIndex >= this.filteredItems.length) {
			this.selectedIndex = Math.max(0, this.filteredItems.length - 1);
		}
	}

	// Component interface

	invalidate(): void {
		// Нет кеша — no-op
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const t = this.theme;

		// Заголовок
		const title = t.bold("Tool Groups");
		const sep = " · ";
		const hint = "space toggle" + sep + "n new" + sep + "d del" + sep + "esc close";
		const titleVisible = this.visibleLen(title);
		const hintVisible = hint.length;
		const spacing = Math.max(1, width - titleVisible - hintVisible);
		lines.push(
			truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""),
		);

		// Строка поиска
		lines.push(...this.searchInput.render(width));

		// Разделитель
		lines.push("");

		// Пустой результат
		if (this.filteredItems.length === 0) {
			lines.push(t.fg("muted", "  No groups found. Press n to create one."));
			return lines;
		}

		// Видимый диапазон со scroll
		const startIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(this.maxVisible / 2),
				this.filteredItems.length - this.maxVisible,
			),
		);
		const endIndex = Math.min(
			startIndex + this.maxVisible,
			this.filteredItems.length,
		);

		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			const isSelected = i === this.selectedIndex;
			const cursor = isSelected ? "> " : "  ";

			const checkbox = item.enabled
				? t.fg("success", "[x]")
				: t.fg("dim", "[ ]");

			const count = t.fg("dim", `(${item.toolCount})`);

			let name = item.name;
			if (isSelected) {
				name = t.bold(item.name);
			}

			let line = `${cursor}${checkbox} ${name} ${count}`;

			// Описание — если помещается
			if (item.description) {
				const descPrefix = " — ";
				const usedLen = this.visibleLen(line);
				const remaining = width - usedLen - descPrefix.length;
				if (remaining > 10) {
					const desc =
						item.description.length > remaining
							? item.description.slice(0, remaining - 1) + "…"
							: item.description;
					line += t.fg("dim", `${descPrefix}${desc}`);
				}
			}

			lines.push(truncateToWidth(line, width, "..."));
		}

		// Scroll-индикатор
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const current = this.selectedIndex + 1;
			const total = this.filteredItems.length;
			lines.push(t.dim(`  (${current}/${total})`));
		}

		return lines;
	}

	handleInput(data: string): void {
		const kb = getKeybindings();

		if (kb.matches(data, "tui.select.up")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
			}
			return;
		}

		if (kb.matches(data, "tui.select.down")) {
			if (this.selectedIndex < this.filteredItems.length - 1) {
				this.selectedIndex++;
			}
			return;
		}

		if (kb.matches(data, "tui.select.pageUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisible);
			return;
		}

		if (kb.matches(data, "tui.select.pageDown")) {
			this.selectedIndex = Math.min(
				this.filteredItems.length - 1,
				this.selectedIndex + this.maxVisible,
			);
			return;
		}

		if (
			kb.matches(data, "tui.select.cancel") ||
			matchesKey(data, "ctrl+c")
		) {
			this.onCancel();
			return;
		}

		// Toggle: space или enter
		if (data === " " || kb.matches(data, "tui.select.confirm")) {
			const item = this.filteredItems[this.selectedIndex];
			if (item) {
				const newEnabled = !item.enabled;
				// Обновляем локальное состояние
				item.enabled = newEnabled;
				const source = this.groups.find((g) => g.name === item.name);
				if (source) source.enabled = newEnabled;
				this.onAction({
					type: "toggle",
					name: item.name,
					enabled: newEnabled,
				});
			}
			return;
		}

		// Delete: d
		if (data === "d") {
			const item = this.filteredItems[this.selectedIndex];
			if (item) {
				this.onAction({ type: "delete", name: item.name });
			}
			return;
		}

		// Create: n
		if (data === "n") {
			this.onAction({ type: "create" });
			return;
		}

		// Передаём всё остальное в search input
		this.searchInput.handleInput(data);
		this.filterItems(this.searchInput.getValue());
	}

	// -----------------------------------------------------------------------
	// Приватные методы
	// -----------------------------------------------------------------------

	private filterItems(query: string): void {
		const prevName = this.filteredItems[this.selectedIndex]?.name;

		if (!query.trim()) {
			this.filteredItems = [...this.groups];
		} else {
			this.filteredItems = fuzzyFilter(this.groups, query, (item) => item.name);
		}

		// Восстановить позицию по имени, если элемент ещё в списке
		if (prevName) {
			const idx = this.filteredItems.findIndex((item) => item.name === prevName);
			if (idx >= 0) {
				this.selectedIndex = idx;
				return;
			}
		}
		this.selectedIndex = 0;
	}

	/** Грубая оценка видимой длины (без ANSI-кодов) */
	private visibleLen(text: string): number {
		// eslint-disable-next-line no-control-regex
		return text.replace(/\x1b\[[0-9;]*m/g, "").length;
	}
}
