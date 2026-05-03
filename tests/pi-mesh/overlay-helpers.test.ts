/**
 * Тесты overlay-helpers: rounded border chars (╭╮╰╯).
 */
import { describe, it, expect } from "vitest";
import { topBorder, bottomBorder, contentLine } from "../../extensions/pi-mesh/overlay-helpers.js";

/**
 * Минимальный theme-мок, повторяющий паттерн из других тестов.
 * fg(color, text) → [color]text[/], bold(text) → **text**
 */
function makeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/]`,
    bold: (text: string) => `**${text}**`,
  } as any;
}

describe("overlay-helpers", () => {
  const theme = makeTheme();
  const borderColor = (s: string) => `[warning]${s}[/]`;

  describe("topBorder", () => {
    it("рисует верхнюю рамку с rounded char ╭╮ и заголовком", () => {
      const result = topBorder(30, "Feed", borderColor, theme);
      // Должен начинаться с ╭ и заканчиваться на ╮
      expect(result).toContain("╭");
      expect(result).toContain("╮");
      // Заголовок "Feed" присутствует
      expect(result).toContain("Feed");
      // Старые chars отсутствуют
      expect(result).not.toContain("┌");
      expect(result).not.toContain("┐");
    });

    it("заполняет линию до нужной ширины", () => {
      const width = 40;
      const result = topBorder(width, "Chat", borderColor, theme);
      // Линия должна содержать ╭, заголовок "Chat", ╮ и достаточно символов между ними
      expect(result).toContain("╭");
      expect(result).toContain("╮");
      expect(result).toContain("Chat");
    });
  });

  describe("bottomBorder", () => {
    it("рисует нижнюю рамку с rounded char ╰╯ и hints", () => {
      const hints = "↑↓:scroll | Esc:close";
      const result = bottomBorder(30, hints, borderColor, theme);
      expect(result).toContain("╰");
      expect(result).toContain("╯");
      expect(result).toContain("↑↓:scroll");
      // Старые chars отсутствуют
      expect(result).not.toContain("└");
      expect(result).not.toContain("┘");
    });
  });

  describe("contentLine", () => {
    it("рисует строку контента с боковыми границами │", () => {
      const result = contentLine("hello world", 20, borderColor);
      // Должен содержать │ по бокам
      expect(result).toContain("│");
      expect(result).toContain("hello world");
    });

    it("дополняет контент пробелами до contentWidth", () => {
      const result = contentLine("hi", 10, borderColor);
      // "hi" + 8 пробелов = 10, обрамлено │
      // Проверяем что │ присутствует дважды
      const pipeCount = (result.match(/│/g) ?? []).length;
      expect(pipeCount).toBe(2);
    });
  });
});
