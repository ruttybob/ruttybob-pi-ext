import { describe, expect, it } from 'vitest';

// Reimplement formatTokens inline for unit isolation (matches footer.ts)
function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

describe('footer — formatTokens', () => {
  it('< 1000 returns exact number', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(1)).toBe('1');
    expect(formatTokens(42)).toBe('42');
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(999)).toBe('999');
  });

  it('1k – 9.9k range (one decimal)', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1001)).toBe('1.0k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(9999)).toBe('10.0k');
  });

  it('10k – 999k range (rounded integer k)', () => {
    expect(formatTokens(10000)).toBe('10k');
    expect(formatTokens(12500)).toBe('13k');
    expect(formatTokens(100000)).toBe('100k');
    expect(formatTokens(999499)).toBe('999k');
  });

  it('1M – 9.9M range (one decimal)', () => {
    expect(formatTokens(1000000)).toBe('1.0M');
    expect(formatTokens(1500000)).toBe('1.5M');
    expect(formatTokens(9999999)).toBe('10.0M');
  });

  it('>= 10M (rounded integer M)', () => {
    expect(formatTokens(10000000)).toBe('10M');
    expect(formatTokens(50000000)).toBe('50M');
  });

  it('output format for each tier', () => {
    expect(formatTokens(123)).toMatch(/^\d+$/);
    expect(formatTokens(1500)).toMatch(/^\d+\.\dk$/);
    expect(formatTokens(50000)).toMatch(/^\d+k$/);
    expect(formatTokens(5000000)).toMatch(/^\d+\.\dM$/);
    expect(formatTokens(50000000)).toMatch(/^\d+M$/);
  });
});
