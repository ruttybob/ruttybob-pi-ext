/**
 * Тесты для subagent/config — загрузка и валидация конфигурации.
 *
 * Мокается node:fs. existsSync и readFileSync управляются через vi.fn().
 * Сценарии: дефолты, global-only, project-overlay, невалидные значения.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import { loadSubagentConfig, DEFAULT_CONFIG } from "../../extensions/subagent/config.js";

const mockedExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

/** Путь к global settings */
const globalPath = join(homedir(), ".pi", "agent", "settings.json");
/** Путь к project .pi/ — используем фиктивный cwd */
const projectCwd = "/fake/project";
const projectPiDir = join(projectCwd, ".pi");
const projectPath = join(projectPiDir, "settings.json");

describe("subagent/config > loadSubagentConfig", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// --- Дефолты ---

	it("возвращает дефолтный конфиг при отсутствии файлов", () => {
		mockedExistsSync.mockReturnValue(false);
		const config = loadSubagentConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("возвращает дефолтный конфиг при отсутствии ключа subagent", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(JSON.stringify({ theme: "dark" }));
		const config = loadSubagentConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	// --- Global settings ---

	it("читает parallelEnabled: true из global settings", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(
			JSON.stringify({ subagent: { parallelEnabled: true } }),
		);
		const config = loadSubagentConfig();
		expect(config.parallelEnabled).toBe(true);
		expect(config.maxParallelTasks).toBe(8);
		expect(config.maxConcurrency).toBe(4);
	});

	it("читает все параметры из global settings", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(
			JSON.stringify({
				subagent: { parallelEnabled: true, maxParallelTasks: 16, maxConcurrency: 8 },
			}),
		);
		const config = loadSubagentConfig();
		expect(config).toEqual({ parallelEnabled: true, maxParallelTasks: 16, maxConcurrency: 8 });
	});

	// --- Project overlay ---

	it("project settings перекрывают global", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath || p === projectPiDir || p === projectPath);
		mockedReadFileSync.mockImplementation((p: string) => {
			if (p === globalPath) return JSON.stringify({ subagent: { parallelEnabled: false, maxParallelTasks: 4 } });
			if (p === projectPath) return JSON.stringify({ subagent: { parallelEnabled: true } });
			return "{}";
		});

		const config = loadSubagentConfig(projectCwd);
		// project включил parallel, global maxParallelTasks=4 не перезаписан (project не указал)
		expect(config.parallelEnabled).toBe(true);
		expect(config.maxParallelTasks).toBe(4);
	});

	it("project settings без cwd — не читаются", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(
			JSON.stringify({ subagent: { parallelEnabled: false } }),
		);
		const config = loadSubagentConfig();
		expect(config.parallelEnabled).toBe(false);
	});

	// --- Валидация ---

	it("ограничивает maxParallelTasks до 32", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(JSON.stringify({ subagent: { maxParallelTasks: 100 } }));
		const config = loadSubagentConfig();
		expect(config.maxParallelTasks).toBe(32);
	});

	it("ограничивает maxConcurrency до 32", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(JSON.stringify({ subagent: { maxConcurrency: 50 } }));
		const config = loadSubagentConfig();
		expect(config.maxConcurrency).toBe(32);
	});

	it("игнорирует некорректные значения", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(
			JSON.stringify({
				subagent: { parallelEnabled: "yes", maxParallelTasks: -5, maxConcurrency: "fast" },
			}),
		);
		const config = loadSubagentConfig();
		expect(config.parallelEnabled).toBe(false);
		expect(config.maxParallelTasks).toBe(DEFAULT_CONFIG.maxParallelTasks);
		expect(config.maxConcurrency).toBe(DEFAULT_CONFIG.maxConcurrency);
	});

	it("игнорирует невалидный JSON", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue("not valid json {{{");
		const config = loadSubagentConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("игнорирует null в subagent", () => {
		mockedExistsSync.mockImplementation((p: string) => p === globalPath);
		mockedReadFileSync.mockReturnValue(JSON.stringify({ subagent: null }));
		const config = loadSubagentConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});
});
