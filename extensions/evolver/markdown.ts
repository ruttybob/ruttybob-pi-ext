/**
 * markdown.ts — Работа с markdown-файлами (async).
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { EVOLVER_MARKER } from "./types.js";

export { EVOLVER_MARKER };

/**
 * Добавляет секцию в markdown-файл с защитой от дублей по маркеру.
 */
export async function appendSectionToFile(
	filePath: string,
	marker: string,
	content: string,
): Promise<boolean> {
	let existing = "";
	try {
		existing = await readFile(filePath, "utf-8");
	} catch {
		/* новый файл */
	}
	if (existing.includes(marker)) {
		return false;
	}
	const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : "\n";
	await writeFile(filePath, existing + separator + content + "\n", "utf-8");
	return true;
}

/**
 * Удаляет секцию из markdown-файла по маркеру.
 */
export async function removeSectionFromFile(
	filePath: string,
	marker: string,
): Promise<boolean> {
	try {
		await stat(filePath);
	} catch {
		return false;
	}

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch {
		return false;
	}

	if (!content.includes(marker)) return false;

	const idx = content.indexOf(marker);

	// Ищем границу секции: от конца строки с маркером до следующей ## секции
	const afterMarker = idx + marker.length;
	const markerLineEnd = content.indexOf("\n", afterMarker);
	const searchStart = markerLineEnd !== -1 ? markerLineEnd + 1 : afterMarker;

	const nextSection = content.indexOf("\n## ", searchStart);
	const endIdx = nextSection !== -1 ? nextSection : content.length;
	content = content.slice(0, idx).trimEnd() + (nextSection !== -1 ? content.slice(endIdx) : "");
	await writeFile(filePath, content.trimEnd() + "\n", "utf-8");
	return true;
}
