/**
 * Shared breadcrumb display helpers
 *
 * Export nerd font detection, icons, and helper functions used by
 * widget.ts and editor.ts to render the model→folder breadcrumb.
 */
import { basename } from 'node:path';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@mariozechner/pi-tui';

// ═══════════════════════════════════════════════════════════════════════════
// nerd font detection
// ═══════════════════════════════════════════════════════════════════════════

export function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const NERD = hasNerdFonts();

export const ICON_MODEL = NERD ? '\uF4BC' : '';
export const ICON_FOLDER = NERD ? '\uF115' : '';
export const ICON_SESSION = NERD ? '\uF713' : '';
export const SEP = NERD ? '\uf054' : '/';

// ═══════════════════════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════════════════════

export function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

/** hex → ANSI true color (model/folder use hex, not pi theme tokens) */
export function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// breadcrumb data
// ═══════════════════════════════════════════════════════════════════════════

/** Truncate text to max visible width, appending ellipsis if needed. */
function truncateText(text: string, maxLen: number): string {
  if (visibleWidth(text) <= maxLen) return text;
  // shrink until visibleWidth fits, accounting for "…"
  let out = text;
  while (out.length > 1 && visibleWidth(out + '…') > maxLen) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

const SESSION_NAME_MAX = 25;

export interface BreadcrumbData {
  sessionName?: string;  // short truncated session name
  sessionText: string;   // icon + sessionName (empty when no name)
  modelName: string;
  folder: string;
  modelText: string;     // icon + modelName
  folderText: string;    // icon + folder
}

export function getBreadcrumbData(ctx: ExtensionContext | null): BreadcrumbData {
  const cwd = ctx?.cwd ?? process.cwd();
  const folder = basename(cwd) || cwd;
  const modelName = ctx?.model?.name || ctx?.model?.id || 'no-model';
  const rawSessionName = ctx?.sessionManager.getSessionName();
  const sessionName = rawSessionName ? truncateText(rawSessionName, SESSION_NAME_MAX) : undefined;

  return {
    sessionName,
    sessionText: sessionName ? withIcon(ICON_SESSION, sessionName) : '',
    modelName,
    folder,
    modelText: withIcon(ICON_MODEL, modelName),
    folderText: withIcon(ICON_FOLDER, folder),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// breadcrumb info renderer (model → folder, colored)
// ═══════════════════════════════════════════════════════════════════════════

/** Render the «model → folder · SessionName» breadcrumb info string. Optionally append ANSI reset. */
export function renderBreadcrumbInfo(data: BreadcrumbData, theme: Theme, reset = false): string {
  const modelFolder =
    hexFg('#d787af', data.modelText) +
    theme.fg('dim', ` ${SEP} `) +
    hexFg('#00afaf', data.folderText);

  const line = data.sessionText
    ? modelFolder + theme.fg('dim', ' · ') + hexFg('#ffaf5f', data.sessionText)
    : modelFolder;

  return reset ? line + '\x1b[0m' : line;
}
