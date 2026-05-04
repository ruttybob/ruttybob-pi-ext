/**
 * memory-graph.ts — Модуль работы с memory graph (async).
 *
 * Хранит историю эволюционных попыток в формате JSONL.
 * Позволяет читать последние записи, добавлять новые и формировать
 * краткую сводку для подсказки LLM.
 */

import { mkdir, readFile, writeFile, appendFile, rename, unlink, stat } from "node:fs/promises";
import * as path from "node:path";
import { findGitRoot } from "./runner.js";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Одна запись в журнале эволюций. */
export interface EvolutionEntry {
	timestamp: string;
	gene_id: string;
	signals: string[];
	outcome: { status: string; score: number; note?: string };
	source?: string;
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Возвращает путь к каталогу с данными эволюции.
 */
export function getEvolutionDir(cwd: string): string {
	const gitRoot = findGitRoot(cwd);
	return path.join(gitRoot, "memory", "evolution");
}

/**
 * Возвращает полный путь к файлу журнала memory graph.
 */
export function getMemoryGraphPath(cwd: string): string {
	return path.join(getEvolutionDir(cwd), "memory_graph.jsonl");
}

/**
 * Читает последние N записей из JSONL-файла.
 * Некорректные JSON-строки пропускаются без ошибки.
 */
export async function readLastNEntries(cwd: string, n: number): Promise<EvolutionEntry[]> {
	const filePath = getMemoryGraphPath(cwd);

	let raw: string;
	try {
		raw = await readFile(filePath, "utf-8");
	} catch {
		return [];
	}

	const lines = raw.split("\n").filter((l) => l.trim() !== "");
	const tail = lines.slice(-n);

	const entries: EvolutionEntry[] = [];
	for (const line of tail) {
		try {
			entries.push(JSON.parse(line) as EvolutionEntry);
		} catch {
			// Пропускаем невалидные строки
		}
	}

	return entries;
}

/**
 * Добавляет запись в JSONL-файл.
 * @returns true при успехе, false при ошибке.
 */
export async function appendEntry(cwd: string, entry: EvolutionEntry): Promise<boolean> {
	const dir = getEvolutionDir(cwd);
	const filePath = getMemoryGraphPath(cwd);

	try {
		await mkdir(dir, { recursive: true });
		await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
		return true;
	} catch {
		return false;
	}
}

/**
 * Формирует текстовую сводку по последним эволюциям для подсказки LLM.
 *
 * @param cwd — рабочая директория
 * @param n   — количество последних записей (по умолчанию 5)
 * @returns   — отформатированную строку или null, если записей нет
 */
export async function formatMemoryDigest(
	cwd: string,
	n: number = 5,
): Promise<string | null> {
	const entries = await readLastNEntries(cwd, n);

	if (entries.length === 0) {
		return null;
	}

	let successCount = 0;
	let failCount = 0;

	const lines: string[] = [];

	for (const entry of entries) {
		const status = entry.outcome.status?.toLowerCase() ?? "";
		const score = entry.outcome.score ?? 0;
		const signals = (entry.signals ?? []).join(", ");
		const note = entry.outcome.note ?? "";

		let icon = "?";
		if (status === "success" || status === "ok" || score >= 0.5) {
			icon = "+";
			successCount++;
		} else if (status === "failed" || status === "error" || score < 0.5) {
			icon = "-";
			failCount++;
		}

		const date = entry.timestamp?.slice(0, 10) ?? "unknown";

		const parts = [
			`[${icon}]`,
			date,
			`score=${score}`,
			`signals=[${signals}]`,
			note,
		].join(" ");

		lines.push(parts.length > 200 ? parts.slice(0, 200) : parts);
	}

	const header = `[Evolution Memory] Recent ${entries.length} outcomes (${successCount} success, ${failCount} failed):`;
	const footer = "\nUse successful approaches. Avoid repeating failed patterns.";

	return [header, lines.join("\n"), footer].join("\n");
}
