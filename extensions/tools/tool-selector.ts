/**
 * ToolSelector — TUI-компонент с чекбоксами для управления инструментами.
 *
 * Чекбоксы [x]/[ ], курсор >, fuzzy-поиск, scroll.
 * Реализует интерфейс Component из pi-tui.
 * Locked-инструменты фильтруются до передачи в этот компонент.
 */

import { fuzzyFilter, getKeybindings, Input, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface ToolItem {
	name: string;
	enabled: boolean;
}

export interface ToolSelectorTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
	dim: (text: string) => string;
	muted?: (text: string) => string;
	success?: (text: string) => string;
	accent?: (text: string) => string;
}

export interface ToolSelectorOptions {
	tools: ToolItem[];
	theme: ToolSelectorTheme;
	onToggle: (name: string, enabled: boolean) => void;
	onCancel: () => void;
}

// ---------------------------------------------------------------------------
// ToolSelector
// ---------------------------------------------------------------------------

export class ToolSelector {
	private tools: ToolItem[];
	private theme: ToolSelectorTheme;
	private onToggle: (name: string, enabled: boolean) => void;
	private onCancel: () => void;

	private selectedIndex = 0;
	private filteredItems: ToolItem[] = [];
	private searchInput: Input;
	private maxVisible = 15;

	constructor(options: ToolSelectorOptions) {
		this.tools = [...options.tools].sort((a, b) => a.name.localeCompare(b.name));
		this.theme = options.theme;
		this.onToggle = options.onToggle;
		this.onCancel = options.onCancel;

		this.searchInput = new Input();
		this.filteredItems = [...this.tools];
		this.selectedIndex = 0;
	}

	// Component interface

	invalidate(): void {
		// Нет кеша — no-op
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const t = this.theme;

		// Заголовок
		const title = t.bold("Tool Configuration");
		const sep = " · ";
		const hint = "space toggle" + sep + "esc close";
		const titleVisible = this.visibleLen(title);
		const hintVisible = hint.length;
		const spacing = Math.max(1, width - titleVisible - hintVisible);
		lines.push(truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""));

		// Строка поиска
		lines.push(...this.searchInput.render(width));

		// Пустая строка-разделитель
		lines.push("");

		// Пустой результат
		if (this.filteredItems.length === 0) {
			lines.push(t.fg("muted", "  No tools found"));
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
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			const isSelected = i === this.selectedIndex;
			const cursor = isSelected ? "> " : "  ";

			const checkbox = item.enabled
				? t.fg("success", "[x]")
				: t.fg("dim", "[ ]");

			let name = item.name;
			if (isSelected) {
				name = t.bold(item.name);
			}

			lines.push(truncateToWidth(`${cursor}${checkbox} ${name}`, width, "..."));
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

		if (kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) {
			this.onCancel();
			return;
		}

		if (data === " " || kb.matches(data, "tui.select.confirm")) {
			const item = this.filteredItems[this.selectedIndex];
			if (item) {
				const newEnabled = !item.enabled;
				// Обновляем локальное состояние
				item.enabled = newEnabled;
				// Обновляем в исходном массиве
				const source = this.tools.find((t) => t.name === item.name);
				if (source) source.enabled = newEnabled;
				this.onToggle(item.name, newEnabled);
			}
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
		if (!query.trim()) {
			this.filteredItems = [...this.tools];
		} else {
			this.filteredItems = fuzzyFilter(this.tools, query, (item) => item.name);
		}
		// Сбросить курсор на первый элемент
		this.selectedIndex = 0;
	}

	/** Грубая оценка видимой длины (без ANSI-кодов) */
	private visibleLen(text: string): number {
		// eslint-disable-next-line no-control-regex
		return text.replace(/\x1b\[[0-9;]*m/g, "").length;
	}
}
