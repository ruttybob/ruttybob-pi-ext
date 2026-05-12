/**
 * Тесты для lib/prompt.ts — loadPromptTemplate, renderPromptTemplate, getProjectName
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем fs
const mockFiles: Record<string, string> = {};
vi.mock("node:fs", () => ({
	existsSync: (path: string) => path in mockFiles,
	readFileSync: (path: string) => {
		if (path in mockFiles) return mockFiles[path];
		throw new Error(`File not found: ${path}`);
	},
}));

import { loadPromptTemplate, renderPromptTemplate, getProjectName } from "./prompt.js";

beforeEach(() => {
	for (const key of Object.keys(mockFiles)) delete mockFiles[key];
});

describe("getProjectName", () => {
	it("возвращает basename", () => {
		expect(getProjectName("/home/user/my-project")).toBe("my-project");
	});

	it("обрабатывает корневой путь", () => {
		expect(getProjectName("/")).toBe("");
	});
});

describe("renderPromptTemplate", () => {
	it("подставляет {{focus}}", () => {
		expect(renderPromptTemplate("Фокус: {{focus}}", { focus: "безопасность" })).toBe(
			"Фокус: безопасность",
		);
	});

	it("подставляет {{project}}", () => {
		expect(renderPromptTemplate("Проект: {{project}}", { project: "my-app" })).toBe(
			"Проект: my-app",
		);
	});

	it("подставляет обе переменные", () => {
		expect(
			renderPromptTemplate("{{project}} — {{focus}}", {
				project: "my-app",
				focus: "проверить API",
			}),
		).toBe("my-app — проверить API");
	});

	it("не трогает неизвестные переменные", () => {
		expect(renderPromptTemplate("{{unknown}} text", {})).toBe("{{unknown}} text");
	});

	it("убирает {{focus}} при пустом значении", () => {
		expect(renderPromptTemplate("{{focus}}", { focus: "" })).toBe("");
	});
});

describe("loadPromptTemplate", () => {
	it("возвращает null при отсутствии файлов", () => {
		expect(loadPromptTemplate("/tmp/nonexistent", {})).toBeNull();
	});

	it("читает .pi/prompts/review.md", () => {
		mockFiles["/tmp/project/.pi/prompts/review.md"] = "Проверь код {{project}}";
		expect(loadPromptTemplate("/tmp/project", {})).toBe("Проверь код {{project}}");
	});

	it("читает promptFile из конфига", () => {
		mockFiles["/tmp/project/custom-prompt.md"] = "Custom prompt";
		expect(
			loadPromptTemplate("/tmp/project", { promptFile: "custom-prompt.md" }),
		).toBe("Custom prompt");
	});

	it("приоритет .pi/prompts/review.md над promptFile", () => {
		mockFiles["/tmp/project/.pi/prompts/review.md"] = "Проектный промпт";
		mockFiles["/tmp/project/custom-prompt.md"] = "Кастомный промпт";
		expect(
			loadPromptTemplate("/tmp/project", { promptFile: "custom-prompt.md" }),
		).toBe("Проектный промпт");
	});

	it("читает inline instruction", () => {
		expect(
			loadPromptTemplate("/tmp/nonexistent", { instruction: "Inline промпт" }),
		).toBe("Inline промпт");
	});

	it("приоритет promptFile над instruction", () => {
		mockFiles["/tmp/project/custom.md"] = "Из файла";
		expect(
			loadPromptTemplate("/tmp/project", {
				promptFile: "custom.md",
				instruction: "Inline",
			}),
		).toBe("Из файла");
	});
});
