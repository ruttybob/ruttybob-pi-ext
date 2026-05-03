/**
 * Pi Mesh - Feed Overlay
 *
 * Overlay для activity feed (50% высоты, anchor: center).
 * Scrollable, border, hints, Escape to close.
 */

import { matchesKey, truncateToWidth, Key } from "@mariozechner/pi-tui";
import type { Component, TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { MeshState, Dirs, MeshConfig } from "./types.js";
import * as feed from "./feed.js";
import { topBorder, bottomBorder, contentLine } from "./overlay-helpers.js";

export const MAX_VISIBLE_LINES = 12;

export class FeedOverlay implements Component {
  private scrollOffset = 0;
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
    lines.push(topBorder(width, "Feed", borderColor, this.theme));

    // Контент (обрезаем до MAX_VISIBLE_LINES)
    const content = this.renderFeed(contentWidth);
    const truncated = content.slice(0, MAX_VISIBLE_LINES);
    const maxScroll = Math.max(0, truncated.length - 1);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;
    const visible = truncated.slice(this.scrollOffset);

    for (const line of visible) {
      lines.push(contentLine(line, contentWidth, borderColor));
    }

    this.lastRenderHeight = visible.length;

    // Нижняя рамка с hints
    const hints = " ↑↓:scroll | PgUp/PgDn:page | Esc:close ";
    lines.push(bottomBorder(width, hints, borderColor, this.theme));

    return lines;
  }

  handleInput(data: string): void {
    // Escape закрывает overlay
    if (matchesKey(data, Key.escape)) {
      this.done();
      return;
    }

    // Scroll Up
    if (matchesKey(data, Key.up)) {
      if (this.scrollOffset > 0) {
        this.scrollOffset--;
        this.tui.requestRender();
      }
      return;
    }

    // Scroll Down
    if (matchesKey(data, Key.down)) {
      this.scrollOffset++;
      this.tui.requestRender();
      return;
    }

    // Page Down
    if (matchesKey(data, Key.pageDown)) {
      const pageSize = Math.max(1, this.lastRenderHeight - 2);
      this.scrollOffset += pageSize;
      this.tui.requestRender();
      return;
    }

    // Page Up
    if (matchesKey(data, Key.pageUp)) {
      const pageSize = Math.max(1, this.lastRenderHeight - 2);
      this.scrollOffset -= pageSize;
      if (this.scrollOffset < 0) this.scrollOffset = 0;
      this.tui.requestRender();
      return;
    }
  }

  private renderFeed(width: number): string[] {
    const events = feed.readEvents(this.dirs, this.config.feedRetention);
    if (events.length === 0) {
      return [this.theme.fg("dim", "  No activity yet.")];
    }

    return events
      .reverse()
      .map((event) =>
        truncateToWidth(`  ${feed.formatEvent(event)}`, width)
      );
  }
}
