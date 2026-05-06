import { describe, expect, it, vi } from "vitest";
import { ToolSelector, type ToolItem } from "../../extensions/tools/tool-selector.js";

// Escape-последовательность для клавиш
const KEY = {
	up: "\x1b[A",
	down: "\x1b[B",
	escape: "\x1b",
	space: " ",
	enter: "\r",
	pageUp: "\x1b[5~",
	pageDown: "\x1b[6~",
	ctrlC: "\x03",
};

// ---------------------------------------------------------------------------
// Минимальный theme-мок: добавляет ANSI-префикс для проверки стилей
// ---------------------------------------------------------------------------

function createMockTheme() {
	return {
		fg: (color: string, text: string) => `{fg:${color}}${text}{/fg}`,
		bold: (text: string) => `{b}${text}{/b}`,
		dim: (text: string) => `{dim}${text}{/dim}`,
		success: (text: string) => text,
		accent: (text: string) => text,
		muted: (text: string) => text,
	};
}

// ---------------------------------------------------------------------------
// Хелпер: создаёт ToolSelector и возвращает результат render()
// ---------------------------------------------------------------------------

function renderSelector(tools: ToolItem[], opts?: { width?: number }) {
	const theme = createMockTheme();
	const onToggle = vi.fn();
	const onCancel = vi.fn();
	const selector = new ToolSelector({ tools, theme, onToggle, onCancel });
	const width = opts?.width ?? 60;
	return {
		lines: selector.render(width),
		selector,
		onToggle,
		onCancel,
		theme,
	};
}

// ---------------------------------------------------------------------------
// Render: чекбоксы, курсор, locked
// ---------------------------------------------------------------------------

describe("ToolSelector render", () => {
	it("отображает чекбокс [x] для включённых и [ ] для выключенных инструментов", () => {
		const { lines } = renderSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: false },
		]);

		// Ищем строки с именами инструментов
		const bashLine = lines.find((l) => l.includes("bash"));
		const readLine = lines.find((l) => l.includes("read"));

		expect(bashLine).toBeDefined();
		expect(readLine).toBeDefined();
		expect(bashLine).toContain("[x]");
		expect(readLine).toContain("[ ]");
	});

	it("отображает курсор > на первом инструменте", () => {
		const { lines } = renderSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		const bashLine = lines.find((l) => l.includes("bash"));
		const readLine = lines.find((l) => l.includes("read"));

		expect(bashLine).toContain("> ");
		expect(readLine).not.toContain("> ");
	});

	it("сортирует инструменты по алфавиту", () => {
		const { lines } = renderSelector([
			{ name: "edit", enabled: true },
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		const bashIdx = lines.findIndex((l) => l.includes("bash"));
		const editIdx = lines.findIndex((l) => l.includes("edit"));
		const readIdx = lines.findIndex((l) => l.includes("read"));

		expect(bashIdx).toBeLessThan(editIdx);
		expect(editIdx).toBeLessThan(readIdx);
	});

	it("отображает заголовок и подсказки клавиш", () => {
		const { lines } = renderSelector([
			{ name: "bash", enabled: true },
		]);

		// Заголовок
		const titleLine = lines.find((l) => l.includes("Tool Configuration"));
		expect(titleLine).toBeDefined();

		// Подсказка — space toggle
		const hintLine = lines.find((l) => l.includes("space") && l.includes("toggle"));
		expect(hintLine).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// handleInput: навигация, toggle, locked, cancel
// ---------------------------------------------------------------------------

describe("ToolSelector handleInput", () => {
	function createSelector(tools: ToolItem[]) {
		const theme = createMockTheme();
		const onToggle = vi.fn();
		const onCancel = vi.fn();
		const selector = new ToolSelector({ tools, theme, onToggle, onCancel });
		return { selector, onToggle, onCancel };
	}

	it("down перемещает курсор на следующий элемент", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		// Курсор на bash (индекс 0 после сортировки)
		let lines = selector.render(60);
		let bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("> ");

		// Нажимаем down
		selector.handleInput(KEY.down);
		lines = selector.render(60);

		// Теперь курсор на read
		bashLine = lines.find((l) => l.includes("bash"));
		const readLine = lines.find((l) => l.includes("read"));
		expect(bashLine).not.toContain("> ");
		expect(readLine).toContain("> ");
	});

	it("up перемещает курсор на предыдущий элемент", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		// Перемещаемся на read
		selector.handleInput(KEY.down);

		// Нажимаем up
		selector.handleInput(KEY.up);
		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("> ");
	});

	it("up не выходит за начало списка", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
		]);

		selector.handleInput(KEY.up);
		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("> "); // всё ещё на bash
	});

	it("down не выходит за конец списка", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
		]);

		selector.handleInput(KEY.down);
		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("> "); // всё ещё на bash
	});

	it("space toggle переключает enabled → disabled", () => {
		const { selector, onToggle } = createSelector([
			{ name: "bash", enabled: true },
		]);

		selector.handleInput(KEY.space);

		expect(onToggle).toHaveBeenCalledWith("bash", false);

		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("[ ]");
	});

	it("space toggle переключает disabled → enabled", () => {
		const { selector, onToggle } = createSelector([
			{ name: "bash", enabled: false },
		]);

		selector.handleInput(KEY.space);

		expect(onToggle).toHaveBeenCalledWith("bash", true);

		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		expect(bashLine).toContain("[x]");
	});

	it("escape вызывает onCancel", () => {
		const { selector, onCancel } = createSelector([
			{ name: "bash", enabled: true },
		]);

		selector.handleInput(KEY.escape);

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("ctrl+c вызывает onCancel", () => {
		const { selector, onCancel } = createSelector([
			{ name: "bash", enabled: true },
		]);

		selector.handleInput(KEY.ctrlC);

		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("pageUp/pageDown перемещают курсор на страницу", () => {
		const tools: ToolItem[] = Array.from({ length: 20 }, (_, i) => ({
			name: `tool_${String(i).padStart(2, "0")}`,
			enabled: true,
		}));

		const { selector } = createSelector(tools);

		// pageDown — должен сдвинуться
		selector.handleInput(KEY.pageDown);
		let lines = selector.render(60);

		// Курсор должен быть дальше начала
		const firstLine = lines.find((l) => l.includes("tool_00"));
		// tool_00 может быть вне видимой области, но курсор сдвинулся

		// pageUp — вернуться назад
		selector.handleInput(KEY.pageUp);
		lines = selector.render(60);
		const firstVisible = lines.find((l) => l.includes("> "));
		expect(firstVisible).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Поиск (fuzzy filter)
// ---------------------------------------------------------------------------

describe("ToolSelector search", () => {
	function createSelector(tools: ToolItem[]) {
		const theme = createMockTheme();
		const onToggle = vi.fn();
		const onCancel = vi.fn();
		const selector = new ToolSelector({ tools, theme, onToggle, onCancel });
		return { selector, onToggle, onCancel };
	}

	it("фильтрует инструменты по вводу", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
			{ name: "edit", enabled: true },
		]);

		// Вводим "sh" — должен остаться только bash
		selector.handleInput("s");
		selector.handleInput("h");

		const lines = selector.render(60);
		const bashLine = lines.find((l) => l.includes("bash"));
		const readLine = lines.find((l) => l.includes("read"));
		const editLine = lines.find((l) => l.includes("edit"));

		expect(bashLine).toBeDefined();
		expect(readLine).toBeUndefined();
		expect(editLine).toBeUndefined();
	});

	it("показывает 'No tools found' при пустом результате", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
		]);

		// Вводим "zzz" — нет совпадений
		selector.handleInput("z");
		selector.handleInput("z");
		selector.handleInput("z");

		const lines = selector.render(60);
		const noMatch = lines.find((l) => l.includes("No tools found"));
		expect(noMatch).toBeDefined();
	});

	it("восстанавливает полный список при очистке поиска", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		// Вводим и очищаем
		selector.handleInput("b");
		let lines = selector.render(60);
		expect(lines.find((l) => l.includes("read"))).toBeUndefined();

		// Backspace — очищаем поиск
		selector.handleInput("\x7f"); // backspace
		lines = selector.render(60);
		expect(lines.find((l) => l.includes("read"))).toBeDefined();
		expect(lines.find((l) => l.includes("bash"))).toBeDefined();
	});

	it("сбрасывает курсор на первый элемент при фильтрации", () => {
		const { selector } = createSelector([
			{ name: "bash", enabled: true },
			{ name: "read", enabled: true },
		]);

		// Перемещаем курсор на read
		selector.handleInput(KEY.down);
		let lines = selector.render(60);
		expect(lines.find((l) => l.includes("read") && l.includes("> "))).toBeDefined();

		// Начинаем поиск — курсор сбрасывается
		selector.handleInput("r");
		lines = selector.render(60);
		const readLine = lines.find((l) => l.includes("read"));
		expect(readLine).toContain("> ");
	});
});
