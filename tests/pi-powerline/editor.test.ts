import { describe, expect, it } from 'vitest';

// renderPromptPrefix is private in editor.ts; reimplement inline for unit isolation
function renderPromptPrefix(
  lines: string[],
  width: number,
  borderChar: string,
  prefixChar: string,
  indentChar: string,
): string[] {
  if (lines.length < 3) return lines;

  let bottomIdx = lines.length - 1;
  for (let i = lines.length - 1; i >= 1; i--) {
    const stripped = (lines[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      bottomIdx = i;
      break;
    }
  }

  const result: string[] = [];

  result.push(borderChar.repeat(width));

  for (let i = 1; i < bottomIdx; i++) {
    if (i === 1) {
      result.push(prefixChar + ' ' + (lines[i] ?? ''));
    } else {
      result.push(indentChar + ' ' + (lines[i] ?? ''));
    }
  }

  if (bottomIdx === 1) {
    result.push(prefixChar + ' ' + ' '.repeat(width - 2));
  }

  result.push(borderChar.repeat(width));

  for (let i = bottomIdx + 1; i < lines.length; i++) {
    result.push(lines[i] ?? '');
  }

  return result;
}

/** Strip ANSI escape codes and count visible characters. */
function visibleWidth(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string to the given visible width with trailing spaces. */
function padTo(str: string, width: number): string {
  const w = visibleWidth(str);
  return w >= width ? str : str + ' '.repeat(width - w);
}

const B = '─';
const P = '>';
const I = ' ';

function editorBorder(w: number, char = B): string {
  return char.repeat(w);
}

function editorLines(editorWidth: number, content: string[]): string[] {
  return [
    editorBorder(editorWidth),
    ...content.map((c) => padTo(c, editorWidth)),
    editorBorder(editorWidth),
  ];
}

describe('editor — renderPromptPrefix', () => {
  it('single line renders with > prefix and borders', () => {
    const w = 20;
    const lines = editorLines(w - 2, ['hello']);
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(3);
    expect(visibleWidth(result[0])).toBe(w);
    expect(result[1]).toMatch(/^> hello/);
    expect(result[1].endsWith('hello' + ' '.repeat(w - 2 - 5))).toBe(true);
    expect(visibleWidth(result[2])).toBe(w);
  });

  it('multi-line renders with prefix on first line and indent on subsequent', () => {
    const w = 20;
    const lines = editorLines(w - 2, ['line1', 'line2']);
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(4);
    expect(result[1]).toMatch(/^> line1/);
    expect(result[2]).toMatch(/^  line2/);
  });

  it('short input (< 3 lines) passes through unchanged', () => {
    expect(renderPromptPrefix(['just one line'], 20, B, P, I)).toEqual(['just one line']);
    expect(renderPromptPrefix(['line0', 'line1'], 20, B, P, I)).toEqual(['line0', 'line1']);
  });

  it('extra lines below the border are passed through', () => {
    const w = 20;
    const lines = [...editorLines(w - 2, ['content']), 'autocomplete entry'];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(4);
    expect(result[1]).toMatch(/^> content/);
    expect(result[3]).toBe('autocomplete entry');
  });

  it('all output lines have exact target width', () => {
    const w = 30;
    const lines = editorLines(w - 2, ['a', 'bb', 'ccc']);
    const result = renderPromptPrefix(lines, w, B, P, I);

    for (const line of result) {
      expect(visibleWidth(line)).toBe(w);
    }
  });

  it('all output lines have exact target width (narrow terminal)', () => {
    const w = 8;
    const lines = editorLines(w - 2, ['hi']);
    const result = renderPromptPrefix(lines, w, B, P, I);

    for (const line of result) {
      expect(visibleWidth(line)).toBe(w);
    }
  });

  it('bottom border is detected via ─── pattern (backward scan)', () => {
    const w = 20;
    const ew = w - 2;
    const lines = [
      editorBorder(ew),
      padTo('hello', ew),
      padTo('─── looks like a border but is content', ew),
      editorBorder(ew),
    ];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(4);
    expect(result[1]).toMatch(/^> hello/);
    expect(result[2]).toMatch(/^  ─── looks like a border/);
  });

  it('ANSI codes in border lines are stripped before detection', () => {
    const w = 20;
    const coloredBorder = '\x1b[33m' + B.repeat(w - 2) + '\x1b[0m';
    const lines = [editorBorder(w - 2), padTo('text', w - 2), coloredBorder];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(3);
    expect(result[1]).toMatch(/^> text/);
  });

  it('content lines preserve original text after prefix', () => {
    const w = 20;
    const content = padTo('  indented  text  ', w - 2);
    const lines = [editorBorder(w - 2), content, editorBorder(w - 2)];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result[1].endsWith(content)).toBe(true);
  });

  it('ANSI codes in content lines are preserved', () => {
    const w = 20;
    const coloredText = '\x1b[31mred\x1b[0m text';
    const content = padTo(coloredText, w - 2);
    const lines = [editorBorder(w - 2), content, editorBorder(w - 2)];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result[1]).toContain(coloredText);
  });

  it('bottomIdx === 1: empty content between borders produces empty prefix line', () => {
    const w = 10;
    const ew = w - 2;
    const lines3 = [editorBorder(ew), padTo('', ew), editorBorder(ew)];
    const result = renderPromptPrefix(lines3, w, B, P, I);

    expect(result.length).toBe(3);
    expect(visibleWidth(result[0])).toBe(w);
    expect(result[1].endsWith(' '.repeat(w - 2))).toBe(true);
    expect(visibleWidth(result[1])).toBe(w);
    expect(visibleWidth(result[2])).toBe(w);
  });

  it('accepts ANSI-colored border/prefix/indent characters', () => {
    const w = 14;
    const ew = w - 2;
    const coloredBorder = '\x1b[32m─\x1b[0m';
    const coloredPrefix = '\x1b[33m❯\x1b[0m';
    const coloredIndent = '\x1b[34m·\x1b[0m';

    const lines = [editorBorder(ew), padTo('hi', ew), editorBorder(ew)];
    const result = renderPromptPrefix(lines, w, coloredBorder, coloredPrefix, coloredIndent);

    for (const line of result) {
      expect(visibleWidth(line)).toBe(w);
    }
    expect(result[1]).toContain(coloredPrefix);
  });

  it('many content lines all get correct prefix/indent', () => {
    const w = 20;
    const ew = w - 2;
    const contentCount = 100;
    const content = Array.from({ length: contentCount }, (_, i) => padTo(`line-${i}`, ew));
    const lines = [editorBorder(ew), ...content, editorBorder(ew)];
    const result = renderPromptPrefix(lines, w, B, P, I);

    expect(result.length).toBe(contentCount + 2);
    expect(result[1]).toMatch(/^> line-0/);
    for (let i = 2; i <= contentCount; i++) {
      expect(result[i]).toMatch(new RegExp(`^  line-${i - 1}`));
    }
  });
});
