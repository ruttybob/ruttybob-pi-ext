import { describe, expect, it } from "vitest";
import {
	getTabs,
	estimateTotalTokens,
	buildModeInjection,
	computeDiffInjections,
	ALL_TABS,
	type ResolvedMode,
	type TokenBreakdown,
} from "../../extensions/look-system-prompt/index.js";

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const ALL_TAB_LABELS = ['System Prompt', 'Injections', 'Mode Preview', 'Codemap', 'Active Tools', 'Tool Schemas'];

// ---------------------------------------------------------------------------
// getTabs()
// ---------------------------------------------------------------------------

describe("getTabs", () => {
	it("все флаги true → все 6 табов", () => {
		const tabs = getTabs(true, true, true);
		expect(tabs).toEqual(ALL_TAB_LABELS);
	});

	it("modesActive=true, compassActive=true, hasInjections=false → без Injections", () => {
		const tabs = getTabs(true, true, false);
		expect(tabs).not.toContain('Injections');
		expect(tabs).toHaveLength(5);
	});

	it("modesActive=true, compassActive=false, hasInjections=true → без Codemap", () => {
		const tabs = getTabs(true, false, true);
		expect(tabs).not.toContain('Codemap');
		expect(tabs).toHaveLength(5);
	});

	it("modesActive=false, compassActive=true, hasInjections=true → без Mode Preview", () => {
		const tabs = getTabs(false, true, true);
		expect(tabs).not.toContain('Mode Preview');
		expect(tabs).toHaveLength(5);
	});

	it("все флаги false → только базовые табы", () => {
		const tabs = getTabs(false, false, false);
		expect(tabs).toEqual(['System Prompt', 'Active Tools', 'Tool Schemas']);
	});

	it("вызов с одним аргументом (по умолчанию compassActive=false, hasInjections=false)", () => {
		const tabs = getTabs(true);
		expect(tabs).not.toContain('Codemap');
		expect(tabs).not.toContain('Injections');
		expect(tabs).toContain('Mode Preview');
	});

	it("порядок табов соответствует ALL_TABS", () => {
		// Проверяем что порядок всегда совпадает с порядком в ALL_TABS
		const combos: [boolean, boolean, boolean][] = [
			[true, true, true],
			[true, false, true],
			[false, true, true],
			[false, false, false],
		];
		for (const [m, c, i] of combos) {
			const tabs = getTabs(m, c, i);
			// Индексы табов в ALL_TABS должны быть строго возрастающими
			const indices = tabs.map(t => ALL_TAB_LABELS.indexOf(t));
			for (let i = 1; i < indices.length; i++) {
				expect(indices[i]).toBeGreaterThan(indices[i - 1]);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// estimateTotalTokens()
// ---------------------------------------------------------------------------

describe("estimateTotalTokens", () => {
	// Минимальный режим без промпта, без mode, без codemap, без инструментов
	it("пустые параметры → минимальный результат (всё 0)", () => {
		const result = estimateTotalTokens(
			undefined,
			{ name: null, activeTools: [] },
			null,
			[],
		);
		expect(result.total).toBe(0);
		expect(result.sys).toBe(0);
		expect(result.mode).toBe(0);
		expect(result.codemap).toBe(0);
		expect(result.tools).toBe(0);
	});

	it("есть system prompt → sys tokens > 0", () => {
		const prompt = "Hello world, this is a system prompt.";
		const result = estimateTotalTokens(
			prompt,
			{ name: null, activeTools: [] },
			null,
			[],
		);
		expect(result.sys).toBeGreaterThan(0);
		expect(result.total).toBe(result.sys);
	});

	it("mode injection уже присутствует в промпте → mode = 0 (не считает дважды)", () => {
		const mode: ResolvedMode = { name: "code", activeTools: ["bash", "read"] };
		// Включаем маркер «Current mode: code» прямо в промпт
		const prompt = "Some base prompt.\nCurrent mode: code\nEnabled tools: bash, read";
		const result = estimateTotalTokens(prompt, mode, null, []);
		expect(result.mode).toBe(0);
	});

	it("mode injection отсутствует в промпте → mode > 0", () => {
		const mode: ResolvedMode = { name: "code", activeTools: ["bash"] };
		const prompt = "Some base prompt.";
		const result = estimateTotalTokens(prompt, mode, null, []);
		expect(result.mode).toBeGreaterThan(0);
	});

	it("codemap section уже в промпте → codemap = 0", () => {
		const prompt = "Base prompt.\n## Codebase Map:\nSome map content here.";
		const codemap = { markdown: "Map content", projectName: "test", stale: false };
		const result = estimateTotalTokens(prompt, { name: null, activeTools: [] }, codemap, []);
		expect(result.codemap).toBe(0);
	});

	it("codemap отсутствует в промпте → codemap > 0", () => {
		const prompt = "Base prompt without codemap.";
		const codemap = { markdown: "Map content that is fairly long", projectName: "test", stale: false };
		const result = estimateTotalTokens(prompt, { name: null, activeTools: [] }, codemap, []);
		expect(result.codemap).toBeGreaterThan(0);
	});

	it("tools с параметрами → tools > 0", () => {
		const tools = [
			{
				name: "bash",
				description: "Execute a bash command",
				parameters: { type: "object", properties: { command: { type: "string" } } },
			},
		];
		const result = estimateTotalTokens("prompt", { name: null, activeTools: [] }, null, tools);
		expect(result.tools).toBeGreaterThan(0);
	});

	it("комбинация всех компонентов → total = sys + mode + codemap + tools", () => {
		const prompt = "Base system prompt content.";
		const mode: ResolvedMode = { name: "code", activeTools: ["bash"] };
		const codemap = { markdown: "# Map\nFile structure here", projectName: "proj", stale: false };
		const tools = [
			{ name: "bash", description: "Run commands", parameters: { type: "object" } },
			{ name: "read", description: "Read files", parameters: { type: "object" } },
		];
		const result = estimateTotalTokens(prompt, mode, codemap, tools);
		expect(result.sys).toBeGreaterThan(0);
		expect(result.mode).toBeGreaterThan(0);
		expect(result.codemap).toBeGreaterThan(0);
		expect(result.tools).toBeGreaterThan(0);
		expect(result.total).toBe(result.sys + result.mode + result.codemap + result.tools);
	});
});

// ---------------------------------------------------------------------------
// buildModeInjection()
// ---------------------------------------------------------------------------

describe("buildModeInjection", () => {
	it("mode.name = null → пустая строка", () => {
		expect(buildModeInjection({ name: null, activeTools: [] })).toBe('');
	});

	it("mode без name (undefined) → пустая строка", () => {
		// ResolvedMode.name может быть только string | null по интерфейсу,
		// но проверяем граничный случай
		expect(buildModeInjection({ name: null as any, activeTools: [] })).toBe('');
	});

	it("mode с name и activeTools → содержит имя и список инструментов", () => {
		const result = buildModeInjection({ name: "code", activeTools: ["bash", "read", "write"] });
		expect(result).toContain("Current mode: code");
		expect(result).toContain("Enabled tools: bash, read, write");
	});

	it("mode с preset instructions → включает instructions", () => {
		const result = buildModeInjection({
			name: "review",
			activeTools: ["bash"],
			preset: { instructions: "Always run tests before committing." },
		});
		expect(result).toContain("Current mode: review");
		expect(result).toContain("Always run tests before committing.");
	});

	it("mode без activeTools → содержит (none)", () => {
		const result = buildModeInjection({ name: "minimal", activeTools: [] });
		expect(result).toContain("Current mode: minimal");
		expect(result).toContain("(none)");
	});

	it("preset instructions из пробелов/пустая — не включается", () => {
		const result = buildModeInjection({
			name: "empty",
			activeTools: ["bash"],
			preset: { instructions: "   " },
		});
		expect(result).toContain("Current mode: empty");
		// После trim() instructions становится пустой — не должна попасть в результат
		expect(result).not.toContain("   ");
	});
});

// ---------------------------------------------------------------------------
// computeDiffInjections()
// ---------------------------------------------------------------------------

describe("computeDiffInjections", () => {
	it("cachedPrompt = undefined → []", () => {
		expect(computeDiffInjections(undefined, "base", new Map())).toEqual([]);
	});

	it("cachedPrompt = пустая строка → []", () => {
		expect(computeDiffInjections("", "base", new Map())).toEqual([]);
	});

	it("cachedPrompt короче basePrompt → []", () => {
		expect(computeDiffInjections("short", "longer base prompt", new Map())).toEqual([]);
	});

	it("cachedPrompt === basePrompt → []", () => {
		const prompt = "same content";
		expect(computeDiffInjections(prompt, prompt, new Map())).toEqual([]);
	});

	it("basePrompt пустой → []", () => {
		expect(computeDiffInjections("cached content", "", new Map())).toEqual([]);
	});

	it("cachedPrompt длиннее, diff покрыт reportedMap → []", () => {
		const base = "base prompt";
		const diffContent = " injected by extension";
		const cached = base + diffContent;
		const reported = new Map([
			["ext1", { source: "ext1", label: "Ext1", charCount: diffContent.length, preview: "..." }],
		]);
		expect(computeDiffInjections(cached, base, reported)).toEqual([]);
	});

	it("cachedPrompt длиннее, diff НЕ покрыт → [{ content, charCount }]", () => {
		const base = "base prompt";
		const diffContent = " some unaccounted injection content";
		const cached = base + diffContent;
		// reported покрывает только 5 символов — недостаточно
		const reported = new Map([
			["ext1", { source: "ext1", label: "Ext1", charCount: 5, preview: "hello" }],
		]);
		const result = computeDiffInjections(cached, base, reported);
		expect(result).toHaveLength(1);
		expect(result[0].charCount).toBe(diffContent.trim().length);
		expect(result[0].content).toBe(diffContent.trim());
	});

	it("cachedPrompt длиннее, reported пустой → один diff injection", () => {
		const base = "hello";
		const diff = " extra content appended";
		const cached = base + diff;
		const result = computeDiffInjections(cached, base, new Map());
		expect(result).toHaveLength(1);
		expect(result[0].content).toBe(diff.trim());
	});

	it("cachedPrompt длиннее, но diff после trim пустой → []", () => {
		const base = "base";
		const cached = base + "   ";  // только пробелы в diff
		expect(computeDiffInjections(cached, base, new Map())).toEqual([]);
	});
});
