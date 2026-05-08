import { describe, expect, it, vi } from "vitest";
import {
	GroupManager,
	type GroupItem,
	type GroupAction,
} from "../../extensions/tools/group-manager.js";

// ---------------------------------------------------------------------------
// Константы клавиш
// ---------------------------------------------------------------------------

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
// Мок theme
// ---------------------------------------------------------------------------

function createMockTheme() {
	return {
		fg: (color: string, text: string) => text,
		bold: (text: string) => text,
		dim: (text: string) => text,
		success: (text: string) => text,
		accent: (text: string) => text,
		muted: (text: string) => text,
		warning: (text: string) => text,
	};
}

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function createManager(groups: GroupItem[]) {
	const theme = createMockTheme();
	const onAction = vi.fn<(action: GroupAction) => void>();
	const onCancel = vi.fn();
	const manager = new GroupManager({ groups, theme, onAction, onCancel });
	return { manager, onAction, onCancel };
}

function renderManager(groups: GroupItem[], opts?: { width?: number }) {
	const { manager, onAction, onCancel } = createManager(groups);
	const width = opts?.width ?? 80;
	return {
		lines: manager.render(width),
		manager,
		onAction,
		onCancel,
	};
}

const sampleGroups: GroupItem[] = [
	{ name: "zai", pattern: "zai_*", description: "ZAI tools", enabled: true, toolCount: 13 },
	{ name: "brave", pattern: "brave_*", description: "Brave search", enabled: false, toolCount: 2 },
	{ name: "mesh", pattern: "mesh_*", enabled: true, toolCount: 5 },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe("GroupManager render", () => {
	it("отображает заголовок и подсказки", () => {
		const { lines } = renderManager(sampleGroups);
		const titleLine = lines.find((l) => l.includes("Tool Groups"));
		expect(titleLine).toBeDefined();
		const hintLine = lines.find((l) => l.includes("space") && l.includes("toggle"));
		expect(hintLine).toBeDefined();
	});

	it("отображает группы с чекбоксами и счётчиками", () => {
		const { lines } = renderManager(sampleGroups);
		// После сортировки: brave, mesh, zai
		const braveLine = lines.find((l) => l.includes("brave"));
		const meshLine = lines.find((l) => l.includes("mesh"));
		const zaiLine = lines.find((l) => l.includes("zai"));

		expect(braveLine).toContain("[ ]"); // disabled
		expect(braveLine).toContain("(2)"); // toolCount
		expect(meshLine).toContain("[x]"); // enabled
		expect(meshLine).toContain("(5)");
		expect(zaiLine).toContain("[x]");
		expect(zaiLine).toContain("(13)");
	});

	it("отображает описание группы", () => {
		const { lines } = renderManager(sampleGroups);
		const zaiLine = lines.find((l) => l.includes("zai"));
		expect(zaiLine).toContain("ZAI tools");
	});

	it("сортирует группы по алфавиту", () => {
		const { lines } = renderManager(sampleGroups);
		const braveIdx = lines.findIndex((l) => l.includes("brave"));
		const meshIdx = lines.findIndex((l) => l.includes("mesh"));
		const zaiIdx = lines.findIndex((l) => l.includes("zai"));
		expect(braveIdx).toBeLessThan(meshIdx);
		expect(meshIdx).toBeLessThan(zaiIdx);
	});

	it("показывает 'No groups found' при пустом списке", () => {
		const { lines } = renderManager([]);
		const emptyLine = lines.find((l) => l.includes("No groups found"));
		expect(emptyLine).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// HandleInput: навигация
// ---------------------------------------------------------------------------

describe("GroupManager navigation", () => {
	it("down перемещает курсор", () => {
		const { manager } = createManager(sampleGroups);
		// brave (первый по алфавиту)
		let lines = manager.render(80);
		expect(lines.find((l) => l.includes("brave") && l.includes("> "))).toBeDefined();

		manager.handleInput(KEY.down);
		lines = manager.render(80);
		expect(lines.find((l) => l.includes("mesh") && l.includes("> "))).toBeDefined();
	});

	it("up перемещает курсор назад", () => {
		const { manager } = createManager(sampleGroups);
		manager.handleInput(KEY.down); // mesh
		manager.handleInput(KEY.up); // brave
		const lines = manager.render(80);
		expect(lines.find((l) => l.includes("brave") && l.includes("> "))).toBeDefined();
	});

	it("escape вызывает onCancel", () => {
		const { manager, onCancel } = createManager(sampleGroups);
		manager.handleInput(KEY.escape);
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("ctrl+c вызывает onCancel", () => {
		const { manager, onCancel } = createManager(sampleGroups);
		manager.handleInput(KEY.ctrlC);
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// HandleInput: toggle
// ---------------------------------------------------------------------------

describe("GroupManager toggle", () => {
	it("space toggle переключает enabled → disabled", () => {
		const { manager, onAction } = createManager(sampleGroups);
		// brave — первый, enabled=false → true
		manager.handleInput(KEY.space);
		expect(onAction).toHaveBeenCalledWith({
			type: "toggle",
			name: "brave",
			enabled: true,
		});
	});

	it("enter toggle тоже переключает", () => {
		const { manager, onAction } = createManager(sampleGroups);
		// brave — первый по алфавиту, enabled=false → toggle
		manager.handleInput(KEY.enter);
		expect(onAction).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "toggle",
				name: "brave",
			}),
		);
	});

	it("toggle на включённой группе выключает её", () => {
		const { manager, onAction } = createManager(sampleGroups);
		// Перейти на mesh (enabled=true)
		manager.handleInput(KEY.down); // mesh
		manager.handleInput(KEY.space);
		expect(onAction).toHaveBeenCalledWith({
			type: "toggle",
			name: "mesh",
			enabled: false,
		});
	});
});

// ---------------------------------------------------------------------------
// HandleInput: delete
// ---------------------------------------------------------------------------

describe("GroupManager delete", () => {
	it("d вызывает delete action", () => {
		const { manager, onAction } = createManager(sampleGroups);
		manager.handleInput("d");
		expect(onAction).toHaveBeenCalledWith({
			type: "delete",
			name: "brave",
		});
	});
});

// ---------------------------------------------------------------------------
// HandleInput: create
// ---------------------------------------------------------------------------

describe("GroupManager create", () => {
	it("n вызывает create action", () => {
		const { manager, onAction } = createManager(sampleGroups);
		manager.handleInput("n");
		expect(onAction).toHaveBeenCalledWith({ type: "create" });
	});
});

// ---------------------------------------------------------------------------
// updateGroups
// ---------------------------------------------------------------------------

describe("GroupManager updateGroups", () => {
	it("обновляет список групп", () => {
		const { manager } = createManager(sampleGroups);
		manager.updateGroups([
			{ name: "new", pattern: "new_*", enabled: true, toolCount: 1 },
		]);
		const lines = manager.render(80);
		expect(lines.find((l) => l.includes("new"))).toBeDefined();
		expect(lines.find((l) => l.includes("brave"))).toBeUndefined();
	});

	it("сохраняет курсор на текущей группе после updateGroups", () => {
		const { manager } = createManager(sampleGroups);
		// После сортировки: brave=0, mesh=1, zai=2
		manager.handleInput(KEY.down); // → mesh
		manager.handleInput(KEY.down); // → zai

		manager.updateGroups([
			{ ...sampleGroups[0] }, // brave
			{ ...sampleGroups[1] }, // mesh
			{ ...sampleGroups[2] }, // zai
		]);

		const lines = manager.render(80);
		// Курсор всё ещё на zai
		expect(lines.find((l) => l.includes("zai") && l.includes("> "))).toBeDefined();
	});

	it("сбрасывает курсор при обновлении, если текущий элемент удалён", () => {
		const { manager } = createManager(sampleGroups);
		manager.handleInput(KEY.down); // mesh
		manager.updateGroups([
			{ name: "zai", pattern: "zai_*", enabled: true, toolCount: 13 },
		]);
		const lines = manager.render(80);
		expect(lines.find((l) => l.includes("zai") && l.includes("> "))).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Fuzzy-поиск
// ---------------------------------------------------------------------------

describe("GroupManager search", () => {
	it("фильтрует группы по вводу", () => {
		const { manager } = createManager(sampleGroups);
		manager.handleInput("z");
		manager.handleInput("a");
		manager.handleInput("i");
		const lines = manager.render(80);
		expect(lines.find((l) => l.includes("zai"))).toBeDefined();
		expect(lines.find((l) => l.includes("brave"))).toBeUndefined();
		expect(lines.find((l) => l.includes("mesh"))).toBeUndefined();
	});

	it("показывает 'No groups found' при отсутствии совпадений", () => {
		const { manager } = createManager(sampleGroups);
		manager.handleInput("x");
		manager.handleInput("y");
		manager.handleInput("z");
		const lines = manager.render(80);
		expect(lines.find((l) => l.includes("No groups found"))).toBeDefined();
	});
});
