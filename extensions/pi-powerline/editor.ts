/**
 * Custom Editor Extension
 *
 * Replaces the default editor with a bordered input area using a ❯ prompt prefix.
 * Switches to bash-mode coloring when the prompt starts with !.
 * Editor is always enabled; breadcrumb mode controls whether widget info is embedded.
 */
import { type EditorTheme, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ThemeColor,
} from '@earendil-works/pi-coding-agent';
import { getBreadcrumbData, SEP } from './breadcrumb.js';
import { hexFg } from './theme.js';
import { readPowerlineSettings } from './settings.js';

/** Pure transform: add > prompt prefix and borders to rendered editor lines. */
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

// live state, updated on enable / model_select
let liveCtx: ExtensionContext | null = null;
let liveEditorTui: any = null;
let breadcrumbMode: string = 'inner';

let currentTheme: Theme | null = null;

/** Maps each editor element to a pi theme color token. */
export interface PromptPrefixColorTokens {
  border?: ThemeColor;
  prefix?: ThemeColor;
  indent?: ThemeColor;
}

/** Custom editor with a ❯ prompt prefix. Colors use `PromptPrefixColorTokens`. */
export class PromptPrefixEditor extends CustomEditor {
  static colorTokens: PromptPrefixColorTokens = {
    border: 'borderAccent',
    prefix: 'dim',
    indent: 'border',
  };

  render(width: number): string[] {
    const contentWidth = Math.max(1, width - 2);
    const lines = super.render(contentWidth);
    if (lines.length < 3) return lines;

    const theme = currentTheme;
    const color = (token: ThemeColor | undefined, text: string) => {
      if (!theme || !token) return text;
      try {
        return theme.fg(token, text);
      } catch {
        return text;
      }
    };

    // Bash mode: when text starts with !, switch to bashMode coloring
    const isBash = this.getText().trimStart().startsWith('!');
    const tokens = isBash
      ? {
          border: 'bashMode' as ThemeColor,
          prefix: 'bashMode' as ThemeColor,
          indent: 'bashMode' as ThemeColor,
        }
      : PromptPrefixEditor.colorTokens;

    const result = renderPromptPrefix(
      lines,
      width,
      color(tokens.border, '─'),
      color(tokens.prefix, '❯'),
      tokens.indent ? color(tokens.indent, ' ') : ' ',
    );

    // Embed widget info (model → folder) into the top border when mode is "inner"
    if (breadcrumbMode === 'inner') {
      const ctx = liveCtx;
      if (ctx && theme) {
        const data = getBreadcrumbData(ctx);
        const borderColored = color(tokens.border, '─');

        // Left part: model → folder
        const leftPart =
          hexFg('#d787af', data.modelText) +
          theme.fg('dim', ' ' + SEP + ' ') +
          hexFg('#00afaf', data.folderText);
        const leftWidth = visibleWidth(leftPart);

        if (data.sessionText) {
          // Right part: session name
          const rightPart = hexFg('#ffaf5f', data.sessionText);
          const rightWidth = visibleWidth(rightPart);
          const separator = theme.fg('dim', ' ');
          const sepWidth = visibleWidth(separator);

          const totalContentWidth = leftWidth + sepWidth + rightWidth;
          let dashesLen = width - 5 - totalContentWidth;

          if (dashesLen < 2) {
            // Not enough space — truncate session name
            const availForSession = width - 5 - leftWidth - sepWidth;
            if (availForSession > 1) {
              const truncatedSession = truncateToWidth(data.sessionText, availForSession, '…');
              const truncatedRight = data.sessionText !== truncatedSession
                ? hexFg('#ffaf5f', truncatedSession)
                : rightPart;
              const truncatedWidth = visibleWidth(truncatedSession);
              dashesLen = width - 5 - leftWidth - sepWidth - truncatedWidth;
              result[0] =
                borderColored + ' ' + leftPart + ' ' + color(tokens.border, '─'.repeat(Math.max(0, dashesLen))) + separator + truncatedRight + ' ' + borderColored;
            } else {
              // Very narrow — just left part
              dashesLen = width - 3 - leftWidth;
              result[0] =
                borderColored + ' ' + leftPart + ' ' + color(tokens.border, '─'.repeat(Math.max(0, dashesLen)));
            }
          } else {
            result[0] =
              borderColored + ' ' + leftPart + ' ' + color(tokens.border, '─'.repeat(dashesLen)) + separator + rightPart + ' ' + borderColored;
          }
        } else {
          // No session name — just left part
          let dashesLen = width - 3 - leftWidth;
          if (dashesLen < 2) {
            const availForInfo = width - 5;
            const truncatedLeft = availForInfo > 0
              ? truncateToWidth(leftPart, availForInfo, '...')
              : leftPart;
            dashesLen = width - 3 - visibleWidth(truncatedLeft);
            result[0] =
              borderColored + ' ' + truncatedLeft + ' ' + color(tokens.border, '─'.repeat(Math.max(0, dashesLen)));
          } else {
            result[0] =
              borderColored + ' ' + leftPart + ' ' + color(tokens.border, '─'.repeat(dashesLen));
          }
        }
      }
    }

    return result;
  }
}

export function updateTheme(theme: Theme): void {
  currentTheme = theme;
}

/** Register the custom editor extension. Controlled by powerline master switch + breadcrumb mode. */
export function registerEditor(pi: ExtensionAPI) {
  let editorEnabled = false;

  function createEditorFactory() {
    return (tui: any, theme: EditorTheme, keybindings: any) => {
      liveEditorTui = tui;
      return new PromptPrefixEditor(tui, theme, keybindings);
    };
  }

  function enable(ctx: ExtensionContext) {
    editorEnabled = true;
    liveCtx = ctx;
    currentTheme = ctx.ui.theme;
    breadcrumbMode = readPowerlineSettings(ctx.cwd).breadcrumb;
    ctx.ui.setEditorComponent(createEditorFactory());
  }

  function disable(ctx: ExtensionContext) {
    editorEnabled = false;
    liveEditorTui = null;
    ctx.ui.setEditorComponent(undefined);
  }

  pi.on('session_start', (_event, ctx) => {
    if (readPowerlineSettings(ctx.cwd).powerline) {
      enable(ctx);
    }
  });

  pi.on('model_select', (_event, ctx) => {
    liveCtx = ctx;
    breadcrumbMode = readPowerlineSettings(ctx.cwd).breadcrumb;
    liveEditorTui?.requestRender();
  });

  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    breadcrumbMode = s.breadcrumb;
    liveCtx = c;
    if (s.powerline && !editorEnabled) {
      enable(c);
    } else if (!s.powerline && editorEnabled) {
      disable(c);
    } else if (editorEnabled) {
      liveEditorTui?.requestRender();
    }
  });
}
