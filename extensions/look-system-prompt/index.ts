/**
 * System Prompt Viewer — Pi Extension
 *
 * Command: /system-prompt
 * Opens a full-screen overlay showing the current effective system prompt
 * and tool schemas with tab navigation and markdown rendering.
 *
 * Tabs: System Prompt | Mode Preview | Active Tools | Tool Schemas (←→ to switch)
 * Mode Preview: shows what the active mode/preset will inject before the next LLM call.
 * Tool tabs: Enter to expand/collapse individual tools.
 *
 * Install: copy to ~/.pi/agent/extensions/look-system-prompt/index.ts
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  Key,
  matchesKey,
  Markdown,
  visibleWidth,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import type { MarkdownTheme } from '@earendil-works/pi-tui';

// ============================================================================
// Constants
// ============================================================================

/** All possible tab labels. */
export const ALL_TABS = ['System Prompt', 'Injections', 'Mode Preview', 'Codemap', 'Active Tools', 'Tool Schemas'] as const;

/**
 * Build the tab list based on which extensions are active.
 * - "Mode Preview" is excluded when modes extension is not active.
 * - "Codemap" is excluded when pi-compass is not active.
 * - "Injections" is excluded when no injections detected.
 */
export function getTabs(modesActive: boolean, compassActive = false, hasInjections = false): string[] {
  const exclude = new Set<string>();
  if (!modesActive) exclude.add('Mode Preview');
  if (!compassActive) exclude.add('Codemap');
  if (!hasInjections) exclude.add('Injections');
  return (ALL_TABS as readonly string[]).filter(t => !exclude.has(t));
}
/** Lines reserved for border, title, tab bar, hint, and separator. */
const RESERVED_LINES = 6;
/** Heuristic: ~4 characters per token (rough average across tokenizers). */
const CHAR_PER_TOKEN = 4;
/** ANSI red foreground. */
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
/** ANSI yellow foreground. */
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;

type ToolInfo = { name: string; description: string; parameters?: any; sourceInfo?: any };

/** Injection info reported by extensions via pi.events.emit("system-prompt:injection", ...). */
export interface InjectionInfo {
  source: string;
  label: string;
  charCount: number;
  preview: string;
  fullContent?: string;
}

/** Diff-based injection detected by comparing before/after system prompts. */
export interface DiffInjection {
  content: string;
  charCount: number;
}

/** Real context usage from the last LLM call (provider-reported). */
interface ContextUsage {
  tokens: number;
  contextWindow: number;
  percent: number;
}

/** Breakdown of estimated tokens for the full system prompt payload. */
export interface TokenBreakdown {
  total: number;
  sys: number;
  mode: number;
  codemap: number;
  tools: number;
}

/** Injection state from pi-compass (may be null if compass is absent). */
interface CompassInjectionState {
  enabled: boolean;
  hasCodemap: boolean;
  projectName: string | null;
}

/** Codemap content from pi-compass (may be null if compass is absent). */
interface CompassCodemapData {
  markdown: string;
  projectName: string;
  stale: boolean;
}

// ============================================================================
// Mode resolution (self-contained, no dependency on modes extension)
// ============================================================================

interface PresetDefinition {
  description?: string;
  instructions?: string;
  tools?: string[];
  aliases?: string[];
  color?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  defaultProvider?: string;
  defaultModel?: string;
}

export interface ResolvedMode {
  name: string | null;
  preset?: PresetDefinition;
  activeTools: string[];
}

/**
 * Load presets from global (~/.pi/agent/presets.json) and project (.pi/presets.json).
 * Minimal implementation — no validation, no aliases resolution, no wildcards.
 */
function loadPresetsSimple(cwd: string): Record<string, PresetDefinition> {
  const { existsSync, readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  const merged: Record<string, PresetDefinition> = {};

  const agentDir = process.env.PI_CODING_AGENT_DIR
    ?? join(process.env.HOME ?? '/root', '.pi', 'agent');

  for (const dir of [agentDir, cwd]) {
    const path = join(dir, 'presets.json');
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        Object.assign(merged, parsed);
      }
    } catch {
      // Silently skip broken preset files
    }
  }

  return merged;
}

/**
 * Resolve the current active mode by reading modes-state from branch entries.
 */
function resolveCurrentMode(
  sessionManager: any,
  cwd: string,
  pi: ExtensionAPI,
  fallbackModeName?: string | null,
): ResolvedMode {
  const branch = sessionManager.getBranch?.() ?? sessionManager.getEntries?.() ?? [];
  let modeName: string | null = null;

  for (const entry of branch) {
    if (entry.type === 'custom' && entry.customType === 'modes-state') {
      const data = entry.data as { name: string | null } | undefined;
      if (data && (typeof data.name === 'string' || data.name === null)) {
        modeName = data.name;
      }
    }
  }

  // Fallback: use preset name from modes:active event when session branch
  // has no modes-state entry (e.g. after restart with getLastPreset()).
  if (modeName === null && fallbackModeName) {
    modeName = fallbackModeName;
  }

  const activeTools = pi.getActiveTools();

  if (!modeName) {
    return { name: null, activeTools };
  }

  const presets = loadPresetsSimple(cwd);
  const preset = presets[modeName];

  return {
    name: modeName,
    preset,
    activeTools,
  };
}

/**
 * Build the text that the modes extension will inject via `before_agent_start`.
 * Mirrors the exact format from extensions/modes/index.ts.
 */
export function buildModeInjection(mode: ResolvedMode): string {
  if (!mode.name) return '';

  const sections: string[] = [
    `Current mode: ${mode.name}`,
    `Enabled tools: ${mode.activeTools.length > 0 ? mode.activeTools.join(', ') : '(none)'}`,
    mode.preset?.instructions?.trim(),
  ].filter((s): s is string => Boolean(s));

  return sections.join('\n\n');
}

/**
 * Estimate the total tokens that will be sent as part of the system prompt payload.
 *
 * Sums: base system prompt + mode injection (if not already in prompt)
 * + codemap injection (if not already in prompt) + tool schemas (OpenAI format).
 *
 * Detects already-injected content via marker strings to avoid double-counting:
 * - Mode: `Current mode:` substring
 * - Codemap: `## Codebase Map:` substring
 *
 * @param promptText    - Current system prompt text (may include prior injections).
 * @param mode          - Resolved mode (null name = no mode active).
 * @param compassCodemap - Codemap data from pi-compass (null = no codemap).
 * @param activeTools   - Active tool definitions for schema estimation.
 * @returns TokenBreakdown with per-component breakdown and total.
 */
export function estimateTotalTokens(
  promptText: string | undefined,
  mode: ResolvedMode,
  compassCodemap: CompassCodemapData | null,
  activeTools: ToolInfo[],
): TokenBreakdown {
  const sysChars = (promptText ?? '').length;
  const sysTokens = Math.ceil(sysChars / CHAR_PER_TOKEN);

  // Mode injection — skip if already present in prompt
  const modeInjection = mode.name ? buildModeInjection(mode) : '';
  const modeAlreadyInjected = promptText?.includes(`Current mode: ${mode.name}`) ?? false;
  const modeTokens = modeAlreadyInjected ? 0 : Math.ceil(modeInjection.length / CHAR_PER_TOKEN);

  // Codemap injection — skip if already present in prompt
  const codemapMd = compassCodemap?.markdown ?? '';
  const codemapAlreadyInjected = promptText?.includes('## Codebase Map:') ?? false;
  const codemapTokens = codemapAlreadyInjected ? 0 : Math.ceil(codemapMd.length / CHAR_PER_TOKEN);

  // Tool schemas: full OpenAI format per active tool
  // Pi sends: {type:"function", function:{name, description, parameters}}
  let toolChars = 0;
  for (const tool of activeTools) {
    const schema = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? {},
      },
    };
    toolChars += JSON.stringify(schema).length;
  }
  const toolTokens = Math.ceil(toolChars / CHAR_PER_TOKEN);

  return {
    total: sysTokens + modeTokens + codemapTokens + toolTokens,
    sys: sysTokens,
    mode: modeTokens,
    codemap: codemapTokens,
    tools: toolTokens,
  };
}

// ============================================================================
// SystemPromptViewer Component
// ============================================================================

/**
 * SystemPromptViewer — TUI component that renders the system prompt,
 * mode preview, tool schemas, and active tools in a scrollable full-screen overlay with tabs.
 *
 * Tabs: System Prompt | Mode Preview | Active Tools | Tool Schemas (←→ to switch).
 * Tool tabs: Enter to expand/collapse individual tools.
 */
class SystemPromptViewer {
	/** Current vertical scroll offset in the content area. */
	private scrollOffset = 0;
	/** Cursor position within the visible viewport. */
	private selected = 0;
	/** Total rendered content lines (recomputed on each render). */
	private totalLines: string[] = [];
	private cachedWidth?: number;
	private renderedLines?: string[];
	private disposed = false;

	private promptMd: Markdown;
	private modeMd: Markdown;
	private compassMd: Markdown;
	private injectionsMd: Markdown;
	/** Currently active tab index (0..tabs.length-1). */
	private currentTab = 0;
	/** Index of the expanded tool, or -1 for list mode. */
	private expandedToolIndex = -1;

	/** Pre-computed total token estimate for the full system prompt payload. */
	private tokenBreakdown: TokenBreakdown;

	/** Number of breakdown lines rendered in the last render call (for layout calc). */
	private breakdownLineCount = 0;

	/** Resolved mode data for the Mode Preview tab. */
	private mode: ResolvedMode;

	/** Provider-reported context usage (from getContextUsage()). May be null. */
	private contextUsage: ContextUsage | null;

	/** Active tool count for accurate tool schema estimation. */
	private activeToolCount: number;

	/** Tab labels for this viewer instance (dynamic based on modes extension). */
	private tabs: string[];

	/** Injection state from pi-compass (null if compass is absent/disabled). */
	private compassState: CompassInjectionState | null;

	/** Codemap content from pi-compass (null if no codemap generated yet). */
	private compassCodemap: CompassCodemapData | null;

	/** Cooperative injection info from other extensions (via system-prompt:injection event). */
	private reportedInjections: Map<string, InjectionInfo>;

	/** Diff-based injections: unknown content appended by before_agent_start handlers. */
	private diffInjections: DiffInjection[];

	/**
	 * @param promptText      - Raw system prompt text (may be undefined).
	 * @param tools           - All registered tool definitions.
	 * @param activeTools     - Subset of tools that are currently active.
	 * @param mode            - Resolved current mode/preset.
	 * @param contextUsage    - Provider-reported context usage, or null.
	 * @param theme           - Pi theme object for styling.
	 * @param done            - Callback to close the overlay.
	 * @param termHeight      - Terminal height in rows.
	 */
	constructor(
		private promptText: string | undefined,
		private tools: ToolInfo[],
		private activeTools: ToolInfo[],
		mode: ResolvedMode,
		contextUsage: ContextUsage | null,
		private theme: any,
		private done: () => void,
		private termHeight: number,
		modesActive: boolean,
		compassState: CompassInjectionState | null,
		compassCodemap: CompassCodemapData | null,
		reportedInjections: Map<string, InjectionInfo>,
		diffInjections: DiffInjection[],
	) {
		const hasPrompt = promptText && promptText.length > 0;
		this.promptMd = hasPrompt
			? new Markdown(promptText, 1, 0, this.buildMdTheme())
			: new Markdown('*No system prompt sent yet. Send a message to the agent first.*', 1, 0, this.buildMdTheme());
		this.tokenBreakdown = estimateTotalTokens(promptText, mode, compassCodemap, activeTools);
		this.contextUsage = contextUsage;
		this.activeToolCount = activeTools.length;

		// Build Mode Preview markdown
		const injectionText = buildModeInjection(mode);
		let modeMdContent: string;
		if (!mode.name) {
			modeMdContent = '*No active mode/preset.*\n\nUse `/modes` to see available presets or `/preset <name>` to activate one.';
		} else {
			modeMdContent = `## Active Mode: ${mode.name}\n\n`;
			if (mode.preset?.description) {
				modeMdContent += `> ${mode.preset.description}\n\n`;
			}
			modeMdContent += `### What will be injected into the system prompt\n\n`;
			modeMdContent += '```' + '\n' + injectionText + '\n' + '```' + '\n\n';

			const hasPrompt = promptText && promptText.length > 0;
			if (hasPrompt && promptText!.includes(`Current mode: ${mode.name}`)) {
				modeMdContent += '*✓ This injection is already included in the cached system prompt.*\n';
			} else if (hasPrompt) {
				modeMdContent += '*⚠ The cached system prompt does NOT yet reflect this mode. Send a message to update it.*\n';
			} else {
				modeMdContent += '*ℹ No system prompt cached yet. This preview shows what will be sent on the next message.*\n';
			}

			// Preset details
			if (mode.preset) {
				const details: string[] = [];
				if (mode.preset.provider && mode.preset.model) {
					details.push(`- **Model:** ${mode.preset.provider}/${mode.preset.model}`);
				}
				if (mode.preset.thinkingLevel) {
					details.push(`- **Thinking:** ${mode.preset.thinkingLevel}`);
				}
				if (mode.preset.tools) {
					details.push(`- **Tool patterns:** ${mode.preset.tools.join(', ')}`);
				}
				if (details.length > 0) {
					modeMdContent += '\n### Preset Configuration\n\n' + details.join('\n') + '\n';
				}
			}
		}
		this.modeMd = new Markdown(modeMdContent, 1, 0, this.buildMdTheme());
		this.mode = mode;
		this.compassState = compassState;
		this.compassCodemap = compassCodemap;

		// Build Codemap markdown
		const compassMdContent = this.buildCodemapContent();
		this.compassMd = new Markdown(compassMdContent, 1, 0, this.buildMdTheme());

		this.reportedInjections = reportedInjections;
		this.diffInjections = diffInjections;

		// Build Injections markdown
		const injectionsMdContent = this.buildInjectionsContent();
		this.injectionsMd = new Markdown(injectionsMdContent, 1, 0, this.buildMdTheme());

		const compassActive = compassState !== null || compassCodemap !== null;
		const hasInjections = reportedInjections.size > 0 || diffInjections.length > 0;
		this.tabs = getTabs(modesActive, compassActive, hasInjections);
	}

	/** Check if the current tab matches a given label. */
	private isTab(label: string): boolean {
		return this.tabs[this.currentTab] === label;
	}

	/** Build markdown content for the Codemap tab. */
	private buildCodemapContent(): string {
		if (!this.compassCodemap && (!this.compassState || !this.compassState.hasCodemap)) {
			return '*No codemap available.*\n\nRun `/onboard` to generate a codemap for this project.';
		}

		const parts: string[] = [];

		// Header
		const projName = this.compassCodemap?.projectName ?? this.compassState?.projectName ?? 'unknown';
		parts.push(`## Codemap: ${projName}\n`);

		// Status
		if (this.compassState?.enabled && this.compassState.hasCodemap) {
			parts.push('> ✓ This codemap is injected into the system prompt.\n');
		} else if (this.compassState?.enabled && !this.compassState.hasCodemap) {
			parts.push('> ⏳ Codemap injection is enabled but no codemap is available.\n');
		} else if (this.compassState && !this.compassState.enabled) {
			parts.push('> ⚠ Codemap injection is disabled. Run `/onboard on` to enable.\n');
		}

		// Stale warning
		if (this.compassCodemap?.stale) {
			parts.push('> ⚠ Codemap may be stale — it was generated for an earlier state of the project.\n');
		}

		// Codemap markdown
		if (this.compassCodemap?.markdown) {
			parts.push(this.compassCodemap.markdown);
		}

		return parts.join('\n');
	}

	/** Build markdown content for the Injections tab. */
	private buildInjectionsContent(): string {
		const parts: string[] = [];

		const reported = Array.from(this.reportedInjections.values());
		const diffed = this.diffInjections;

		if (reported.length === 0 && diffed.length === 0) {
			return '*No injections detected yet.*\n\n'
				+ 'Injections appear when extensions modify the system prompt via `before_agent_start`.\n\n'
				+ 'Extensions can report injections by emitting:\n'
				+ '`pi.events.emit("system-prompt:injection", { source, label, charCount, preview, fullContent })`';
		}

		// Summary
		const totalReported = reported.reduce((sum, i) => sum + i.charCount, 0);
		const totalDiffed = diffed.reduce((sum, i) => sum + i.charCount, 0);
		const totalChars = totalReported + totalDiffed;
		parts.push(`## Injections Overview\n`);
		parts.push(`**Total injected:** ${totalChars.toLocaleString()} chars (~${Math.ceil(totalChars / CHAR_PER_TOKEN).toLocaleString()} tokens)\n`);

		// Reported injections (cooperative)
		if (reported.length > 0) {
			parts.push('### Reported by extensions\n');
			for (const inj of reported) {
				parts.push(`#### ${inj.label} (${inj.source})`);
				parts.push(`**Size:** ${inj.charCount.toLocaleString()} chars (~${Math.ceil(inj.charCount / CHAR_PER_TOKEN).toLocaleString()} tokens)\n`);
				if (inj.fullContent) {
					parts.push('<details>\n```\n' + inj.fullContent + '\n```\n</details>\n');
				} else if (inj.preview) {
					parts.push('```\n' + inj.preview + (inj.charCount > inj.preview.length ? '\n...' : '') + '\n```\n');
				}
			}
		}

		// Diff-based injections (unattributed)
		if (diffed.length > 0) {
			parts.push('### Unattributed (diff-detected)\n');
			for (let i = 0; i < diffed.length; i++) {
				const inj = diffed[i];
				parts.push(`#### Injection #${i + 1}`);
				parts.push(`**Size:** ${inj.charCount.toLocaleString()} chars (~${Math.ceil(inj.charCount / CHAR_PER_TOKEN).toLocaleString()} tokens)\n`);
				parts.push('```\n' + inj.content.slice(0, 500) + (inj.charCount > 500 ? '\n...' : '') + '\n```\n');
			}
		}

		return parts.join('\n');
	}

	/** Build a MarkdownTheme object from the current pi theme. */
	private buildMdTheme(): MarkdownTheme {
    const t = this.theme;
    return {
      heading: (s: string) => t.fg('mdHeading', s),
      bold: (s: string) => t.fg('accent', t.bold(s)),
      italic: (s: string) => t.fg('muted', s),
      code: (s: string) => t.fg('mdCode', s),
      codeBlock: (s: string) => t.fg('mdCodeBlock', s),
      codeBlockBorder: (s: string) => t.fg('mdCodeBlockBorder', s),
      link: (s: string) => t.fg('mdLink', s),
      linkUrl: (s: string) => t.fg('mdLinkUrl', s),
      quote: (s: string) => t.fg('mdQuote', s),
      quoteBorder: (s: string) => t.fg('mdQuoteBorder', s),
      hr: (s: string) => t.fg('mdHr', s),
      listBullet: (s: string) => t.fg('mdListBullet', s),
      strikethrough: (s: string) => t.fg('dim', s),
      underline: (s: string) => `\u001b[4m${s}\u001b[24m`,
    };
  }

  // --------------------------------------------------------------------------
  // Tool list / detail rendering
  //--------------------------------------------------------------------------

	/** Get the tool list appropriate for the current tab (all tools or active only). */
	private getToolsForTab(): ToolInfo[] {
    return this.isTab('Active Tools') ? this.activeTools : this.tools;
  }

	/** Build collapsed list lines: one styled line per tool. */
	private buildToolListLines(): string[] {
    const t = this.theme;
    const tools = this.getToolsForTab();

    if (tools.length === 0) return [t.fg('muted', 'No tools.')];

    return tools.map(tool => {
      let line = t.fg('mdHeading', t.bold(tool.name));
      if (tool.sourceInfo?.source) {
        line += ' ' + t.fg('dim', `(${tool.sourceInfo.source}` +
          (tool.sourceInfo.scope ? ` · ${tool.sourceInfo.scope}` : '') + ')');
      }
      return line;
    });
  }

	/**
	 * Build expanded detail lines for a single tool with full markdown rendering.
	 *
	 * @param width - Content width for markdown wrapping.
	 */
	private buildToolDetailLines(width: number): string[] {
    const tools = this.getToolsForTab();
    const tool = tools[this.expandedToolIndex];
    if (!tool) return [];

    let md = `## ${tool.name}\n\n`;
    if (tool.sourceInfo?.source) {
      md += `*Source: ${tool.sourceInfo.source}`;
      if (tool.sourceInfo.scope) md += ` · ${tool.sourceInfo.scope}`;
      md += '*\n\n';
    }

    md += `${tool.description}\n\n`;

    if (tool.parameters) {
      md += '**Parameters:**\n\n';
      md += '```json\n' + JSON.stringify(tool.parameters, null, 2) + '\n```\n\n';
    } else {
      md += '*No parameters.*\n\n';
    }

    const renderer = new Markdown(md, 1, 0, this.buildMdTheme());
    return renderer.render(width);
  }

  // --------------------------------------------------------------------------
  // Input handling
  //--------------------------------------------------------------------------

	/**
	 * Process a raw terminal input sequence.
	 *
	 * @param data - Raw escape sequence from stdin.
	 */
	handleInput(data: string): void {
    if (this.disposed) return;

    if (matchesKey(data, 'escape') || data === 'q') {
      this.disposed = true;
      this.done();
      return;
    }

    // Tab switching
    if (matchesKey(data, Key.left)) {
      this.currentTab = (this.currentTab - 1 + this.tabs.length) % this.tabs.length;
      this.scrollOffset = 0;
      this.selected = 0;
      this.expandedToolIndex = -1;
      return;
    }

    if (matchesKey(data, Key.right)) {
      this.currentTab = (this.currentTab + 1) % this.tabs.length;
      this.scrollOffset = 0;
      this.selected = 0;
      this.expandedToolIndex = -1;
      return;
    }

    // Enter: expand / collapse tool (only on Active Tools / Tool Schemas tabs)
    if (matchesKey(data, Key.enter)) {
      if (this.isTab('Active Tools') || this.isTab('Tool Schemas')) {
        const maxVisible = this.getMaxVisible();
        if (this.expandedToolIndex >= 0) {
          // Collapse — return to list, cursor on same tool
          const toolIdx = this.expandedToolIndex;
          this.expandedToolIndex = -1;
          this.scrollOffset = Math.max(0, toolIdx - Math.floor(maxVisible / 2));
          this.selected = toolIdx - this.scrollOffset;
          if (this.selected >= maxVisible) {
            this.scrollOffset = toolIdx - maxVisible + 1;
            this.selected = maxVisible - 1;
          }
        } else {
          // Expand — enter detail view
          this.expandedToolIndex = this.scrollOffset + this.selected;
          this.scrollOffset = 0;
          this.selected = 0;
        }
        return;
      }
    }

    const maxVisible = this.getMaxVisible();

    if (matchesKey(data, 'up')) {
      if (this.selected > 0) {
        this.selected--;
      } else if (this.scrollOffset > 0) {
        this.scrollOffset--;
      }
      return;
    }

    if (matchesKey(data, 'down')) {
      if (this.selected < maxVisible - 1 && this.selected < this.totalLines.length - 1) {
        this.selected++;
      } else if (this.scrollOffset + maxVisible < this.totalLines.length) {
        this.scrollOffset++;
      }
      return;
    }

    // Half-page scroll
    const halfPage = Math.max(1, Math.floor(maxVisible / 2));

    if (matchesKey(data, 'pageUp')) {
      this.scrollOffset = Math.max(0, this.scrollOffset - halfPage);
      this.selected = Math.min(this.selected, maxVisible - 1);
      return;
    }

    if (matchesKey(data, 'pageDown')) {
      const max = this.totalLines.length - maxVisible;
      this.scrollOffset = Math.min(Math.max(0, max), this.scrollOffset + halfPage);
      this.selected = Math.min(this.selected, maxVisible - 1);
      return;
    }

    if (matchesKey(data, 'home')) {
      this.scrollOffset = 0;
      this.selected = 0;
      return;
    }

    if (matchesKey(data, 'end')) {
      const max = Math.max(0, this.totalLines.length - maxVisible);
      this.scrollOffset = max;
      this.selected = Math.min(maxVisible - 1, this.totalLines.length - maxVisible - 1);
      return;
    }
  }

	/**
	 * Maximum number of visible content lines (terminal height minus reserved chrome).
	 * @returns Number of visible content lines (at least 1).
	 */
	private getMaxVisible(): number {
    return Math.max(1, this.termHeight - RESERVED_LINES - this.breakdownLineCount);
  }

  // --------------------------------------------------------------------------
  // Render
  //--------------------------------------------------------------------------

	/**
	 * Render the full viewer overlay.
	 *
	 * @param width - Terminal width in columns.
	 * @returns Array of pre-styled lines.
	 */
	render(width: number): string[] {
    const t = this.theme;

    // Build content lines
    const innerW = Math.max(20, width - 2);
    const contentW = innerW - 2; // 1 padding each side

    if (this.isTab('System Prompt')) {
      this.totalLines = [...this.promptMd.render(contentW), '', ''];
    } else if (this.isTab('Injections')) {
      this.totalLines = [...this.injectionsMd.render(contentW), '', ''];
    } else if (this.isTab('Mode Preview')) {
      this.totalLines = [...this.modeMd.render(contentW), '', ''];
    } else if (this.isTab('Codemap')) {
      this.totalLines = [...this.compassMd.render(contentW), '', ''];
    } else if (this.expandedToolIndex >= 0) {
      this.totalLines = this.buildToolDetailLines(contentW);
    } else {
      this.totalLines = this.buildToolListLines();
    }

    this.cachedWidth = width;

    const maxVisible = this.getMaxVisible();
    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + ' '.repeat(Math.max(0, len - vis));
    };
    const row = (content: string) =>
      red('│') + pad(content, innerW) + red('│');

    const lines: string[] = [];

    // Header — top border
    lines.push(red(`╭${'─'.repeat(innerW)}╮`));

    // Title line with stats
    const tabName = this.tabs[this.currentTab];
    let titleLabel = tabName;
    if ((this.isTab('Active Tools') || this.isTab('Tool Schemas')) && this.expandedToolIndex >= 0) {
      const tools = this.getToolsForTab();
      const tool = tools[this.expandedToolIndex];
      if (tool) titleLabel = `${tabName} ▸ ${tool.name}`;
    }

    const title = ` ${t.fg('accent', t.bold(titleLabel))}`;
    lines.push(row(title));

    // Tab bar
    let tabBar = ' ';
    for (let i = 0; i < this.tabs.length; i++) {
      const isActive = i === this.currentTab;
      const label = this.tabs[i];
      if (isActive) {
        tabBar += t.bg('selectedBg', t.fg('text', ` ▸ ${label} `)) + ' ';
      } else {
        tabBar += t.fg('dim', `   ${label} `) + ' ';
      }
    }

    // --- Tab bar line ---
    lines.push(row(tabBar));

    // --- Token breakdown display (below tab bar, each component on its own line) ---
    const tb = this.tokenBreakdown;
    let bdCount = 0;
    if (tb.total > 0) {
      const pushRight = (label: string) => {
        const padLen = Math.max(0, innerW - visibleWidth(label) - 2);
        lines.push(row(' '.repeat(padLen) + label + ' '));
        bdCount++;
      };
      pushRight(yellow(`~${tb.total.toLocaleString()}`) + t.fg('dim', ' tokens'));
      if (tb.sys > 0)     pushRight(t.fg('dim', '  sys:')   + yellow(tb.sys.toLocaleString()));
      if (tb.mode > 0)    pushRight(t.fg('dim', '  mode:')  + yellow(tb.mode.toLocaleString()));
      if (tb.codemap > 0) pushRight(t.fg('dim', '  map:')   + yellow(tb.codemap.toLocaleString()));
      if (tb.tools > 0)   pushRight(t.fg('dim', '  tools:') + yellow(tb.tools.toLocaleString()));
    }
    this.breakdownLineCount = bdCount;

    // Hint bar — dynamic based on mode
    let hint: string;
    if (this.isTab('System Prompt') || this.isTab('Mode Preview') || this.isTab('Codemap') || this.isTab('Injections')) {
      hint = ` ←→ tabs • ↑↓ scroll • PgUp/PgDn • Home/End • Esc close`;
    } else if (this.expandedToolIndex >= 0) {
      hint = ` ←→ tabs • ↑↓ scroll • Enter collapse • Esc close`;
    } else {
      hint = ` ←→ tabs • ↑↓ navigate • Enter expand • Esc close`;
    }

    // --- Injection status (right side of hint line, System Prompt tab only) ---
    let injectLabel = '';
    if (this.isTab('System Prompt')) {
      const injections: string[] = [];

      if (this.mode.name) {
        injections.push(`mode: ${this.mode.name}`);
      }

      if (this.compassState) {
        if (this.compassState.enabled && this.compassState.hasCodemap) {
          injections.push('codemap: ✓ injected');
        } else if (this.compassState.enabled) {
          injections.push('codemap: ⏳ no map');
        } else {
          injections.push('codemap: ✗ off');
        }
      }

      if (injections.length > 0) {
        injectLabel = t.fg('dim', injections.join('  ·  '));
      }
    }

    const hintStyled = t.fg('dim', hint);
    if (injectLabel) {
      const gap = Math.max(1, innerW - visibleWidth(hintStyled) - visibleWidth(injectLabel) - 1);
      lines.push(row(hintStyled + ' '.repeat(gap) + injectLabel + ' '));
    } else {
      lines.push(row(hintStyled));
    }

    lines.push(red(`├${'─'.repeat(innerW)}┤`));

    // Content with scrolling
    const start = this.scrollOffset;
    const end = Math.min(this.totalLines.length, start + maxVisible);

    for (let i = start; i < end; i++) {
      const lineText = this.totalLines[i] ?? '';
      const isSelected = i - start === this.selected;
      const prefix = isSelected ? ' ▸ ' : '   ';
      let styled = prefix + lineText;

      if (isSelected) {
        styled = red(prefix) + lineText;
      }

      lines.push(row(truncateToWidth(styled, innerW, '')));
    }

    // Fill empty lines if content shorter than viewport
    for (let i = end; i < start + maxVisible; i++) {
      lines.push(row(''));
    }

    // Scroll indicator + bottom border
    if (this.totalLines.length > maxVisible) {
      const pct = Math.round(((this.scrollOffset + this.selected) / this.totalLines.length) * 100);
      const scrollInfo = ` ${this.scrollOffset + 1}-${end} of ${this.totalLines.length} (${pct}%) `;
      lines.push(red(`╰${'─'.repeat(innerW)}╯`));
      const scrollStyled = t.fg('dim', scrollInfo);
      const padding = innerW - visibleWidth(scrollStyled);
      lines[lines.length - 1] =
        red('╰') + '─'.repeat(Math.max(0, padding)) + scrollStyled + red('╯');
    } else {
      lines.push(red(`╰${'─'.repeat(innerW)}╯`));
    }

    return lines;
  }

	/** Invalidate cached rendering state (triggers re-render on next paint). */
	invalidate(): void {
    this.cachedWidth = undefined;
    this.renderedLines = undefined;
    if (this.promptText) {
      this.promptMd = new Markdown(this.promptText, 1, 0, this.buildMdTheme());
    }
  }

	/** Clean up resources. No-op for this component. */
	dispose(): void {}
}

// ============================================================================
// Diff-based injection detection
// ============================================================================

/**
 * Detect injections by comparing the cached system prompt (after all modifications)
 * with the base prompt captured at before_agent_start.
 *
 * Strategy:
 * - If the cached prompt is longer than the base prompt, the suffix is the diff.
 * - We exclude content already reported by cooperative extensions (they report
 *   their own charCount, which we subtract from the diff to avoid double-counting).
 * - Remaining content is returned as "unattributed" diff injections.
 */
export function computeDiffInjections(
  cachedPrompt: string | undefined,
  basePrompt: string,
  reported: Map<string, InjectionInfo>,
): DiffInjection[] {
  if (!cachedPrompt || cachedPrompt.length <= basePrompt.length) return [];

  const diff = cachedPrompt.slice(basePrompt.length).trim();
  if (!diff) return [];

  // If the entire diff is accounted for by reported injections, skip
  const reportedChars = Array.from(reported.values()).reduce((sum, i) => sum + i.charCount, 0);

  // When base prompt is empty (first call hasn't happened yet), diff is the entire cached prompt.
  // In that case, don't show diff since we can't separate base from injected.
  if (!basePrompt) return [];

  // If reported injections cover the diff within a small margin, treat as fully accounted
  if (reportedChars >= diff.length - 10) return [];

  return [{ content: diff, charCount: diff.length }];
}

// ============================================================================
// Extension
// ============================================================================

/**
 * System Prompt Viewer extension.
 *
 * Registers the `/system-prompt` command that opens a tabbed full-screen overlay
 * showing the current system prompt, mode preview, tool schemas, and active tools.
 *
 * @param pi - Pi extension API.
 *
 * @dependencies `@earendil-works/pi-tui` (Markdown, Key, matchesKey, visibleWidth, truncateToWidth)
 */
export default function systemPromptViewer(pi: ExtensionAPI) {
  let modesExtensionActive = false;
  let lastKnownPresetName: string | null = null;
  let compassInjectionState: CompassInjectionState | null = null;
  let compassCodemapData: CompassCodemapData | null = null;

  /** Cooperative injection info from extensions that emit "system-prompt:injection". */
  const reportedInjections = new Map<string, InjectionInfo>();

  /** Cached system prompt from the last before_agent_start (before extension modifications). */
  let lastBaseSystemPrompt = '';

  // Listen for modes extension state changes
  pi.events?.on("modes:active", (data: unknown) => {
    const d = data as { active: boolean; presetName?: string | null };
    modesExtensionActive = d.active;
    lastKnownPresetName = d.presetName ?? null;
  });

  // Listen for pi-compass injection state changes
  pi.events?.on("compass:injection-state", (data: unknown) => {
    compassInjectionState = data as CompassInjectionState;
  });

  // Listen for pi-compass codemap content
  pi.events?.on("compass:codemap-ready", (data: unknown) => {
    compassCodemapData = data as CompassCodemapData;
  });

  // Listen for cooperative injection reports from other extensions
  pi.events?.on("system-prompt:injection", (data: unknown) => {
    const d = data as InjectionInfo;
    if (d?.source) {
      reportedInjections.set(d.source, d);
    }
  });

  // Intercept before_agent_start to capture system prompt modifications
  pi.on("before_agent_start", async (event) => {
    lastBaseSystemPrompt = event.systemPrompt;
  });

  pi.registerCommand('system-prompt', {
    description: 'Show the current system prompt, mode preview, and tool schemas in a full-screen viewer',
    handler: async (_args, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const tools = pi.getAllTools();
      const activeNames = new Set(pi.getActiveTools());
      const activeTools = tools.filter(t => activeNames.has(t.name));
      const mode = resolveCurrentMode(ctx.sessionManager, ctx.cwd, pi, lastKnownPresetName);

      // Get real context usage from provider (available after first LLM call)
      const usage = ctx.getContextUsage?.() ?? null;
      const contextUsage = (usage && usage.tokens != null && usage.contextWindow != null && usage.percent != null)
        ? usage as ContextUsage
        : null;

      // Compute diff-based injections: content appended beyond what pi built
      // by comparing the cached prompt (after all modifications) with the base
      // prompt captured at before_agent_start time.
      const diffInjections = computeDiffInjections(prompt, lastBaseSystemPrompt, reportedInjections);

      // Non-interactive fallback
      if (!ctx.hasUI) {
        let output = '';
        if (prompt) {
          output += `System prompt (${prompt.length} chars):\n\n${prompt.slice(0, 2000)}${prompt.length > 2000 ? '...' : ''}`;
        } else {
          output += 'No system prompt sent yet.\n';
        }
        const injection = buildModeInjection(mode);
        if (modesExtensionActive && injection) {
          output += `\n\n--- Mode Preview (${mode.name}) ---\n\n${injection}`;
        }
        if (reportedInjections.size > 0) {
          output += `\n\n--- Injections (${reportedInjections.size}) ---\n`;
          for (const [source, info] of reportedInjections) {
            output += `\n[${source}] ${info.label} (${info.charCount} chars)\n${info.preview}\n`;
          }
        }
        ctx.ui.notify(output, 'info');
        return;
      }

      pi?.events?.emit("custom-ui:shown", { timestamp: Date.now() });
      try {
      await ctx.ui.custom<void>(
        (tui, theme, _keybindings, done) =>
          new SystemPromptViewer(prompt, tools, activeTools, mode, contextUsage, theme, () => done(undefined), tui.terminal.rows, modesExtensionActive, compassInjectionState, compassCodemapData, reportedInjections, diffInjections),
        {
          overlay: true,
          overlayOptions: {
            anchor: 'center',
            width: '100%',
            minWidth: 60,
            maxHeight: '100%',
            margin: 0,
          },
        },
      );
      } finally { pi?.events?.emit("custom-ui:hidden", { timestamp: Date.now() }); }
    },
  });
}
