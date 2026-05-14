import { describe, expect, it } from 'vitest';
import {
  ICON_FOLDER,
  ICON_MODEL,
  renderBreadcrumbInfo,
  SEP,
  withIcon,
} from '../../extensions/pi-powerline/breadcrumb.js';
import { hexFg } from '../../extensions/pi-powerline/theme.js';

describe('breadcrumb — withIcon', () => {
  it('returns icon + space + text when icon is given', () => {
    expect(withIcon('\uEC19', 'my-model')).toBe('\uEC19 my-model');
    expect(withIcon('\uF115', 'src')).toBe('\uF115 src');
  });

  it('returns text only when icon is empty', () => {
    expect(withIcon('', 'my-model')).toBe('my-model');
    expect(withIcon('', 'dir')).toBe('dir');
  });
});

describe('breadcrumb — hexFg', () => {
  it('generates ANSI true color escape sequence', () => {
    expect(hexFg('#d787af', 'hello')).toBe('\x1b[38;2;215;135;175mhello');
    expect(hexFg('#00afaf', 'world')).toBe('\x1b[38;2;0;175;175mworld');
    expect(hexFg('#ffffff', 'white')).toBe('\x1b[38;2;255;255;255mwhite');
    expect(hexFg('#000000', 'black')).toBe('\x1b[38;2;0;0;0mblack');
  });

  it('works without # prefix', () => {
    expect(hexFg('d787af', 'hello')).toBe('\x1b[38;2;215;135;175mhello');
  });

  it('handles uppercase hex', () => {
    expect(hexFg('#FF00FF', 'mag')).toBe('\x1b[38;2;255;0;255mmag');
  });
});

describe('breadcrumb — renderBreadcrumbInfo', () => {
  /** Minimal theme stub */
  function makeTheme() {
    return {
      fg(color: string, text: string): string {
        return `{${color}}${text}{/}`;
      },
      bold(text: string): string {
        return text;
      },
    };
  }

  it('includes model name in magenta', () => {
    const theme = makeTheme();
    const data = {
      modelName: 'claude-sonnet',
      folder: 'myproj',
      modelText: withIcon(ICON_MODEL, 'claude-sonnet'),
      folderText: withIcon(ICON_FOLDER, 'myproj'),
    };
    const line = renderBreadcrumbInfo(data, theme, true);
    const expectText = ICON_MODEL ? `${ICON_MODEL} claude-sonnet` : 'claude-sonnet';
    expect(line).toContain(`\x1b[38;2;215;135;175m${expectText}`);
  });

  it('includes folder in cyan', () => {
    const theme = makeTheme();
    const data = {
      modelName: 'm1',
      folder: 'src',
      modelText: withIcon(ICON_MODEL, 'm1'),
      folderText: withIcon(ICON_FOLDER, 'src'),
    };
    const line = renderBreadcrumbInfo(data, theme, true);
    expect(line).toContain('\x1b[38;2;0;175;175m');
    const expectText = ICON_FOLDER ? `${ICON_FOLDER} src` : 'src';
    expect(line).toContain(expectText);
  });

  it('includes dim separator', () => {
    const theme = makeTheme();
    const data = {
      modelName: 'm',
      folder: 'f',
      modelText: 'm',
      folderText: 'f',
    };
    const line = renderBreadcrumbInfo(data, theme, false);
    expect(line).toContain(`{dim} ${SEP} {/}`);
  });

  it('output ends with ANSI reset when reset=true', () => {
    const theme = makeTheme();
    const data = { modelName: 'm', folder: 'f', modelText: 'm', folderText: 'f' };
    const line = renderBreadcrumbInfo(data, theme, true);
    expect(line.endsWith('\x1b[0m')).toBe(true);
  });

  it('output does NOT end with ANSI reset when reset=false', () => {
    const theme = makeTheme();
    const data = { modelName: 'm', folder: 'f', modelText: 'm', folderText: 'f' };
    const line = renderBreadcrumbInfo(data, theme, false);
    expect(line.endsWith('\x1b[0m')).toBe(false);
  });

  it('structure: model → sep → folder', () => {
    const theme = makeTheme();
    const data = {
      modelName: 'MODEL',
      folder: 'DIR',
      modelText: 'MODEL',
      folderText: 'DIR',
    };
    const line = renderBreadcrumbInfo(data, theme, true);
    const modelIdx = line.indexOf('MODEL');
    const sepIdx = line.indexOf(`{dim} ${SEP} {/}`);
    const dirIdx = line.indexOf('DIR');
    expect(modelIdx).toBeLessThan(sepIdx);
    expect(sepIdx).toBeLessThan(dirIdx);
  });
});
