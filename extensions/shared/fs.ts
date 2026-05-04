import { dirname } from "node:path";
import { mkdir, stat, readFile, writeFile, rename } from "node:fs/promises";

/**
 * Рекурсивно создаёт директорию, если она не существует.
 */
export async function ensureDir(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true });
}

/**
 * Проверяет существование файла или директории.
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Пытается прочитать файл. Возвращает undefined, если файл не найден или недоступен.
 */
export async function tryRead(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
}

/**
 * Читает и парсит JSON-файл. Возвращает undefined при ошибке чтения или парсинга.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
	try {
		const raw = await readFile(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

/**
 * Атомарная запись: сначала пишет во временный файл, затем переименовывает.
 * Автоматически создаёт родительскую директорию.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
	await ensureDir(dirname(filePath));
	const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(16).slice(2)}`;
	await writeFile(tmp, content, "utf8");
	await rename(tmp, filePath);
}
