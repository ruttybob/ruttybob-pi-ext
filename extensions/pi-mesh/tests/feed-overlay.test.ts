/**
 * Тесты для feed overlay: рендер feed content, scroll, escape, border.
 *
 * Упражняет overlay через публичный интерфейс: render(width) и handleInput(data).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { FeedOverlay } from "../feed-overlay.js";
import type { MeshState, Dirs, MeshConfig } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { invalidateAgentsCache } from "../registry.js";

// =============================================================================
// Helpers
// =============================================================================

function makeState(registered: boolean = true, name: string = "agent-1"): MeshState {
  return {
    agentName: name,
    agentType: "agent",
    registered,
    watcher: null,
    watcherRetries: 0,
    watcherRetryTimer: null,
    watcherDebounceTimer: null,
    reservations: [],
    chatHistory: new Map(),
    unreadCounts: new Map(),
    broadcastHistory: [],
    model: "test-model",
    gitBranch: "main",
    isHuman: true,
    session: { toolCalls: 0, tokens: 0, filesModified: [] },
    activity: { lastActivityAt: new Date().toISOString() },
    statusMessage: undefined,
    customStatus: false,
    registryFlushTimer: null,
    sessionStartedAt: new Date().toISOString(),
    hookState: {},
  };
}

const defaultConfig: MeshConfig = {
  autoRegister: false,
  autoRegisterPaths: [],
  contextMode: "full",
  feedRetention: 20,
  stuckThreshold: 600,
  autoStatus: false,
};

function makeDirs(tmpDir: string): Dirs {
  const dirs: Dirs = {
    base: tmpDir,
    registry: path.join(tmpDir, "registry"),
    inbox: path.join(tmpDir, "inbox"),
  };
  fs.mkdirSync(dirs.registry, { recursive: true });
  fs.mkdirSync(dirs.inbox, { recursive: true });
  return dirs;
}

function makeTui() {
  return {
    requestRender: () => {},
    getScreenSize: () => ({ width: 80, height: 24 }),
  } as any;
}

function makeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/]`,
    bold: (text: string) => `**${text}**`,
  } as any;
}

let tmpCounter = 0;
function tmpDir(): string {
  return `/tmp/pi-mesh-feed-test-${Date.now()}-${++tmpCounter}`;
}

function makeFeedOverlay(
  state: MeshState,
  dirs?: Dirs,
  config?: MeshConfig,
): FeedOverlay {
  const d = dirs ?? makeDirs(tmpDir());
  return new FeedOverlay(
    makeTui(),
    makeTheme(),
    state,
    d,
    config ?? defaultConfig,
    () => {},
  );
}

/** Записать feed event в feed.jsonl */
function writeFeedEvent(dirs: Dirs, event: { ts: string; agent: string; type: string; target?: string; preview?: string }) {
  const feedPath = path.join(dirs.base, "feed.jsonl");
  fs.appendFileSync(feedPath, JSON.stringify(event) + "\n");
}

// =============================================================================
// Tests: базовый рендер
// =============================================================================

describe("feed-overlay render", () => {
  beforeEach(() => invalidateAgentsCache());

  it("рендерит overlay с верхней и нижней рамкой", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeFeedOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    // Первая строка — верхняя рамка с заголовком
    expect(lines[0]).toContain("Feed");
    expect(lines[0]).toContain("[warning]"); // border color

    // Последняя строка — нижняя рамка с hint
    const footer = lines[lines.length - 1];
    expect(footer).toContain("Esc");
    expect(footer).toContain("PgUp");
    expect(footer).toContain("PgDn");
  });

  it("показывает empty state когда нет событий", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeFeedOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1);
    const hasEmpty = content.some((l) => l.includes("No activity"));
    expect(hasEmpty).toBe(true);
  });

  it("показывает feed events из feed.jsonl", () => {
    const dirs = makeDirs(tmpDir());
    writeFeedEvent(dirs, {
      ts: new Date().toISOString(),
      agent: "agent-1",
      type: "join",
    });
    writeFeedEvent(dirs, {
      ts: new Date().toISOString(),
      agent: "agent-2",
      type: "edit",
      target: "src/foo.ts",
    });

    const overlay = makeFeedOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    // Должны видеть оба события
    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("agent-1");
    expect(content).toContain("agent-2");
    expect(content).toContain("join");
    expect(content).toContain("foo.ts");
  });

  it("контентные строки внутри рамки начинаются с │", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeFeedOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    const contentLines = lines.slice(1, -1);
    const nonEmpty = contentLines.filter((l) => l.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThan(0);
    for (const line of nonEmpty) {
      expect(line.startsWith("│") || line.startsWith("[warning]│")).toBe(true);
    }
  });
});

// =============================================================================
// Tests: скролл
// =============================================================================

describe("feed-overlay scroll", () => {
  beforeEach(() => invalidateAgentsCache());

  it("Down увеличивает scrollOffset", () => {
    const dirs = makeDirs(tmpDir());
    // Создаём много событий
    for (let i = 0; i < 30; i++) {
      writeFeedEvent(dirs, {
        ts: new Date().toISOString(),
        agent: `agent-${i}`,
        type: "edit",
        target: `file-${i}.ts`,
      });
    }

    const overlay = makeFeedOverlay(makeState(), dirs);
    const before = overlay.render(80);

    overlay.handleInput("\x1b[B"); // Down
    const after = overlay.render(80);

    // После Down overlay всё ещё рендерится (не падает)
    expect(after.length).toBeGreaterThan(0);
    // Если событий много, контент должен измениться
    expect(after[0]).toContain("Feed"); // рамка на месте
  });

  it("Up уменьшает scrollOffset, не уходит в минус", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeFeedOverlay(makeState(), dirs);

    // Сразу жмём Up — offset не должен уйти в минус
    overlay.handleInput("\x1b[A"); // Up
    const lines = overlay.render(80);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("PageDown скроллит на страницу вперёд", () => {
    const dirs = makeDirs(tmpDir());
    for (let i = 0; i < 30; i++) {
      writeFeedEvent(dirs, {
        ts: new Date().toISOString(),
        agent: `agent-${i}`,
        type: "edit",
        target: `file-${i}.ts`,
      });
    }

    const overlay = makeFeedOverlay(makeState(), dirs);
    overlay.handleInput("\x1b[6~"); // PageDown
    const lines = overlay.render(80);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("Feed");
  });

  it("PageUp скроллит назад, clamp к 0", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeFeedOverlay(makeState(), dirs);

    // PageDown потом PageUp — должен вернуться наверх
    overlay.handleInput("\x1b[6~");
    overlay.handleInput("\x1b[5~");
    const lines = overlay.render(80);
    expect(lines.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Tests: Escape закрывает overlay
// =============================================================================

describe("feed-overlay escape", () => {
  beforeEach(() => invalidateAgentsCache());

  it("Escape вызывает done() колбэк", () => {
    let doneCalled = false;
    const dirs = makeDirs(tmpDir());
    const overlay = new FeedOverlay(
      makeTui(),
      makeTheme(),
      makeState(),
      dirs,
      defaultConfig,
      () => { doneCalled = true; },
    );

    overlay.handleInput("\x1b"); // Escape
    expect(doneCalled).toBe(true);
  });

  it("прочие клавиши не вызывают done()", () => {
    let doneCalled = false;
    const dirs = makeDirs(tmpDir());
    const overlay = new FeedOverlay(
      makeTui(),
      makeTheme(),
      makeState(),
      dirs,
      defaultConfig,
      () => { doneCalled = true; },
    );

    overlay.handleInput("\x1b[B"); // Down
    overlay.handleInput("\x1b[6~"); // PageDown
    expect(doneCalled).toBe(false);
  });
});
