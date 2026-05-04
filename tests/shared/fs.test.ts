import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ensureDir, fileExists, tryRead, readJsonFile, atomicWrite } from "../../extensions/shared/fs.js";

async function makeTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "fs-test-"));
}

describe("shared/fs", () => {
	describe("ensureDir", () => {
		it("создаёт вложенные директории", async () => {
			const base = await makeTempDir();
			const nested = join(base, "a", "b", "c");
			await ensureDir(nested);
			expect(await fileExists(nested)).toBe(true);
			await rm(base, { recursive: true, force: true });
		});

		it("не бросает ошибку, если директория уже существует", async () => {
			const base = await makeTempDir();
			await ensureDir(base);
			await ensureDir(base);
			expect(await fileExists(base)).toBe(true);
			await rm(base, { recursive: true, force: true });
		});
	});

	describe("fileExists", () => {
		it("возвращает true для существующего файла", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "test.txt");
			await writeFile(filePath, "hello", "utf8");
			expect(await fileExists(filePath)).toBe(true);
			await rm(base, { recursive: true, force: true });
		});

		it("возвращает false для несуществующего файла", async () => {
			const base = await makeTempDir();
			expect(await fileExists(join(base, "nope.txt"))).toBe(false);
			await rm(base, { recursive: true, force: true });
		});
	});

	describe("tryRead", () => {
		it("читает существующий файл", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "read.txt");
			await writeFile(filePath, "content", "utf8");
			expect(await tryRead(filePath)).toBe("content");
			await rm(base, { recursive: true, force: true });
		});

		it("возвращает undefined для несуществующего файла", async () => {
			const base = await makeTempDir();
			expect(await tryRead(join(base, "nope.txt"))).toBeUndefined();
			await rm(base, { recursive: true, force: true });
		});
	});

	describe("readJsonFile", () => {
		it("парсит валидный JSON", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "data.json");
			await writeFile(filePath, JSON.stringify({ name: "test", value: 42 }), "utf8");
			const result = await readJsonFile<{ name: string; value: number }>(filePath);
			expect(result).toEqual({ name: "test", value: 42 });
			await rm(base, { recursive: true, force: true });
		});

		it("возвращает undefined для невалидного JSON", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "bad.json");
			await writeFile(filePath, "{invalid", "utf8");
			expect(await readJsonFile(filePath)).toBeUndefined();
			await rm(base, { recursive: true, force: true });
		});

		it("возвращает undefined для несуществующего файла", async () => {
			const base = await makeTempDir();
			expect(await readJsonFile(join(base, "nope.json"))).toBeUndefined();
			await rm(base, { recursive: true, force: true });
		});
	});

	describe("atomicWrite", () => {
		it("записывает содержимое в файл", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "output.txt");
			await atomicWrite(filePath, "hello world");
			expect(await readFile(filePath, "utf8")).toBe("hello world");
			await rm(base, { recursive: true, force: true });
		});

		it("атомарно заменяет существующий файл", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "replace.txt");
			await atomicWrite(filePath, "old");
			await atomicWrite(filePath, "new");
			expect(await readFile(filePath, "utf8")).toBe("new");
			await rm(base, { recursive: true, force: true });
		});

		it("создаёт родительскую директорию", async () => {
			const base = await makeTempDir();
			const filePath = join(base, "sub", "dir", "file.txt");
			await atomicWrite(filePath, "nested");
			expect(await readFile(filePath, "utf8")).toBe("nested");
			await rm(base, { recursive: true, force: true });
		});
	});
});
