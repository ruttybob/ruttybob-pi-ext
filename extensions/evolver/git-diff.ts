/**
 * git-diff.ts — Модуль для получения статистики git diff для evolver pi-адаптера.
 *
 * Предоставляет информацию об изменениях в репозитории:
 * количество изменённых файлов, вставок, удалений и фрагмент самого diff.
 */

import { spawn } from "node:child_process";

/** Результат анализа git diff */
export interface GitDiffStats {
  stat: string;
  summary: string;       // "3 files changed, +42/-12"
  diffSnippet: string;   // первые 2000 символов diff
  hasChanges: boolean;
}

/** Максимальный размер буфера для вывода git — 10 МБ */
const MAX_BUFFER = 10 * 1024 * 1024;

/** Таймаут выполнения git-команд в миллисекундах */
const GIT_TIMEOUT = 5000;

/** Максимальная длина фрагмента diff */
const DIFF_SNIPPET_LIMIT = 2000;

/**
 * Выполняет git-команду с таймаутом и возвращает stdout.
 * При любой ошибке (не git-репозиторий, таймаут, нет коммитов) возвращает пустую строку.
 */
function execGit(args: string[], cwd: string, timeout = GIT_TIMEOUT): Promise<string> {
  return new Promise((resolve) => {
    let killed = false;

    const proc = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => {
      // Защита от превышения буфера
      if (stdout.length < MAX_BUFFER) {
        stdout += d.toString();
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_BUFFER) {
        stderr += d.toString();
      }
    });

    proc.on("close", (code) => {
      if (killed) return;
      resolve(code === 0 ? stdout.trim() : "");
    });

    proc.on("error", () => {
      killed = true;
      resolve("");
    });
  });
}

/**
 * Возвращает статистику изменений в репозитории по указанному пути.
 *
 * Сначала пробует `git diff --stat HEAD~1`, затем — `git diff --stat`
 * (для рабочей копии без предыдущего коммита).
 *
 * Аналогично получает содержимое diff для формирования сниппета.
 *
 * @param cwd — путь к рабочей директории (git-репозиторию)
 */
export async function getGitDiffStats(cwd: string): Promise<GitDiffStats> {
  // --- Получаем статистику ---
  let stat = await execGit(["diff", "--stat", "HEAD~1"], cwd);
  if (!stat) {
    stat = await execGit(["diff", "--stat"], cwd);
  }

  // --- Получаем содержимое diff ---
  let diffContent = await execGit(["diff", "HEAD~1", "--no-color"], cwd);
  if (!diffContent) {
    diffContent = await execGit(["diff", "--no-color"], cwd);
  }

  // Нет изменений — возвращаем пустой результат
  if (!stat) {
    return {
      stat: "",
      summary: "unknown",
      diffSnippet: "",
      hasChanges: false,
    };
  }

  // --- Парсим числовые значения из строки статистики ---
  const filesMatch = stat.match(/(\d+) files? changed/);
  const insertionsMatch = stat.match(/(\d+) insertions?/);
  const deletionsMatch = stat.match(/(\d+) deletions?/);

  const filesChanged = filesMatch ? filesMatch[1] : "0";
  const insertions = insertionsMatch ? insertionsMatch[1] : "0";
  const deletions = deletionsMatch ? deletionsMatch[1] : "0";

  const summary = `${filesChanged} files changed, +${insertions}/-${deletions}`;
  const diffSnippet = diffContent.slice(0, DIFF_SNIPPET_LIMIT);

  return {
    stat,
    summary,
    diffSnippet,
    hasChanges: stat.length > 0,
  };
}
