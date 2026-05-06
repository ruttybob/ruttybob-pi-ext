import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	loadGroups,
	saveGroups,
	resolveGroupTools,
	isGroupEnabled,
	findGroup,
	type ToolGroup,
} from "../../extensions/tools/groups.js";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `tools-groups-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function writeProjectGroups(groups: ToolGroup[]) {
	const dir = join(tmpDir, ".pi");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "toolgroups.json"),
		`${JSON.stringify(groups, null, 2)}\n`,
		"utf-8",
	);
}

// ---------------------------------------------------------------------------
// resolveGroupTools
// ---------------------------------------------------------------------------

describe("resolveGroupTools", () => {
	it("матчит инструменты по glob-паттерну", () => {
		const group: ToolGroup = { name: "zai", pattern: "zai_*" };
		const tools = [
			"zai_web_search",
			"zai_vision_analyze",
			"bash",
			"read",
			"zai_zread_search",
		];
		expect(resolveGroupTools(group, tools)).toEqual([
			"zai_web_search",
			"zai_vision_analyze",
			"zai_zread_search",
		]);
	});

	it("возвращает пустой массив, если нет совпадений", () => {
		const group: ToolGroup = { name: "nonexistent", pattern: "nonexistent_*" };
		expect(resolveGroupTools(group, ["bash", "read"])).toEqual([]);
	});

	it("матчит единственный инструмент по точному имени", () => {
		const group: ToolGroup = { name: "bash", pattern: "bash" };
		expect(resolveGroupTools(group, ["bash", "read"])).toEqual(["bash"]);
	});

	it("матчит все инструменты по *", () => {
		const group: ToolGroup = { name: "all", pattern: "*" };
		const tools = ["bash", "read", "edit"];
		expect(resolveGroupTools(group, tools)).toEqual(tools);
	});

	it("матчит по паттерну с ?", () => {
		const group: ToolGroup = { name: "test", pattern: "tool_?" };
		expect(
			resolveGroupTools(group, ["tool_a", "tool_b", "tool_ab", "tool_"]),
		).toEqual(["tool_a", "tool_b"]);
	});
});

// ---------------------------------------------------------------------------
// isGroupEnabled
// ---------------------------------------------------------------------------

describe("isGroupEnabled", () => {
	it("возвращает true, если все инструменты группы активны", () => {
		expect(isGroupEnabled(["a", "b"], ["a", "b", "c"])).toBe(true);
	});

	it("возвращает false, если часть инструментов неактивна", () => {
		expect(isGroupEnabled(["a", "b"], ["a", "c"])).toBe(false);
	});

	it("возвращает false, если ни один инструмент не активен", () => {
		expect(isGroupEnabled(["a", "b"], ["c", "d"])).toBe(false);
	});

	it("возвращает false для пустой группы", () => {
		expect(isGroupEnabled([], ["a", "b"])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// findGroup
// ---------------------------------------------------------------------------

describe("findGroup", () => {
	const groups: ToolGroup[] = [
		{ name: "zai", pattern: "zai_*" },
		{ name: "mesh", pattern: "mesh_*" },
	];

	it("находит группу по имени", () => {
		expect(findGroup(groups, "zai")?.pattern).toBe("zai_*");
	});

	it("возвращает undefined для несуществующей группы", () => {
		expect(findGroup(groups, "nonexistent")).toBeUndefined();
	});

	it("чувствителен к регистру", () => {
		expect(findGroup(groups, "ZAI")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// loadGroups / saveGroups
// ---------------------------------------------------------------------------

describe("loadGroups", () => {
	it("возвращает пустой массив, если конфиг не существует", () => {
		expect(loadGroups(tmpDir)).toEqual([]);
	});

	it("загружает группы из проектного конфига", () => {
		writeProjectGroups([
			{ name: "zai", pattern: "zai_*", description: "ZAI tools" },
			{ name: "mesh", pattern: "mesh_*" },
		]);
		const groups = loadGroups(tmpDir);
		expect(groups).toHaveLength(2);
		expect(groups[0].name).toBe("zai");
		expect(groups[0].description).toBe("ZAI tools");
		expect(groups[1].name).toBe("mesh");
	});

	it("игнорирует битый JSON", () => {
		const dir = join(tmpDir, ".pi");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "toolgroups.json"), "not json", "utf-8");
		expect(loadGroups(tmpDir)).toEqual([]);
	});

	it("игнорирует некорректные записи", () => {
		writeProjectGroups([
			{ name: "zai", pattern: "zai_*" },
			{ bad: "entry" } as any,
			{ name: "no-pattern" } as any,
		]);
		const groups = loadGroups(tmpDir);
		expect(groups).toHaveLength(1);
		expect(groups[0].name).toBe("zai");
	});
});

describe("saveGroups", () => {
	it("сохраняет группы в проектный конфиг", () => {
		const groups: ToolGroup[] = [
			{ name: "zai", pattern: "zai_*", description: "ZAI tools" },
			{ name: "brave", pattern: "brave_*" },
		];
		saveGroups(tmpDir, groups);

		// Загружаем обратно и проверяем
		const loaded = loadGroups(tmpDir);
		expect(loaded).toHaveLength(2);
		expect(loaded[0].name).toBe("zai");
		expect(loaded[0].description).toBe("ZAI tools");
		expect(loaded[1].name).toBe("brave");
	});

	it("создаёт директорию .pi при необходимости", () => {
		const freshDir = join(tmpDir, "nested", "path");
		saveGroups(freshDir, [{ name: "test", pattern: "test_*" }]);
		expect(existsSync(join(freshDir, ".pi", "toolgroups.json"))).toBe(true);
	});

	it("не записывает undefined description", () => {
		saveGroups(tmpDir, [{ name: "test", pattern: "test_*" }]);
		const loaded = loadGroups(tmpDir);
		expect(loaded[0].description).toBeUndefined();
	});
});
