// tests/evolver/markdown.test.ts

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
	appendSectionToFile,
	removeSectionFromFile,
} from "../../extensions/evolver/markdown.js";

async function makeTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "evolver-md-test-"));
}

describe("evolver/markdown", () => {
	let tmpDir: string;
	let filePath: string;

	beforeEach(async () => {
		tmpDir = await makeTempDir();
		filePath = join(tmpDir, "AGENTS.md");
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	describe("appendSectionToFile", () => {
		it("создаёт файл и добавляет секцию", async () => {
			const ok = await appendSectionToFile(filePath, "<!-- marker -->", "<!-- marker -->\n## Test\nContent");
			expect(ok).toBe(true);

			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("## Test");
		});

		it("добавляет секцию в существующий файл", async () => {
			await writeFile(filePath, "# Existing\n\nSome text\n", "utf-8");

			const ok = await appendSectionToFile(filePath, "<!-- marker -->", "<!-- marker -->\n## New Section");
			expect(ok).toBe(true);

			const content = await readFile(filePath, "utf-8");
			expect(content).toContain("# Existing");
			expect(content).toContain("## New Section");
		});

		it("не добавляет дубли по маркеру", async () => {
			await writeFile(filePath, "<!-- marker -->\n## Existing\n", "utf-8");

			const ok = await appendSectionToFile(filePath, "<!-- marker -->", "<!-- marker -->\n## Duplicate");
			expect(ok).toBe(false);
		});
	});

	describe("removeSectionFromFile", () => {
		it("удаляет секцию по маркеру", async () => {
			await writeFile(
				filePath,
				"# Root\n\n<!-- marker -->\n## To Remove\nBad content\n\n## Keep\nGood\n",
				"utf-8",
			);

			const ok = await removeSectionFromFile(filePath, "<!-- marker -->");
			expect(ok).toBe(true);

			const content = await readFile(filePath, "utf-8");
			expect(content).not.toContain("To Remove");
			expect(content).toContain("## Keep");
		});

		it("возвращает false если маркер не найден", async () => {
			await writeFile(filePath, "# No marker here\n", "utf-8");
			expect(await removeSectionFromFile(filePath, "<!-- marker -->")).toBe(false);
		});

		it("возвращает false если файл не существует", async () => {
			expect(await removeSectionFromFile(join(tmpDir, "nope.md"), "<!-- marker -->")).toBe(false);
		});
	});
});
