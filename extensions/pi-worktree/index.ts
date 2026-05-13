import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ─── Константы ────────────────────────────────────────────────

const WORKTREES_DIR = ".worktrees";
const MAX_SLUG_LEN = 20;
const SLUG_TIMEOUT_MS = 15_000;

// ─── Инструкции для изолированного агента ────────────────────

const ISOLATION_INSTRUCTIONS = `# Изолированная работа в git-worktree

Вы находитесь в изолированном рабочем дереве Git.
Все изменения будут записаны в отдельную ветку и позже влиты
в основную кодовую базу.

## Правила
1. Не выходите за пределы текущей директории.
2. Не изменяйте файлы за пределами рабочего дерева.
3. Не взаимодействуйте с другими worktree-ветками или tmux-сессиями.
4. Коммитьте изменения: git add + git commit с осмысленными сообщениями.
5. Перед завершением: всё закоммичено, нет мусора, тесты проходят.
6. По завершении — сообщите пользователю, что можно выполнить
   /worktree-merge для слияния.
7. Не удаляйте worktree изнутри.`;

// ─── Утилиты ──────────────────────────────────────────────────

/** Простой slugify — фолбэк, если LLM не дал ответ. */
function slugify(name: string, maxLen = MAX_SLUG_LEN): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-$/, "");
}

/** Достаём чистый slug из ответа агента. */
function extractSlug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/^-+|-+$/g, "");
  return cleaned.length >= 2 && /^[a-z]/.test(cleaned) ? cleaned : "";
}

/** Запрашиваем у LLM короткое имя задачи. */
async function requestSlug(
  taskName: string,
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<string> {
  const prompt = [
    "Сгенерируй короткий slug (kebab-case, макс 20 символов, только",
    "английские a-z, 0-9 и дефисы) для этой задачи.",
    "Ответь ТОЛЬКО slug-ом, ничего больше.",
    "",
    `Задача: "${taskName}"`,
  ].join("\n");

  pi.sendUserMessage(prompt);

  // Ждём ответ агента (с таймаутом)
  try {
    await Promise.race([
      ctx.waitForIdle(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("slug timeout")), SLUG_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return slugify(taskName);
  }

  // Ищем последний ответ ассистента
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "message" && entry.message.role === "assistant") {
      const text = entry.message.content.map((c) => c.text ?? "").join("");
      const slug = extractSlug(text);
      if (slug) return slug;
      break;
    }
  }

  return slugify(taskName);
}

/** Собираем доступные worktree-slugs (из .worktrees/ и tmux). */
function listWorktreeSlugs(cwd: string): string[] {
  const slugs = new Set<string>();

  // 1. Директории в .worktrees/
  const worktreesDir = path.join(cwd, WORKTREES_DIR);
  try {
    for (const entry of fs.readdirSync(worktreesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) slugs.add(entry.name);
    }
  } catch {
    // .worktrees/ не существует — ок
  }

  // 2. Активные tmux-окна
  try {
    const output = execSync(
      `tmux list-windows -F "#{window_name}"`,
      { encoding: "utf-8" },
    );
    for (const w of output.trim().split("\n")) {
      if (w.startsWith("task-")) slugs.add(w.slice(5));
    }
  } catch {
    // tmux недоступен — ок
  }

  return [...slugs].sort();
}

// ─── Расширение ───────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Проверка tmux при старте
  pi.on("session_start", async (_event, ctx) => {
    const check = await pi.exec("tmux", ["has-session"]);
    if (check.code !== 0) {
      ctx.ui.notify(
        "tmux не найден или нет активной сессии. Команды /worktree не будут работать.",
        "warning",
      );
    }
  });

  // ── /worktree ─────────────────────────────────────────────

  pi.registerCommand("worktree", {
    description:
      "Создать изолированное рабочее дерево и запустить агента в tmux",
    handler: async (args, ctx) => {
      const taskName = args.trim();
      if (!taskName) {
        ctx.ui.notify(
          "Укажите описание задачи. Пример: /worktree add dark mode",
          "warning",
        );
        return;
      }

      ctx.ui.notify("Придумываю имя для задачи...", "info");
      const slug = await requestSlug(taskName, pi, ctx);

      const cwd = ctx.cwd;
      const worktreePath = path.join(cwd, WORKTREES_DIR, slug);
      const branchName = `worktree/${slug}`;

      // 1. git worktree
      const add = await pi.exec("git", [
        "worktree",
        "add",
        "-b",
        branchName,
        worktreePath,
        "HEAD",
      ]);
      if (add.code !== 0) {
        ctx.ui.notify(`Ошибка git worktree: ${add.stderr}`, "error");
        return;
      }

      // 2. APPEND_SYSTEM.md внутрь worktree
      const piDir = path.join(worktreePath, ".pi");
      fs.mkdirSync(piDir, { recursive: true });
      fs.writeFileSync(
        path.join(piDir, "APPEND_SYSTEM.md"),
        ISOLATION_INSTRUCTIONS,
        "utf-8",
      );

      // 3. Setup-скрипты из .pi/worktree.json (если есть)
      const configPath = path.join(cwd, ".pi", "worktree.json");
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          for (const cmd of config.setup ?? []) {
            await pi.exec("bash", ["-c", cmd], { cwd: worktreePath });
          }
        } catch {
          ctx.ui.notify("Ошибка чтения .pi/worktree.json", "warning");
        }
      }

      // 4. tmux
      const windowName = `task-${slug}`;
      await pi.exec("tmux", ["new-window", "-n", windowName]);
      await pi.exec("tmux", [
        "send-keys",
        "-t",
        windowName,
        `cd ${worktreePath} && pi`,
        "Enter",
      ]);

      ctx.ui.notify(
        `Worktree создан: ${worktreePath}\nTmux: ${windowName}`,
        "success",
      );
    },
  });

  // ── /worktree-destroy ─────────────────────────────────────

  pi.registerCommand("worktree-destroy", {
    description: "Удалить изолированное дерево и tmux-окно",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const slugs = listWorktreeSlugs(process.cwd());
      const items: AutocompleteItem[] = slugs
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const slug = slugify(args.trim());
      const worktreePath = path.join(ctx.cwd, WORKTREES_DIR, slug);
      const branchName = `worktree/${slug}`;

      await pi.exec("git", ["worktree", "remove", "--force", worktreePath]);
      await pi.exec("git", ["branch", "-D", branchName]);
      await pi.exec("tmux", ["kill-window", "-t", `task-${slug}`]);

      ctx.ui.notify(`Worktree '${slug}' удалён`, "success");
    },
  });

  // ── /worktree-merge ───────────────────────────────────────

  pi.registerCommand("worktree-merge", {
    description: "Слить изменения и удалить окружение",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const slugs = listWorktreeSlugs(process.cwd());
      const items: AutocompleteItem[] = slugs
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const slug = slugify(args.trim());
      const branchName = `worktree/${slug}`;

      const mainResult = await pi.exec("git", [
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
      ]);
      const mainBranch =
        mainResult.code === 0
          ? mainResult.stdout.trim().replace("refs/remotes/origin/", "")
          : "main";

      await pi.exec("git", ["checkout", mainBranch]);
      await pi.exec("git", ["merge", "--no-ff", branchName]);

      const worktreePath = path.join(ctx.cwd, WORKTREES_DIR, slug);
      await pi.exec("git", ["worktree", "remove", "--force", worktreePath]);
      await pi.exec("git", ["branch", "-D", branchName]);
      await pi.exec("tmux", ["kill-window", "-t", `task-${slug}`]);

      ctx.ui.notify(
        `Изменения из '${slug}' влиты в ${mainBranch}, окружение удалено`,
        "success",
      );
    },
  });

  // ── /worktree-list ────────────────────────────────────────

  pi.registerCommand("worktree-list", {
    description: "Список активных worktree-задач",
    handler: async (_args, ctx) => {
      const result = await pi.exec("tmux", [
        "list-windows",
        "-F",
        "#{window_name}",
      ]);
      const tasks = (result.stdout || "")
        .split("\n")
        .filter((w) => w.startsWith("task-"));
      if (tasks.length === 0) {
        ctx.ui.notify("Нет активных worktree-задач", "info");
      } else {
        ctx.ui.notify(
          `Активные задачи:\n${tasks.map((t) => "  " + t).join("\n")}`,
          "info",
        );
      }
    },
  });
}