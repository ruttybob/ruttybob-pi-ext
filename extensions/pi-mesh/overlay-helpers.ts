/**
 * Pi Mesh - Overlay Helpers
 *
 * Общая логика отрисовки рамки (box-drawing chars) для feed и chat overlay.
 */

import { visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

/**
 * Верхняя рамка overlay с заголовком.
 * ┌─ Title ────────────────────┐
 */
export function topBorder(
  width: number,
  title: string,
  borderColor: (s: string) => string,
  theme: Theme,
): string {
  const titleSection = ` ${title} `;
  const titleWidth = visibleWidth(titleSection);
  const dashes = Math.max(0, width - 1 - titleWidth - 1);
  return (
    borderColor("╭") +
    titleSection +
    theme.fg("dim", "─".repeat(dashes)) +
    borderColor("╮")
  );
}

/**
 * Нижняя рамка overlay с hint-строкой.
 * └─ ↑↓:scroll | PgUp/PgDn:page | Esc:close ─┘
 */
export function bottomBorder(
  width: number,
  hints: string,
  borderColor: (s: string) => string,
  theme: Theme,
): string {
  const hintContent = theme.fg("dim", hints);
  const hintWidth = visibleWidth(hintContent);
  const leftDash = theme.fg("dim", "─");
  const rightDashes = Math.max(0, width - 1 - 1 - hintWidth - 1);
  return (
    borderColor("╰") +
    leftDash +
    hintContent +
    theme.fg("dim", "─".repeat(rightDashes)) +
    borderColor("╯")
  );
}

/**
 * Строка контента внутри рамки.
 * │ content padded to width-2 │
 */
export function contentLine(
  line: string,
  contentWidth: number,
  borderColor: (s: string) => string,
): string {
  const lineWidth = visibleWidth(line);
  const padNeeded = Math.max(0, contentWidth - lineWidth);
  return borderColor("│") + line + " ".repeat(padNeeded) + borderColor("│");
}
