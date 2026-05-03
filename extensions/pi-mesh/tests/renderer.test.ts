import { describe, expect, test } from "bun:test";

/**
 * Standalone replica of the message renderer wrapping logic from index.ts.
 *
 * The renderer now uses wrapTextWithAnsi from pi-tui to word-wrap long lines
 * instead of truncating them with "...". We replicate a simplified version
 * here since the renderer is defined inside the extension factory.
 */
function wrapLine(line: string, width: number): string[] {
  if (!line || line.length <= width) return [line || ""];
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > width) {
    // Try to break at last space within width
    let breakAt = remaining.lastIndexOf(" ", width);
    if (breakAt <= 0) breakAt = width; // no space found, hard break
    result.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining) result.push(remaining);
  return result;
}

describe("renderer wrapping logic", () => {
  test("line shorter than width returns single element", () => {
    const result = wrapLine("hello", 20);
    expect(result).toEqual(["hello"]);
  });

  test("line equal to width returns single element", () => {
    const line = "abcdefghij"; // 10 chars
    const result = wrapLine(line, 10);
    expect(result).toEqual(["abcdefghij"]);
  });

  test("long line is wrapped into multiple lines", () => {
    const line = "the quick brown fox jumps over the lazy dog";
    const result = wrapLine(line, 20);
    // Each wrapped line should be <= 20 chars
    for (const l of result) {
      expect(l.length).toBeLessThanOrEqual(20);
    }
    // All content is preserved (join and compare)
    expect(result.join(" ")).toBe(line);
  });

  test("long line without spaces hard-breaks at width", () => {
    const line = "abcdefghijklmnop"; // 16 chars
    const result = wrapLine(line, 10);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].length).toBeLessThanOrEqual(10);
    expect(result.join("")).toBe(line);
  });

  test("empty line returns single empty string", () => {
    const result = wrapLine("", 20);
    expect(result).toEqual([""]);
  });
});
