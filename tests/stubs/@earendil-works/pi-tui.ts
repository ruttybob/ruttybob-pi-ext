/**
 * Stub-модуль для @earendil-works/pi-tui.
 *
 * Предоставляет минимальные экспорты, необходимые для тестирования.
 */

export const Key = {
	escape: "\x1b",
	enter: "\r",
	up: "\x1b[A",
	down: "\x1b[B",
	left: "\x1b[D",
	right: "\x1b[C",
	tab: "\t",
	pageUp: "\x1b[5~",
	pageDown: "\x1b[6~",
	backspace: "\x7f",
	ctrl: (c: string) => String.fromCharCode(c.charCodeAt(0) - 96),
	shift: (c: string) => {
		if (c === "\t" || c === "tab") return "\x1b[Z"; // Shift+Tab
		return c.toUpperCase();
	},
};

export function matchesKey(data: string, key: string): boolean {
	if (data === key) return true;
	// Ctrl+<letter> → контрольный символ
	const ctrlMatch = key.match(/^ctrl\+([a-z])$/i);
	if (ctrlMatch) {
		const ctrlChar = String.fromCharCode(ctrlMatch[1].toLowerCase().charCodeAt(0) - 96);
		if (data === ctrlChar) return true;
	}
	return false;
}

export function visibleWidth(s: string): number {
	return [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

export function truncateToWidth(s: string, w: number, ellipsis?: string, pad?: boolean): string {
	// Strip ANSI codes to measure visible width
	const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
	const chars = [...stripped];
	if (chars.length > w) {
		const marker = ellipsis ?? "…";
		const markerLen = [...marker].length;
		if (markerLen > 0 && w > markerLen) {
			const truncated = chars.slice(0, w - markerLen).join("") + marker;
			return truncated;
		}
		return chars.slice(0, w).join("");
	}
	// When ellipsis is explicitly set (including empty string) AND pad is true, pad to width
	if (ellipsis !== undefined) {
		if (pad) return stripped.padEnd(w);
		return stripped;
	}
	// Legacy behaviour: pad to width
	return stripped.padEnd(w);
}

export function wrapTextWithAnsi(s: string, w: number): string[] {
	const lines: string[] = [];
	for (const rawLine of s.split("\n")) {
		const stripped = rawLine.replace(/\x1b\[[0-9;]*m/g, "");
		const chars = [...stripped];
		if (chars.length <= w) {
			lines.push(rawLine);
		} else {
			// Simple wrapping: split by character width
			let idx = 0;
			while (idx < chars.length) {
				lines.push(chars.slice(idx, idx + w).join(""));
				idx += w;
			}
		}
	}
	return lines;
}

export class Markdown {
	constructor(_text?: any, _indent?: number, _width?: number, _theme?: any) {}
	render(): string { return ""; }
}
export class Container {
	children: any[] = [];
	addChild(c: any) { this.children.push(c); }
	removeChild(c: any) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); }
	clear() { this.children = []; }
	invalidate() { for (const c of this.children) c.invalidate?.(); }
	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) {
			const childLines = child.render(width);
			for (const line of childLines) lines.push(line);
		}
		return lines;
	}
}
export class Text {
	private text: string;
	constructor(text?: any, ..._children: any[]) {
		this.text = typeof text === "string" ? text : "";
	}
	setText(t: string) { this.text = t; }
	invalidate() {}
	render(_width?: number): string[] {
		return this.text ? this.text.split("\n") : [""];
	}
}
export class Spacer {
	constructor(private _h?: number) {}
	invalidate() {}
	render(_width?: number): string[] {
		return [];
	}
}
export class Box {
	children: any[] = [];
	constructor(_props?: any, ..._children: any[]) {}
	addChild(child: any): void {
		this.children.push(child);
	}
	render(): string { return ""; }
}
export class Component {
	id?: string;
	render(_width?: number): string[] { return []; }
}
export class TUI {
	render(): string { return ""; }
	requestRender(): void {}
}

// --- Для pi-auto-rename ---

export type EditorTheme = {
	fg(color: string, text: string): string;
	bold(text: string): string;
	[key: string]: unknown;
};

export interface SelectItem {
	value: string;
	label: string;
	description?: string;
}
export interface AutocompleteItem {
	value: string;
	label: string;
	description?: string;
}
export class Input {
	private value = "";
	focused = false;
	getValue(): string { return this.value; }
	setValue(v: string) { this.value = v; }
	handleInput(data: string): void {
		if (data === "\x7f" || data === "\b") {
			// Backspace
			this.value = this.value.slice(0, -1);
		} else if (data === "\r" || data === "\n") {
			// Enter — no-op for Input (submit handled by key-router)
		} else if (data.startsWith("\x1b")) {
			// Escape sequence — ignore
		} else if (data === "\t") {
			// Tab — ignore
		} else {
			// Printable character(s)
			this.value += data;
		}
	}
	invalidate() {}
	render(_width?: number): string[] {
		return [this.value || ""];
	}
}
export class SelectList {
	onSelect?: (item: SelectItem) => void;
	onCancel?: () => void;
	onSelectionChange?: (item: SelectItem) => void;
	private items: SelectItem[];
	private selectedIndex = 0;
	private theme: any;
	constructor(items: SelectItem[], _maxVisible?: number, theme?: any) {
		this.items = items;
		this.theme = theme;
	}
	setFilter(_filter: string): void {}
	setSelectedIndex(idx: number): void { this.selectedIndex = idx; }
	getSelectedItem(): SelectItem | undefined {
		return this.items[this.selectedIndex];
	}
	invalidate() {}
	handleInput(data: string): void {
		if (data === '\x1b[A' || data === '\x1b[D') {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (data === '\x1b[B' || data === '\x1b[C') {
			this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
		}
		this.notifySelectionChange();
	}
	private notifySelectionChange() {
		const item = this.getSelectedItem();
		if (item) this.onSelectionChange?.(item);
	}
	render(width?: number): string[] {
		const w = width ?? 40;
		return this.items.map((item, i) => {
			const prefix = i === this.selectedIndex ? '→ ' : '  ';
			let line = prefix + item.label;
			if (i === this.selectedIndex && this.theme?.selectedText) {
				line = this.theme.selectedText(line);
			} else if (i !== this.selectedIndex && this.theme?.description) {
				// non-selected items rendered as-is
			}
			return line;
		});
	}
}
const KEYBINDING_MAP: Record<string, string[]> = {
	"tui.select.confirm": ["\r"],
	"tui.select.cancel": ["\x1b", "\x03"],
	"tui.select.up": ["\x1b[A"],
	"tui.select.down": ["\x1b[B"],
	"tui.select.pageUp": ["\x1b[5~"],
	"tui.select.pageDown": ["\x1b[6~"],
	"tui.input.submit": ["\r"],
	"tui.editor.deleteCharBackward": ["\x7f"],
};

export function getKeybindings() {
	return {
		matches(data: string, action: string): boolean {
			const keys = KEYBINDING_MAP[action];
			return keys ? keys.includes(data) : false;
		},
	};
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
	if (!query.trim()) return items;
	const q = query.toLowerCase();
	return items.filter((item) => {
		const text = getText(item).toLowerCase();
		// Простой substring-матч (без полноценного fuzzy)
		return text.includes(q);
	});
}

export interface SelectListTheme {
	selectedPrefix: (text: string) => string;
	selectedText: (text: string) => string;
	description: (text: string) => string;
	scrollInfo: (text: string) => string;
	noMatch: (text: string) => string;
}

export interface SettingItem {
	id: string;
	label: string;
	description?: string;
	currentValue: string;
	values?: string[];
	submenu?: (currentValue: string, done: (selectedValue?: string) => void) => any;
}

export interface SettingsListTheme {
	label: (text: string, selected: boolean) => string;
	value: (text: string, selected: boolean) => string;
	description: (text: string) => string;
	cursor: string;
	hint: (text: string) => string;
}

export class Editor {
	private text = "";
	disableSubmit = false;
	onChange?: () => void;
	constructor(_tui: any, _theme?: any) {}
	getText(): string { return this.text; }
	setText(t: string) { this.text = t; }
	handleInput(_data: string): void {}
	render(_width?: number): string[] {
		return ["┌" + "─".repeat(Math.max(0, (_width ?? 20) - 2)) + "┐", this.text, "└" + "─".repeat(Math.max(0, (_width ?? 20) - 2)) + "┘"];
	}
	invalidate() {}
}

export class SettingsList {
	onChange: (id: string, newValue: string) => void;
	onCancel: () => void;
	constructor(
		_items: SettingItem[],
		_maxVisible: number,
		_theme: SettingsListTheme,
		onChange: (id: string, newValue: string) => void,
		onCancel: () => void,
	) {
		this.onChange = onChange;
		this.onCancel = onCancel;
	}
	invalidate() {}
	render(): string[] { return []; }
	handleInput(_data: string): void {}
}
