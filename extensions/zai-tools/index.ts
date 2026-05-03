import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { MCP_SERVER_PATHS } from './src/constants.ts';
import { loadConfig } from './src/config.ts';
import { createRemoteMcpClient } from './src/client/remote-mcp.ts';
import { createStdioMcpClient } from './src/client/stdio-mcp.ts';
import { createWebReaderService } from './src/services/web-reader.ts';
import { createWebSearchService } from './src/services/web-search.ts';
import { createZreadService } from './src/services/zread.ts';
import { createVisionService } from './src/services/vision.ts';
import { createWebReaderTool } from './src/tools/web-reader-tool.ts';
import { createWebSearchTool } from './src/tools/web-search-tool.ts';
import { createZreadGetRepoStructureTool } from './src/tools/zread-get-repo-structure-tool.ts';
import { createZreadReadFileTool } from './src/tools/zread-read-file-tool.ts';
import { createZreadSearchDocTool } from './src/tools/zread-search-doc-tool.ts';
import { createVisionUiToArtifactTool } from './src/tools/vision-ui-to-artifact-tool.ts';
import { createVisionExtractTextTool } from './src/tools/vision-extract-text-tool.ts';
import { createVisionDiagnoseErrorTool } from './src/tools/vision-diagnose-error-tool.ts';
import { createVisionUnderstandDiagramTool } from './src/tools/vision-understand-diagram-tool.ts';
import { createVisionAnalyzeDataVizTool } from './src/tools/vision-analyze-data-viz-tool.ts';
import { createVisionUiDiffCheckTool } from './src/tools/vision-ui-diff-check-tool.ts';
import { createVisionAnalyzeImageTool } from './src/tools/vision-analyze-image-tool.ts';
import { createVisionAnalyzeVideoTool } from './src/tools/vision-analyze-video-tool.ts';
import type { EnvSource } from './src/types.ts';
import { createToggleManager } from './src/toggle.ts';
import { createGlobalStateStore } from './src/global-state.ts';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

interface ExtensionOptions {
  env?: EnvSource;
}

export default function zaiToolsExtension(pi: ExtensionAPI, options?: ExtensionOptions) {
  const config = loadConfig(options?.env);

  // Собираем имена zai-tools по мере регистрации
  const zaiToolNames: string[] = [];

  function registerZaiTool(tool: { name: string }) {
    zaiToolNames.push(tool.name);
    pi.registerTool(tool as any);
  }

  if (config.enabledModules.includes('search')) {
    const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.search);
    const service = createWebSearchService(client, { searchLocation: config.searchLocation });
    registerZaiTool(createWebSearchTool(service));
  }

  if (config.enabledModules.includes('reader')) {
    const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.reader);
    const service = createWebReaderService(client);
    registerZaiTool(createWebReaderTool(service));
  }

  if (config.enabledModules.includes('zread')) {
    const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.zread);
    const service = createZreadService(client);
    registerZaiTool(createZreadSearchDocTool(service));
    registerZaiTool(createZreadGetRepoStructureTool(service));
    registerZaiTool(createZreadReadFileTool(service));
  }

  if (config.enabledModules.includes('vision')) {
    const client = createStdioMcpClient(config);
    const service = createVisionService(client);
    registerZaiTool(createVisionUiToArtifactTool(service));
    registerZaiTool(createVisionExtractTextTool(service));
    registerZaiTool(createVisionDiagnoseErrorTool(service));
    registerZaiTool(createVisionUnderstandDiagramTool(service));
    registerZaiTool(createVisionAnalyzeDataVizTool(service));
    registerZaiTool(createVisionUiDiffCheckTool(service));
    registerZaiTool(createVisionAnalyzeImageTool(service));
    registerZaiTool(createVisionAnalyzeVideoTool(service));
  }

  // --- Toggle command /zai-tools ---
  const agentDir = process.env.PI_CODING_AGENT_DIR
    ? resolve(process.env.PI_CODING_AGENT_DIR.replace(/^~/, homedir()))
    : join(homedir(), '.pi', 'agent');
  const globalState = createGlobalStateStore(agentDir);
  const toggle = createToggleManager(zaiToolNames);

  function applyToggleToActiveTools(): string[] {
    const current = pi.getActiveTools() as string[];
    if (toggle.isEnabled()) {
      const set = new Set(current);
      for (const name of zaiToolNames) set.add(name);
      return Array.from(set);
    }
    return current.filter((name) => !zaiToolNames.includes(name));
  }

  pi.registerCommand('zai-tools', {
    description: 'Toggle zai-tools on/off',
    async handler(_args, ctx) {
      const { enabled, newActiveTools } = toggle.toggle(pi.getActiveTools() as string[]);
      pi.setActiveTools(newActiveTools);
      pi.appendEntry('custom', { customType: 'zai-tools-state', enabled });
      globalState.save(enabled);
      ctx.ui.notify(
        enabled ? 'zai-tools enabled' : 'zai-tools disabled',
        'info',
      );
    },
  });

  async function restoreFromBranch(_event: any, ctx: any) {
    const branch = ctx.sessionManager.getBranch();
    const sessionResult = toggle.restoreFromEntries(branch);
    if (sessionResult) {
      // Session entry имеет приоритет (навигация по tree)
      pi.setActiveTools(applyToggleToActiveTools());
      return;
    }

    // Нет session entry — читаем глобальное состояние
    const globalEnabled = globalState.load();
    if (!globalEnabled) {
      // Синхронизируем toggle manager с глобальным состоянием
      toggle.restoreFromEntries([
        { type: 'custom', customType: 'zai-tools-state', data: { enabled: false } },
      ]);
      pi.setActiveTools(applyToggleToActiveTools());
    }
  }

  pi.on('session_start', restoreFromBranch);
  pi.on('session_tree', restoreFromBranch);
}
