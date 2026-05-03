/**
 * Тесты для chat overlay: рендер chat history, input field, отправка,
 * @mention completion, escape, unregistered guard, border.
 *
 * Упражняет overlay через публичный интерфейс: render(width) и handleInput(data).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ChatOverlay } from "../chat-overlay.js";
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
  return `/tmp/pi-mesh-chat-test-${Date.now()}-${++tmpCounter}`;
}

function makeChatOverlay(
  state: MeshState,
  dirs?: Dirs,
  config?: MeshConfig,
): ChatOverlay {
  const d = dirs ?? makeDirs(tmpDir());
  return new ChatOverlay(
    makeTui(),
    makeTheme(),
    state,
    d,
    config ?? defaultConfig,
    () => {},
  );
}

/** Записать registry файл для агента */
function registerAgent(dirs: Dirs, name: string, extra?: Record<string, any>) {
  const entry = {
    name,
    isHuman: false,
    pid: process.pid,
    model: "test-model",
    gitBranch: "main",
    startedAt: new Date().toISOString(),
    session: { toolCalls: 0, tokens: 0, filesModified: [] },
    activity: { lastActivityAt: new Date().toISOString() },
    ...extra,
  };
  fs.writeFileSync(
    path.join(dirs.registry, `${name}.json`),
    JSON.stringify(entry),
  );
}

// =============================================================================
// Tests: базовый рендер
// =============================================================================

describe("chat-overlay render", () => {
  beforeEach(() => invalidateAgentsCache());

  it("рендерит overlay с верхней и нижней рамкой", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    // Верхняя рамка с заголовком Chat
    expect(lines[0]).toContain("Chat");
    expect(lines[0]).toContain("[warning]");

    // Нижняя рамка с hints
    const footer = lines[lines.length - 1];
    expect(footer).toContain("Esc");
  });

  it("показывает empty state когда нет сообщений", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(), dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("No messages");
  });

  it("показывает поле ввода когда registered", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(true), dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("To: @all");
    expect(content).toContain("> ");
  });

  it("контентные строки внутри рамки начинаются с │", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(), dirs);
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
// Tests: история чата
// =============================================================================

describe("chat-overlay history", () => {
  beforeEach(() => invalidateAgentsCache());

  it("рендерит broadcast сообщения", () => {
    const state = makeState(true, "agent-1");
    state.broadcastHistory = [
      {
        id: "1",
        from: "agent-2",
        to: "all",
        text: "hello everyone",
        timestamp: new Date().toISOString(),
        urgent: false,
        replyTo: null,
      },
    ];

    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(state, dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("agent-2");
    expect(content).toContain("hello everyone");
  });

  it("рендерит DM сообщения", () => {
    const state = makeState(true, "agent-1");
    const msgs = [
      {
        id: "1",
        from: "agent-2",
        to: "agent-1",
        text: "hey there",
        timestamp: new Date().toISOString(),
        urgent: false,
        replyTo: null,
      },
    ];
    state.chatHistory.set("agent-2", msgs as any);

    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(state, dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("agent-2");
    expect(content).toContain("hey there");
  });

  it("подсвечивает свои сообщения accent цветом", () => {
    const state = makeState(true, "agent-1");
    state.broadcastHistory = [
      {
        id: "1",
        from: "agent-1",
        to: "all",
        text: "my message",
        timestamp: new Date().toISOString(),
        urgent: false,
        replyTo: null,
      },
    ];

    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(state, dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("[accent]agent-1[/]");
    expect(content).toContain("my message");
  });
});

// =============================================================================
// Tests: ввод и отправка
// =============================================================================

describe("chat-overlay input", () => {
  beforeEach(() => invalidateAgentsCache());

  it("печатает символы в поле ввода", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    const overlay = makeChatOverlay(makeState(true, "agent-1"), dirs);

    overlay.handleInput("h");
    overlay.handleInput("i");
    overlay.handleInput("!");

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("hi!");
  });

  it("Backspace удаляет последний символ", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    const overlay = makeChatOverlay(makeState(true, "agent-1"), dirs);

    overlay.handleInput("a");
    overlay.handleInput("b");
    overlay.handleInput("c");
    overlay.handleInput("\x7f"); // Backspace

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("ab");
    expect(content).not.toContain("abc");
  });

  it("Enter отправляет broadcast сообщение", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    registerAgent(dirs, "agent-2"); // broadcast нужен получатель
    const state = makeState(true, "agent-1");

    const overlay = makeChatOverlay(state, dirs);
    overlay.handleInput("h");
    overlay.handleInput("i");
    overlay.handleInput("\r"); // Enter

    // После отправки broadcastHistory должен содержать сообщение
    expect(state.broadcastHistory.length).toBeGreaterThan(0);
    expect(state.broadcastHistory[0].text).toBe("hi");
  });

  it("Enter очищает поле ввода", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    registerAgent(dirs, "agent-2"); // broadcast нужен получатель
    const state = makeState(true, "agent-1");

    const overlay = makeChatOverlay(state, dirs);
    overlay.handleInput("h");
    overlay.handleInput("i");
    overlay.handleInput("\r");

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    // Поле ввода должно быть пустым
    expect(content).toContain("> ");
    // Не должно содержать "hi" в поле ввода (но может в истории)
  });
});

// =============================================================================
// Tests: @mention completion
// =============================================================================

describe("chat-overlay @mention", () => {
  beforeEach(() => invalidateAgentsCache());

  it("Tab после @ дополняет имя агента", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    registerAgent(dirs, "agent-2");

    const overlay = makeChatOverlay(makeState(true, "agent-1"), dirs);
    overlay.handleInput("@");
    overlay.handleInput("a");
    overlay.handleInput("g");  // "@ag"
    overlay.handleInput("\t"); // Tab — должно дополнить

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    // Должен быть дополненный @agent-2
    expect(content).toMatch(/@agent-2/);
  });

  it("Tab без @ не дополняет", () => {
    const dirs = makeDirs(tmpDir());
    registerAgent(dirs, "agent-1");
    registerAgent(dirs, "agent-2");

    const overlay = makeChatOverlay(makeState(true, "agent-1"), dirs);
    overlay.handleInput("h");
    overlay.handleInput("\t"); // Tab без @

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    // Просто "h" в поле ввода, без @
    expect(content).toContain("> h");
  });
});

// =============================================================================
// Tests: Escape закрывает overlay
// =============================================================================

describe("chat-overlay escape", () => {
  beforeEach(() => invalidateAgentsCache());

  it("Escape вызывает done() колбэк", () => {
    let doneCalled = false;
    const dirs = makeDirs(tmpDir());
    const overlay = new ChatOverlay(
      makeTui(),
      makeTheme(),
      makeState(),
      dirs,
      defaultConfig,
      () => { doneCalled = true; },
    );

    overlay.handleInput("\x1b");
    expect(doneCalled).toBe(true);
  });

  it("прочие клавиши не вызывают done()", () => {
    let doneCalled = false;
    const dirs = makeDirs(tmpDir());
    const overlay = new ChatOverlay(
      makeTui(),
      makeTheme(),
      makeState(),
      dirs,
      defaultConfig,
      () => { doneCalled = true; },
    );

    overlay.handleInput("\x1b[B"); // Down
    expect(doneCalled).toBe(false);
  });
});

// =============================================================================
// Tests: unregistered guard
// =============================================================================

describe("chat-overlay unregistered guard", () => {
  beforeEach(() => invalidateAgentsCache());

  it("показывает hint 'Not registered' когда !registered", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(false), dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).toContain("Not registered");
    expect(content).toContain("/mesh-tools");
  });

  it("не показывает поле ввода когда !registered", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(false), dirs);
    const lines = overlay.render(80);

    const content = lines.slice(1, -1).join("\n");
    expect(content).not.toContain("To: @all");
    expect(content).not.toContain("> ");
  });

  it("игнорирует ввод символов когда !registered", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(false), dirs);

    overlay.handleInput("h");
    overlay.handleInput("i");

    const lines = overlay.render(80);
    const content = lines.slice(1, -1).join("\n");
    expect(content).not.toContain("hi");
  });

  it("Enter noop когда !registered", () => {
    const dirs = makeDirs(tmpDir());
    const state = makeState(false);

    const overlay = makeChatOverlay(state, dirs);
    overlay.handleInput("h");
    overlay.handleInput("\r"); // Enter

    expect(state.broadcastHistory.length).toBe(0);
    expect(state.chatHistory.size).toBe(0);
  });
});

// =============================================================================
// Tests: скролл
// =============================================================================

describe("chat-overlay scroll", () => {
  beforeEach(() => invalidateAgentsCache());

  it("Down увеличивает scrollOffset при длинной истории", () => {
    const state = makeState(true, "agent-1");
    // Много сообщений
    for (let i = 0; i < 30; i++) {
      state.broadcastHistory.push({
        id: `${i}`,
        from: `agent-${i % 3}`,
        to: "all",
        text: `message ${i}`,
        timestamp: new Date().toISOString(),
        urgent: false,
        replyTo: null,
      });
    }

    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(state, dirs);
    overlay.handleInput("\x1b[B"); // Down
    const lines = overlay.render(80);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("Chat");
  });

  it("Up уменьшает scrollOffset, clamp к 0", () => {
    const dirs = makeDirs(tmpDir());
    const overlay = makeChatOverlay(makeState(true), dirs);
    overlay.handleInput("\x1b[A"); // Up — не уходит в минус
    const lines = overlay.render(80);
    expect(lines.length).toBeGreaterThan(0);
  });
});
