/**
 * Pi Mesh - Chat Overlay
 *
 * Overlay для интерактивного чата (50% высоты, anchor: center).
 * Поле ввода, отправка сообщений, @mention completion, Escape to close.
 */

import { matchesKey, truncateToWidth, Key } from "@mariozechner/pi-tui";
import type { Component, TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { MeshState, Dirs, MeshConfig } from "./types.js";
import * as registry from "./registry.js";
import * as messaging from "./messaging.js";
import { topBorder, bottomBorder, contentLine } from "./overlay-helpers.js";

export const MAX_VISIBLE_LINES = 10;

export class ChatOverlay implements Component {
  private scrollOffset = 0;
  private chatInput = "";
  private chatTarget = "@all";
  private completionCandidates: string[] = [];
  private completionIndex = -1;
  private lastRenderHeight = 0;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private state: MeshState,
    private dirs: Dirs,
    private config: MeshConfig,
    private done: (result: void) => void,
  ) {}

  render(width: number): string[] {
    const lines: string[] = [];
    const borderColor = (s: string) => this.theme.fg("warning", s);
    const contentWidth = width - 2;

    // Верхняя рамка
    lines.push(topBorder(width, "Chat", borderColor, this.theme));

    // Контент
    const content = this.renderChat(contentWidth);
    const maxScroll = Math.max(0, content.length - 1);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;
    const visible = content.slice(this.scrollOffset);

    for (const line of visible) {
      lines.push(contentLine(line, contentWidth, borderColor));
    }

    this.lastRenderHeight = visible.length;

    // Нижняя рамка с hints
    const hints = this.state.registered
      ? " ↑↓:scroll | Enter:send | Tab:@mention | Esc:close "
      : " ↑↓:scroll | Esc:close ";
    lines.push(bottomBorder(width, hints, borderColor, this.theme));

    return lines;
  }

  handleInput(data: string): void {
    // Escape закрывает overlay
    if (matchesKey(data, Key.escape)) {
      this.done();
      return;
    }

    // Scroll
    if (matchesKey(data, Key.up)) {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.scrollOffset++;
      this.tui.requestRender();
      return;
    }

    // Chat input (only when registered)
    if (this.state.registered) {
      // Tab: @mention completion
      if (matchesKey(data, Key.tab)) {
        if (this.chatInput.includes("@")) {
          this.handleMentionComplete();
          return;
        }
        return; // Tab без @ — игнорируем
      }

      // Enter: отправка сообщения
      if (matchesKey(data, Key.enter)) {
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.sendChatMessage();
        return;
      }

      // Backspace
      if (matchesKey(data, Key.backspace)) {
        this.chatInput = this.chatInput.slice(0, -1);
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.tui.requestRender();
        return;
      }

      // Обычный символ
      if (data.length === 1 && !data.startsWith("\x1b")) {
        this.chatInput += data;
        this.completionCandidates = [];
        this.completionIndex = -1;
        this.tui.requestRender();
        return;
      }
    }
  }

  private renderChat(width: number): string[] {
    const lines: string[] = [];

    // Собираем все сообщения
    const allMessages: Array<{
      text: string;
      time: string;
      from: string;
      timestamp: string;
    }> = [];

    for (const [_sender, msgs] of this.state.chatHistory) {
      for (const msg of msgs) {
        allMessages.push({
          text: msg.text,
          time: new Date(msg.timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          from: msg.from,
          timestamp: msg.timestamp,
        });
      }
    }

    for (const msg of this.state.broadcastHistory) {
      allMessages.push({
        text: msg.text,
        time: new Date(msg.timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        from: msg.from,
        timestamp: msg.timestamp,
      });
    }

    allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (allMessages.length === 0) {
      lines.push(this.theme.fg("dim", "  No messages yet."));
      lines.push("");
    } else {
      const visible = allMessages.slice(-MAX_VISIBLE_LINES);
      for (const m of visible) {
        const fromStr =
          m.from === this.state.agentName
            ? this.theme.fg("accent", m.from)
            : m.from;
        lines.push(
          truncateToWidth(
            `  ${this.theme.fg("dim", m.time)} ${fromStr}: ${m.text}`,
            width,
          ),
        );
      }
    }

    // Разделитель
    lines.push("");
    lines.push(this.theme.fg("dim", "  " + "─".repeat(width - 4)));

    if (!this.state.registered) {
      lines.push(
        this.theme.fg("dim", "  Not registered — use /mesh-tools to join"),
      );
    } else {
      // Completion candidates
      if (this.completionCandidates.length > 1) {
        const hints = this.completionCandidates.map((c, i) =>
          i === this.completionIndex
            ? this.theme.fg("accent", `@${c}`)
            : this.theme.fg("dim", `@${c}`),
        );
        lines.push(`  ${hints.join("  ")}`);
      }

      lines.push(`  ${this.theme.fg("dim", `To: ${this.chatTarget}`)}`);
      lines.push(`  > ${this.chatInput}`);
    }

    return lines;
  }

  private handleMentionComplete(): void {
    const atIdx = this.chatInput.lastIndexOf("@");
    if (atIdx === -1) return;

    const partial = this.chatInput.slice(atIdx + 1).toLowerCase();
    const agents = registry.getActiveAgents(this.state, this.dirs);
    const names = agents.map((a) => a.name);

    // Первый Tab — строим candidates
    if (this.completionCandidates.length === 0) {
      this.completionCandidates = partial
        ? names.filter((n) => n.toLowerCase().startsWith(partial))
        : names;
      if ("all".startsWith(partial)) {
        this.completionCandidates.push("all");
      }
      this.completionIndex = 0;
    } else {
      // Циклим по candidates
      this.completionIndex =
        (this.completionIndex + 1) % this.completionCandidates.length;
    }

    if (this.completionCandidates.length === 0) return;

    const completed = this.completionCandidates[this.completionIndex];
    this.chatInput = this.chatInput.slice(0, atIdx) + "@" + completed + " ";
    this.chatTarget = "@" + completed;
    this.tui.requestRender();
  }

  private sendChatMessage(): void {
    if (!this.state.registered) return;

    const text = this.chatInput.trim();
    if (!text) return;

    let message = text;
    let target = this.chatTarget;

    // Парсим @target из начала сообщения
    if (text.startsWith("@")) {
      const spaceIdx = text.indexOf(" ");
      if (spaceIdx > 0) {
        target = text.slice(0, spaceIdx);
        message = text.slice(spaceIdx + 1).trim();
      }
    }

    if (!message) return;

    if (target === "@all") {
      const msgs = messaging.broadcastMessage(this.state, this.dirs, message);
      for (const msg of msgs) {
        this.state.broadcastHistory.push(msg);
        if (this.state.broadcastHistory.length > 50) {
          this.state.broadcastHistory.shift();
        }
      }
    } else {
      const name = target.startsWith("@") ? target.slice(1) : target;
      messaging.sendMessage(this.state, this.dirs, name, message);
    }

    this.chatInput = "";
    this.chatTarget = "@all";
    this.tui.requestRender();
  }
}
