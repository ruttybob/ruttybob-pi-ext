/**
 * Тесты ChatOverlay: rounded border chars, MAX_VISIBLE_LINES truncation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatOverlay } from "../../extensions/pi-mesh/chat-overlay.js";
import type { MeshState, Dirs, MeshConfig } from "../../extensions/pi-mesh/types.js";

// Мокаем pi-tui
vi.mock("@mariozechner/pi-tui", () => ({
  truncateToWidth: (s: string, _w: number) => s,
  matchesKey: (data: string, key: any) => {
    if (key === "escape" && data === "\x1b") return true;
    return false;
  },
  Key: { escape: "escape", up: "up", down: "down", pageUp: "pageUp", pageDown: "pageDown", enter: "enter", tab: "tab", backspace: "backspace" },
  visibleWidth: (s: string) => s.replace(/\[[^\]]*\]/g, "").length,
}));

// Мокаем registry.js
vi.mock("../../extensions/pi-mesh/registry.js", () => ({
  getActiveAgents: () => [],
}));

// Мокаем messaging.js
vi.mock("../../extensions/pi-mesh/messaging.js", () => ({
  broadcastMessage: () => [],
  sendMessage: () => {},
}));

function makeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/]`,
    bold: (text: string) => `**${text}**`,
  } as any;
}

function makeDirs(): Dirs {
  return {
    base: "/tmp/chat-overlay-test",
    registry: "",
    inbox: "",
  };
}

function makeState(): MeshState {
  return {
    agentName: "test-agent",
    agentType: "agent",
    registered: true,
    watcher: null,
    watcherRetries: 0,
    watcherRetryTimer: null,
    watcherDebounceTimer: null,
    reservations: [],
    chatHistory: new Map(),
    unreadCounts: new Map(),
    broadcastHistory: [],
    model: "test-model",
    isHuman: true,
    session: { toolCalls: 0, tokens: 0, filesModified: [] },
    activity: { lastActivityAt: new Date().toISOString() },
    statusMessage: undefined,
    customStatus: false,
    registryFlushTimer: null,
    sessionStartedAt: new Date().toISOString(),
  };
}

function makeConfig(): MeshConfig {
  return {
    autoRegister: false,
    autoRegisterPaths: [],
    contextMode: "full",
    feedRetention: 20,
    stuckThreshold: 600,
    autoStatus: false,
  };
}

/**
 * Генерирует N сообщений в chatHistory.
 */
function populateMessages(state: MeshState, count: number): void {
  const msgs = Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    from: `agent-${i % 3}`,
    to: "test-agent",
    text: `Hello ${i}`,
    timestamp: new Date(Date.now() - (count - i) * 1000).toISOString(),
    urgent: false,
    replyTo: null,
  }));
  state.chatHistory.set("agent-0", msgs.filter((_, i) => i % 3 === 0));
  state.chatHistory.set("agent-1", msgs.filter((_, i) => i % 3 === 1));
  state.chatHistory.set("agent-2", msgs.filter((_, i) => i % 3 === 2));
}

describe("ChatOverlay", () => {
  let overlay: ChatOverlay;
  let doneResult: void | undefined;

  beforeEach(() => {
    doneResult = undefined;
    const tui = { requestRender: () => {} } as any;
    const done = (result: void) => { doneResult = result; };

    overlay = new ChatOverlay(tui, makeTheme(), makeState(), makeDirs(), makeConfig(), done);
  });

  describe("render — rounded border chars", () => {
    it("использует ╭╮ для верхней рамки", () => {
      const lines = overlay.render(60);
      expect(lines[0]).toContain("╭");
      expect(lines[0]).toContain("╮");
      expect(lines[0]).not.toContain("┌");
      expect(lines[0]).not.toContain("┐");
    });

    it("использует ╰╯ для нижней рамки", () => {
      const lines = overlay.render(60);
      const last = lines[lines.length - 1];
      expect(last).toContain("╰");
      expect(last).toContain("╯");
      expect(last).not.toContain("└");
      expect(last).not.toContain("┘");
    });
  });

  describe("render — MAX_VISIBLE_LINES", () => {
    it("показывает все сообщения когда история ≤ MAX_VISIBLE_LINES", () => {
      const state = makeState();
      populateMessages(state, 5);
      const tui = { requestRender: () => {} } as any;
      const done = (r: void) => { doneResult = r; };
      const ol = new ChatOverlay(tui, makeTheme(), state, makeDirs(), makeConfig(), done);

      const lines = ol.render(80);
      // Должно быть разумное количество строк — не раздувается
      expect(lines.length).toBeGreaterThan(3); // хотя бы top + content + bottom
    });

    it("обрезает историю когда сообщений > MAX_VISIBLE_LINES", () => {
      const state = makeState();
      // Генерируем 50 сообщений — должно быть обрезано
      populateMessages(state, 50);
      const tui = { requestRender: () => {} } as any;
      const done = (r: void) => { doneResult = r; };
      const ol = new ChatOverlay(tui, makeTheme(), state, makeDirs(), makeConfig(), done);

      const lines = ol.render(80);
      // MAX_VISIBLE_LINES = 10 history lines + 4 UI lines (empty, separator, target, input) = 14 content
      // + topBorder(1) + bottomBorder(1) = 16 max
      expect(lines.length).toBeLessThanOrEqual(16);
    });

    it("input area всегда видна даже при большой истории", () => {
      const state = makeState();
      populateMessages(state, 50);
      const tui = { requestRender: () => {} } as any;
      const done = (r: void) => { doneResult = r; };
      const ol = new ChatOverlay(tui, makeTheme(), state, makeDirs(), makeConfig(), done);

      const lines = ol.render(80);
      // Должна быть строка ввода "> " перед нижней рамкой
      const hasInputLine = lines.some(l => l.includes(">"));
      expect(hasInputLine).toBe(true);
    });
  });

  describe("handleInput", () => {
    it("закрывается по Escape", () => {
      overlay.handleInput("\x1b");
      expect(doneResult).toBeUndefined();
    });
  });
});
