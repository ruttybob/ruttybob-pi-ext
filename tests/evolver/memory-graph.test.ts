// tests/evolver/memory-graph.test.ts
// Baseline-тесты для memory-graph.ts перед рефакторингом evolver.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
	getEvolutionDir,
	getMemoryGraphPath,
	readLastNEntries,
	appendEntry,
	formatMemoryDigest,
	type EvolutionEntry,
} from "../../extensions/evolver/memory-graph.js";

async function makeTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "evolver-mg-test-"));
}

const sampleEntry: EvolutionEntry = {
	timestamp: "2026-05-04T12:00:00.000Z",
	gene_id: "ad_hoc",
	signals: ["log_error", "test_failure"],
	outcome: { status: "failed", score: 0.3, note: "Tests broke" },
	source: "test",
};

describe("memory-graph", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await makeTempDir();
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	describe("getEvolutionDir", () => {
		it("возвращает cwd/memory/evolution если нет .git", () => {
			const result = getEvolutionDir(tmpDir);
			expect(result).toBe(join(tmpDir, "memory", "evolution"));
		});
	});

	describe("getMemoryGraphPath", () => {
		it("возвращает путь к memory_graph.jsonl", () => {
			const result = getMemoryGraphPath(tmpDir);
			expect(result).toMatch(/memory[\\/]evolution[\\/]memory_graph\.jsonl$/);
		});
	});

	describe("appendEntry + readLastNEntries", () => {
		it("создаёт JSONL-файл и записывает одну запись", () => {
			const ok = appendEntry(tmpDir, sampleEntry);
			expect(ok).toBe(true);

			const entries = readLastNEntries(tmpDir, 5);
			expect(entries).toHaveLength(1);
			expect(entries[0].gene_id).toBe("ad_hoc");
			expect(entries[0].signals).toEqual(["log_error", "test_failure"]);
		});

		it("добавляет несколько записей", () => {
			appendEntry(tmpDir, { ...sampleEntry, timestamp: "2026-05-04T10:00:00.000Z" });
			appendEntry(tmpDir, { ...sampleEntry, timestamp: "2026-05-04T11:00:00.000Z" });

			const entries = readLastNEntries(tmpDir, 10);
			expect(entries).toHaveLength(2);
		});

		it("readLastNEntries возвращает последние N записей", () => {
			for (let i = 0; i < 5; i++) {
				appendEntry(tmpDir, {
					...sampleEntry,
					timestamp: `2026-05-04T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
					outcome: { status: "success", score: 0.8, note: `entry-${i}` },
				});
			}

			const entries = readLastNEntries(tmpDir, 3);
			expect(entries).toHaveLength(3);
			expect(entries[2].outcome.note).toBe("entry-4");
		});

		it("возвращает пустой массив если файла нет", () => {
			const entries = readLastNEntries(tmpDir, 5);
			expect(entries).toEqual([]);
		});

		it("пропускает невалидные JSON-строки", async () => {
			appendEntry(tmpDir, sampleEntry);

			// Добавляем мусорную строку вручную
			const filePath = getMemoryGraphPath(tmpDir);
			await writeFile(filePath, "\nnot-json", { flag: "a" });

			const entries = readLastNEntries(tmpDir, 10);
			expect(entries).toHaveLength(1);
		});
	});

	describe("formatMemoryDigest", () => {
		it("возвращает null если записей нет", () => {
			expect(formatMemoryDigest(tmpDir, 5)).toBeNull();
		});

		it("формирует сводку с успехами и неудачами", () => {
			appendEntry(tmpDir, {
				...sampleEntry,
				outcome: { status: "success", score: 0.8, note: "All good" },
			});
			appendEntry(tmpDir, {
				...sampleEntry,
				outcome: { status: "failed", score: 0.2, note: "Broke" },
			});

			const digest = formatMemoryDigest(tmpDir, 5);
			expect(digest).not.toBeNull();
			expect(digest!).toContain("[Evolution Memory]");
			expect(digest!).toContain("1 success");
			expect(digest!).toContain("1 failed");
			expect(digest!).toContain("score=0.8");
			expect(digest!).toContain("score=0.2");
		});
	});
});
