import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  readPowerlineSettings,
  writePowerlineSetting,
  writePowerlineSettings,
} from '../../extensions/pi-powerline/settings.js';

const TMP_DIR = join('/tmp', 'pi-powerline-settings-test', String(Date.now()));

beforeEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(join(TMP_DIR, '.pi'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('settings — readPowerlineSettings defaults', () => {
  it('returns defaults when no settings file exists', () => {
    const s = readPowerlineSettings(join(TMP_DIR, 'no-such-dir'));
    expect(s.powerline).toBe(true);
    expect(s.breadcrumb).toBe('inner');
    expect(s.footer).toBe(true);
  });

  it('returns defaults when settings.json is empty', () => {
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), '{}');
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.powerline).toBe(true);
    expect(s.breadcrumb).toBe('inner');
    expect(s.footer).toBe(true);
  });

  it('reads valid values from settings.json', () => {
    const content = JSON.stringify({ powerline: false, breadcrumb: 'top', footer: false });
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), content);
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.powerline).toBe(false);
    expect(s.breadcrumb).toBe('top');
    expect(s.footer).toBe(false);
  });

  it('ignores invalid breadcrumb value and uses default', () => {
    const content = JSON.stringify({ breadcrumb: 'invalid' });
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), content);
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.breadcrumb).toBe('inner');
  });

  it('does NOT include header field in result', () => {
    const s = readPowerlineSettings(TMP_DIR) as any;
    expect(s.header).toBeUndefined();
  });
});

describe('settings — writePowerlineSetting', () => {
  it('writes a single key and preserves others', () => {
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), '{}');
    writePowerlineSetting(TMP_DIR, 'powerline', false);
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.powerline).toBe(false);
    expect(s.footer).toBe(true); // preserved default
  });

  it('writes breadcrumb as string', () => {
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), '{}');
    writePowerlineSetting(TMP_DIR, 'breadcrumb', 'top');
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.breadcrumb).toBe('top');
  });
});

describe('settings — writePowerlineSettings (batch)', () => {
  it('writes multiple keys at once', () => {
    writeFileSync(join(TMP_DIR, '.pi', 'settings.json'), '{}');
    writePowerlineSettings(TMP_DIR, { powerline: false, footer: false });
    const s = readPowerlineSettings(TMP_DIR);
    expect(s.powerline).toBe(false);
    expect(s.footer).toBe(false);
  });
});
