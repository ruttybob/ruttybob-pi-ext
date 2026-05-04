import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	sanitize,
	ensureDir,
	tryDelete,
	tryRead,
	tryRemoveDir,
	getPath,
	buildProgressTemplate,
	buildReflectionTemplate,
	RALPH_DIR,
} from "../../extensions/pi-ralph-wiggum/files.js";
import { createTempRalphDir, writeRalphFile } from "./helpers.js";

describe("files — sanitize", () => {
	it("заменяет спецсимволы на underscore", () => {
		expect(sanitize("my feature/v2")).toBe("my_feature_v2");
	});

	it("схлопывает несколько underscore подряд", () => {
		expect(sanitize("a   b")).toBe("a_b");
	});

	it("оставляет латиницу, цифры, дефис и underscore как есть", () => {
		expect(sanitize("my-feature_v2")).toBe("my-feature_v2");
	});
});

describe("files — ensureDir", () => {
	let tmp: ReturnType<typeof createTempRalphDir>;

	beforeEach(() => {
		tmp = createTempRalphDir();
	});

	afterEach(() => tmp.cleanup());

	it("создаёт промежуточные директории", async () => {
		const filePath = path.join(tmp.cwd, "a", "b", "c", "file.txt");
		await ensureDir(path.dirname(filePath));
		expect(fs.existsSync(path.dirname(filePath))).toBe(true);
	});
});

describe("files — tryDelete", () => {
	let tmp: ReturnType<typeof createTempRalphDir>;

	beforeEach(() => {
		tmp = createTempRalphDir();
	});

	afterEach(() => tmp.cleanup());

	it("удаляет файл если существует", () => {
		const filePath = writeRalphFile(tmp.ralphDir, "test.txt", "hello");
		tryDelete(filePath);
		expect(fs.existsSync(filePath)).toBe(false);
	});

	it("не падает если файла нет", () => {
		expect(() =>
			tryDelete(path.join(tmp.cwd, "nope.txt")),
		).not.toThrow();
	});
});

describe("files — tryRead", () => {
	let tmp: ReturnType<typeof createTempRalphDir>;

	beforeEach(() => {
		tmp = createTempRalphDir();
	});

	afterEach(() => tmp.cleanup());

	it("читает содержимое файла", async () => {
		const filePath = writeRalphFile(tmp.ralphDir, "test.txt", "hello");
		expect(await tryRead(filePath)).toBe("hello");
	});

	it("возвращает undefined если файла нет", async () => {
		expect(await tryRead(path.join(tmp.cwd, "nope.txt"))).toBeUndefined();
	});
});

describe("files — tryRemoveDir", () => {
	let tmp: ReturnType<typeof createTempRalphDir>;

	beforeEach(() => {
		tmp = createTempRalphDir();
	});

	afterEach(() => tmp.cleanup());

	it("удаляет директорию рекурсивно", () => {
		const subDir = path.join(tmp.cwd, "sub");
		fs.mkdirSync(subDir, { recursive: true });
		writeRalphFile(subDir, "file.txt", "data");
		expect(tryRemoveDir(subDir)).toBe(true);
		expect(fs.existsSync(subDir)).toBe(false);
	});

	it("возвращает true если директории нет", () => {
		expect(tryRemoveDir(path.join(tmp.cwd, "nope"))).toBe(true);
	});
});

describe("files — getPath", () => {
	let tmp: ReturnType<typeof createTempRalphDir>;

	beforeEach(() => {
		tmp = createTempRalphDir();
	});

	afterEach(() => tmp.cleanup());

	it("возвращает путь в .ralph/<name>/ для неархивного файла", () => {
		const result = getPath(tmp.cwd, "my-loop", ".md");
		expect(result).toBe(
			path.join(tmp.cwd, RALPH_DIR, "my-loop", "task.md"),
		);
	});

	it("возвращает путь в .ralph/archive/<name>/ для архивного файла", () => {
		const result = getPath(tmp.cwd, "my-loop", ".md", true);
		expect(result).toBe(
			path.join(tmp.cwd, RALPH_DIR, "archive", "my-loop", "task.md"),
		);
	});

	it("санитизирует имя", () => {
		const result = getPath(tmp.cwd, "my loop/v2", ".md");
		expect(result).toBe(
			path.join(tmp.cwd, RALPH_DIR, "my_loop_v2", "task.md"),
		);
	});
});

describe("files — buildProgressTemplate", () => {
	it("генерирует markdown-шаблон прогресса", () => {
		const result = buildProgressTemplate("refactor-auth");
		expect(result).toContain("# Progress: refactor-auth");
		expect(result).toContain("## Completed");
		expect(result).toContain("## Current Focus");
		expect(result).toContain("## Blockers");
	});
});

describe("files — buildReflectionTemplate", () => {
	it("генерирует markdown-шаблон рефлексии", () => {
		const result = buildReflectionTemplate("refactor-auth");
		expect(result).toContain("# Reflection Log: refactor-auth");
	});
});
