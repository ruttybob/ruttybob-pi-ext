/**
 * REPPI — Template System Prompt for Pi
 *
 * Replaces pi's system prompt with a user-defined template (REPPI.md)
 * that supports template variables and conditional blocks.
 *
 * Template variables: {{tools}}, {{tool_guidelines}}, {{mode}}, {{documentation}},
 *   {{skills}}, {{context_files}}, {{base_prompt}}, {{model_info}}, {{date}}, {{cwd}}
 * Conditional blocks: {{#if var}}...{{/if}} — shown only if var is non-empty
 *
 * Template resolution order: branch entry "reppi" → .pi/REPPI.md → ~/.pi/agent/REPPI.md
 *
 * Commands: /reppi [status|show|edit|on|off]
 *
 * Install: copy to ~/.pi/agent/extensions/system-prompt-template/index.ts
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';

// ============================================================================
// Types
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

interface ResolvedMode {
  name: string | null;
  preset?: PresetDefinition;
  activeTools: string[];
}

interface ReppiState {
  enabled: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const BRANCH_ENTRY_KEY = 'reppi';
const STATE_ENTRY_KEY = 'reppi-state';
const TEMPLATE_FILENAME = 'REPPI.md';

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Simple template engine with {{var}} substitution and {{#if var}}...{{/if}} conditionals.
 */
function resolveTemplate(template: string, vars: Record<string, string>): string {
  // 1. Remove {{#if var}}...{{/if}} blocks where var is empty/missing
  let result = template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => {
      const value = vars[key]?.trim();
      return value ? content : '';
    },
  );

  // 2. Replace {{var}} with value (empty string if missing)
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

  return result;
}

// ============================================================================
// Mode resolution (self-contained, no dependency on modes extension)
// ============================================================================

function loadPresetsSimple(cwd: string): Record<string, PresetDefinition> {
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

function resolveCurrentMode(
  sessionManager: any,
  cwd: string,
  pi: ExtensionAPI,
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

  const activeTools = pi.getActiveTools();

  if (!modeName) {
    return { name: null, activeTools };
  }

  const presets = loadPresetsSimple(cwd);
  const preset = presets[modeName];

  return { name: modeName, preset, activeTools };
}

function buildModeInjection(mode: ResolvedMode): string {
  if (!mode.name) return '';

  const sections: string[] = [
    `Current mode: ${mode.name}`,
    `Enabled tools: ${mode.activeTools.length > 0 ? mode.activeTools.join(', ') : '(none)'}`,
    mode.preset?.instructions?.trim(),
  ].filter((s): s is string => Boolean(s));

  return sections.join('\n\n');
}

// ============================================================================
// Template loading
// ============================================================================

interface TemplateSource {
  template: string;
  source: 'branch' | 'project' | 'global';
  path?: string;
}

function loadTemplateFromBranch(sessionManager: any): string | null {
  const branch = sessionManager.getBranch?.() ?? sessionManager.getEntries?.() ?? [];

  for (const entry of branch) {
    if (entry.type === 'custom' && entry.customType === BRANCH_ENTRY_KEY) {
      const data = entry.data;
      if (typeof data === 'string' && data.trim()) {
        return data;
      }
    }
  }

  return null;
}

function loadTemplateFromDisk(cwd: string): { template: string; source: TemplateSource['source']; path: string } | null {
  const agentDir = process.env.PI_CODING_AGENT_DIR
    ?? join(process.env.HOME ?? '/root', '.pi', 'agent');

  // Project file: .pi/REPPI.md
  const projectPath = join(cwd, '.pi', TEMPLATE_FILENAME);
  if (existsSync(projectPath)) {
    try {
      return { template: readFileSync(projectPath, 'utf-8'), source: 'project', path: projectPath };
    } catch { /* skip */ }
  }

  // Global file: ~/.pi/agent/REPPI.md
  const globalPath = join(agentDir, TEMPLATE_FILENAME);
  if (existsSync(globalPath)) {
    try {
      return { template: readFileSync(globalPath, 'utf-8'), source: 'global', path: globalPath };
    } catch { /* skip */ }
  }

  return null;
}

function loadTemplate(sessionManager: any, cwd: string): TemplateSource | null {
  // Priority: branch entry → project file → global file
  const branchTemplate = loadTemplateFromBranch(sessionManager);
  if (branchTemplate) {
    return { template: branchTemplate, source: 'branch' };
  }

  const diskTemplate = loadTemplateFromDisk(cwd);
  if (diskTemplate) {
    return diskTemplate;
  }

  return null;
}

// ============================================================================
// State management (enabled/disabled)
// ============================================================================

function loadState(sessionManager: any): ReppiState {
  const branch = sessionManager.getBranch?.() ?? sessionManager.getEntries?.() ?? [];

  for (const entry of branch) {
    if (entry.type === 'custom' && entry.customType === STATE_ENTRY_KEY) {
      const data = entry.data as ReppiState | undefined;
      if (data && typeof data.enabled === 'boolean') {
        return data;
      }
    }
  }

  return { enabled: true }; // Default: enabled
}

// ============================================================================
// Variable resolution
// ============================================================================

function buildTemplateVars(
  sessionManager: any,
  cwd: string,
  pi: ExtensionAPI,
  event: any,
): Record<string, string> {
  const opts = event.systemPromptOptions ?? {};
  const toolSnippets: Record<string, string> = opts.toolSnippets ?? {};
  const selectedTools: string[] = opts.selectedTools ?? [];
  const promptGuidelines: string[] = opts.promptGuidelines ?? [];
  const contextFiles: Array<{ path: string; content: string }> = opts.contextFiles ?? [];
  const skills: any[] = opts.skills ?? [];

  // {{tools}} — list of active tools with descriptions
  const tools = selectedTools.length > 0
    ? selectedTools.filter(name => toolSnippets[name]).map(name => `- ${name}: ${toolSnippets[name]}`).join('\n')
    : '(none)';

  // {{tool_guidelines}} — tool usage guidelines
  const toolGuidelines = promptGuidelines.length > 0
    ? promptGuidelines.map(g => `- ${g}`).join('\n')
    : '';

  // {{mode}} — current mode instructions (from modes extension, resolved independently)
  const mode = resolveCurrentMode(sessionManager, cwd, pi);
  const modeInjection = buildModeInjection(mode);

  // {{documentation}} — pi documentation links (from the default prompt)
  // Extract from base_prompt since we can't easily call getDocsPath() from extension
  const basePrompt = event.systemPrompt ?? '';
  const docMatch = basePrompt.match(/Pi documentation[\s\S]*?(?=\n\n|$)/);
  const documentation = docMatch?.[0]?.trim() ?? '';

  // {{skills}} — loaded skills
  const skillsText = skills.length > 0
    ? skills.map((s: any) => `### ${s.name}\n\n${s.content ?? ''}`).join('\n\n')
    : '';

  // {{context_files}} — AGENTS.md / CLAUDE.md
  const contextFilesText = contextFiles.length > 0
    ? contextFiles.map(f => `## ${f.path}\n\n${f.content}`).join('\n\n')
    : '';

  // {{base_prompt}} — the original assembled system prompt
  // {{model_info}} — current model name
  const modelInfo = pi.getModelName?.() ?? '';

  // {{date}} — current date
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // {{cwd}} — current working directory
  const cwdStr = cwd.replace(/\\/g, '/');

  return {
    tools,
    tool_guidelines: toolGuidelines,
    mode: modeInjection,
    documentation,
    skills: skillsText,
    context_files: contextFilesText,
    base_prompt: basePrompt,
    model_info: modelInfo,
    date,
    cwd: cwdStr,
  };
}

// ============================================================================
// Extension
// ============================================================================

export default function systemPromptTemplate(pi: ExtensionAPI) {
  // --- before_agent_start handler ---
  pi.on('before_agent_start', async (event, ctx) => {
    const sessionManager = ctx.sessionManager;
    const cwd = ctx.cwd;

    // Check if extension is enabled
    const state = loadState(sessionManager);
    if (!state.enabled) return;

    // Load template
    const templateSource = loadTemplate(sessionManager, cwd);
    if (!templateSource) return;

    // Build variables from event data
    const vars = buildTemplateVars(sessionManager, cwd, pi, event);

    // Resolve template
    const resolved = resolveTemplate(templateSource.template, vars);

    // Append date and cwd (pi always adds these at the end)
    const finalPrompt = resolved
      + `\nCurrent date: ${vars.date}`
      + `\nCurrent working directory: ${vars.cwd}`;

    return { systemPrompt: finalPrompt };
  });

  // --- TUI commands ---
  pi.registerCommand('reppi', {
    description: 'Manage REPPI system prompt template (status|show|edit|on|off)',
    handler: async (args, ctx) => {
      const cmd = args.trim().toLowerCase().split(/\s+/)[0] || 'status';
      const sessionManager = ctx.sessionManager;
      const cwd = ctx.cwd;

      switch (cmd) {
        case 'status': {
          const state = loadState(sessionManager);
          const templateSource = loadTemplate(sessionManager, cwd);

          let status = `REPPI: ${state.enabled ? '✓ enabled' : '✗ disabled'}\n`;
          if (templateSource) {
            status += `Source: ${templateSource.source}`;
            if (templateSource.path) status += ` (${templateSource.path})`;
            status += `\nTemplate: ${templateSource.template.length} chars`;
          } else {
            status += 'Source: none (no REPPI.md found)\n';
            status += 'Create .pi/REPPI.md or ~/.pi/agent/REPPI.md to activate';
          }
          ctx.ui.notify(status, 'info');
          break;
        }

        case 'show': {
          const templateSource = loadTemplate(sessionManager, cwd);
          if (!templateSource) {
            ctx.ui.notify('No REPPI template found. Create .pi/REPPI.md or ~/.pi/agent/REPPI.md', 'warning');
            return;
          }

          // Show raw template
          let output = `=== REPPI Template (${templateSource.source}) ===\n\n`;
          output += templateSource.template;

          // Show resolved preview
          const vars = buildTemplateVars(sessionManager, cwd, pi, {
            systemPrompt: ctx.getSystemPrompt?.() ?? '',
            systemPromptOptions: {} as any,
          });
          const resolved = resolveTemplate(templateSource.template, vars);
          output += `\n\n=== Resolved Preview ===\n\n`;
          output += resolved;

          ctx.ui.notify(output, 'info');
          break;
        }

        case 'edit': {
          const agentDir = process.env.PI_CODING_AGENT_DIR
            ?? join(process.env.HOME ?? '/root', '.pi', 'agent');
          const globalPath = join(agentDir, TEMPLATE_FILENAME);
          const projectPath = join(cwd, '.pi', TEMPLATE_FILENAME);

          // Prefer project file, fall back to global
          const editPath = existsSync(projectPath) ? projectPath
            : existsSync(globalPath) ? globalPath
            : projectPath; // create new in project dir

          const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
          try {
            execSync(`${editor} ${editPath}`, { stdio: 'inherit' });
            ctx.ui.notify(`REPPI template saved to ${editPath}`, 'info');
          } catch (err: any) {
            ctx.ui.notify(`Failed to open editor: ${err.message}`, 'error');
          }
          break;
        }

        case 'on': {
          try {
            await ctx.sessionManager.addCustomEntry?.(STATE_ENTRY_KEY, { enabled: true });
            ctx.ui.notify('REPPI enabled', 'info');
          } catch {
            ctx.ui.notify('Failed to enable REPPI', 'error');
          }
          break;
        }

        case 'off': {
          try {
            await ctx.sessionManager.addCustomEntry?.(STATE_ENTRY_KEY, { enabled: false });
            ctx.ui.notify('REPPI disabled (pi will use default system prompt)', 'info');
          } catch {
            ctx.ui.notify('Failed to disable REPPI', 'error');
          }
          break;
        }

        default:
          ctx.ui.notify(
            'Usage: /reppi [status|show|edit|on|off]\n'
            + '  status — show current state and template source\n'
            + '  show   — display template and resolved preview\n'
            + '  edit   — open template in $EDITOR\n'
            + '  on     — enable REPPI\n'
            + '  off    — disable REPPI',
            'info',
          );
      }
    },
  });
}
