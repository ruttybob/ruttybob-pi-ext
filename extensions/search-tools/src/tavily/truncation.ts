/**
 * Утилиты усечения (truncation) для Tavily-инструментов.
 *
 * Перенесено из extensions/tavily-tools/tools/shared/truncation.ts.
 */

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  withFileMutationQueue,
  type TruncateResult,
} from "@mariozechner/pi-coding-agent";
import { Temporal } from "temporal-polyfill";

// ============================================================================
// Truncation
// ============================================================================

export interface TruncatedOutput {
  content: string;
  truncation?: TruncateResult;
  fullOutputPath?: string;
}

/**
 * Путь к временной директории для усечённых файлов.
 */
export function getTempDir(cwd: string): string {
  return `${cwd}/.pi-tavily-temp`;
}

/**
 * Удалить временную директорию со всем содержимым.
 */
export async function cleanupTempDir(cwd: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(getTempDir(cwd), { recursive: true, force: true });
}

/**
 * Применить усечение к выводу и сохранить полный контент во временный файл при необходимости.
 */
export async function applyTruncation(
  fullOutput: string,
  cwd: string,
  toolName: string
): Promise<TruncatedOutput> {
  const truncation = truncateHead(fullOutput, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let content = truncation.content;

  if (truncation.truncated) {
    const tempDir = getTempDir(cwd);
    const timestamp = Temporal.Now.instant().epochMilliseconds;
    const tempFile = `${tempDir}/${toolName}-${timestamp}.txt`;

    await withFileMutationQueue(tempFile, async () => {
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(tempDir, { recursive: true });
      await writeFile(tempFile, fullOutput, "utf8");
    });

    const truncatedLines = truncation.totalLines - truncation.outputLines;
    const truncatedBytes = truncation.totalBytes - truncation.outputBytes;

    content += "\n\n";
    content += "[Output truncated: ";
    content += `showing ${truncation.outputLines} of ${truncation.totalLines} lines, `;
    content += `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). `;
    content += `${truncatedLines} lines (${formatSize(truncatedBytes)}) omitted. `;
    content += `Full output saved to: ${tempFile}. `;
    content += "Use the read tool to read the full output from this file.]";

    return {
      content,
      truncation,
      fullOutputPath: tempFile,
    };
  }

  return { content };
}
