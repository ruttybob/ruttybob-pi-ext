/**
 * Тесты FeedOverlay: rounded border chars, MAX_VISIBLE_LINES truncation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeedOverlay } from "../../extensions/pi-mesh/feed-overlay.js";
import type { MeshState, Dirs, MeshConfig } from "../../extensions/pi-mesh/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

// Мокаем pi-tui: truncateToWidth не режет, matchesKey для Escape
vi.mock("@mariozechner/pi-tui", () => ({
  truncateToWidth: (s: string, _w: number) => s,
  matchesKey: (data: string, key: any) => {
    if (key === key?.escape && data === "\x1b") return true;
    return false;
  },
  Key: { escape: "escape", up: "up", down: "down", pageUp: "pageUp", pageDown: "pageDown" },
  visibleWidth: (s: string) => {
    // Убираем ANSI-подобные теги [color]...[/] для подсчёта ширины
    return s.replace(/\[[^\]]*\]/g, "").length;
  },
}));

// Мокаем feed.js
vi.mock("../../extensions/pi-mesh/feed.js", () => ({
  readEvents: () => mockFeedEvents,
  formatEvent: (e: any) => `${e.agent} ${e.type}`,
}));

let mockFeedEvents: any[] = [];

function makeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/]`,
    bold: (text: string) => `**${text}**`,
  } as any;
}

function makeDirs(): Dirs {
  return {
    base: path.join(tmpdir(), `feed-overlay-test-${Date.now()}`),
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

describe("FeedOverlay", () => {
  let overlay: FeedOverlay;
  let doneResult: void | undefined;
  let tuiRenderRequested: boolean;

  beforeEach(() => {
    mockFeedEvents = [];
    doneResult = undefined;
    tuiRenderRequested = false;

    const tui = { requestRender: () => { tuiRenderRequested = true; } } as any;
    const done = (result: void) => { doneResult = result; };

    overlay = new FeedOverlay(tui, makeTheme(), makeState(), makeDirs(), makeConfig(), done);
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
    it("показывает все строки когда контент ≤ MAX_VISIBLE_LINES", () => {
      // Генерируем 10 событий — все должны уместиться
      mockFeedEvents = Array.from({ length: 10 }, (_, i) => ({
        ts: new Date().toISOString(),
        agent: `agent-${i}`,
        type: "join" as const,
      }));

      const lines = overlay.render(80);
      // topBorder + 10 content lines + bottomBorder = 12
      expect(lines.length).toBe(12);
    });

    it("обрезает контент сверх MAX_VISIBLE_LINES", () => {
      // Генерируем 50 событий — должно быть обрезано
      mockFeedEvents = Array.from({ length: 50 }, (_, i) => ({
        ts: new Date().toISOString(),
        agent: `agent-${i}`,
        type: "join" as const,
      }));

      const lines = overlay.render(80);
      // topBorder(1) + MAX_VISIBLE_LINES(12) + bottomBorder(1) = 14
      expect(lines.length).toBe(14);
    });
  });

  describe("handleInput", () => {
    it("закрывается по Escape", () => {
      overlay.handleInput("\x1b");
      // done() вызывается без аргументов
      expect(doneResult).toBeUndefined();
    });
  });
});
