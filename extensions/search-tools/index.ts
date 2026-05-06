import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { MCP_SERVER_PATHS } from './src/constants.js';
import { loadConfig } from './src/config.js';
import { createRemoteMcpClient } from './src/client/remote-mcp.js';
import { createStdioMcpClient } from './src/client/stdio-mcp.js';
import { createWebReaderService } from './src/services/web-reader.js';
import { createWebSearchService } from './src/services/web-search.js';
import { createZreadService } from './src/services/zread.js';
import { createVisionService } from './src/services/vision.js';
import { createWebReaderTool } from './src/tools/web-reader-tool.js';
import { createWebSearchTool } from './src/tools/web-search-tool.js';
import { createBraveWebSearchTool } from './src/tools/brave-web-search-tool.js';
import { createBraveWebFetchTool } from './src/tools/brave-web-fetch-tool.js';
import { createZreadGetRepoStructureTool } from './src/tools/zread-get-repo-structure-tool.js';
import { createZreadReadFileTool } from './src/tools/zread-read-file-tool.js';
import { createZreadSearchDocTool } from './src/tools/zread-search-doc-tool.js';
import { createVisionUiToArtifactTool } from './src/tools/vision-ui-to-artifact-tool.js';
import { createVisionExtractTextTool } from './src/tools/vision-extract-text-tool.js';
import { createVisionDiagnoseErrorTool } from './src/tools/vision-diagnose-error-tool.js';
import { createVisionUnderstandDiagramTool } from './src/tools/vision-understand-diagram-tool.js';
import { createVisionAnalyzeDataVizTool } from './src/tools/vision-analyze-data-viz-tool.js';
import { createVisionUiDiffCheckTool } from './src/tools/vision-ui-diff-check-tool.js';
import { createVisionAnalyzeImageTool } from './src/tools/vision-analyze-image-tool.js';
import { createVisionAnalyzeVideoTool } from './src/tools/vision-analyze-video-tool.js';
import { createTavilyWebSearchTool } from './src/tools/tavily-web-search-tool.js';
import { createTavilyWebExtractTool } from './src/tools/tavily-web-extract-tool.js';
import { resultCache } from './src/tavily/cache.js';
import { cleanupTempDir } from './src/tavily/truncation.js';
import { createTavilyClient } from './src/tavily/client.js';
import type { EnvSource } from './src/types.js';

interface ExtensionOptions {
  env?: EnvSource;
}

export default function searchToolsExtension(pi: ExtensionAPI, options?: ExtensionOptions) {
  const config = loadConfig(options?.env);

  // --- Регистрация ZAI-инструментов ---

  if (config.apiKey) {
    if (config.enabledModules.includes('search')) {
      const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.search);
      const service = createWebSearchService(client, { searchLocation: config.searchLocation });
      pi.registerTool(createWebSearchTool(service));
    }

    if (config.enabledModules.includes('reader')) {
      const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.reader);
      const service = createWebReaderService(client);
      pi.registerTool(createWebReaderTool(service));
    }

    if (config.enabledModules.includes('zread')) {
      const client = createRemoteMcpClient(config, MCP_SERVER_PATHS.zread);
      const service = createZreadService(client);
      pi.registerTool(createZreadSearchDocTool(service));
      pi.registerTool(createZreadGetRepoStructureTool(service));
      pi.registerTool(createZreadReadFileTool(service));
    }

    if (config.enabledModules.includes('vision')) {
      const client = createStdioMcpClient(config);
      const service = createVisionService(client);
      pi.registerTool(createVisionUiToArtifactTool(service));
      pi.registerTool(createVisionExtractTextTool(service));
      pi.registerTool(createVisionDiagnoseErrorTool(service));
      pi.registerTool(createVisionUnderstandDiagramTool(service));
      pi.registerTool(createVisionAnalyzeDataVizTool(service));
      pi.registerTool(createVisionUiDiffCheckTool(service));
      pi.registerTool(createVisionAnalyzeImageTool(service));
      pi.registerTool(createVisionAnalyzeVideoTool(service));
    }
  } else {
    // Уведомляем пользователя об отсутствии API ключа
    pi.on('session_start', (_event: any, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(
        'search-tools: ZAI_API_KEY не задан — ZAI-инструменты не зарегистрированы. Установите ZAI_API_KEY для подключения zai.',
        'info',
      );
    });
  }

  // --- Регистрация Brave-инструментов ---

  const braveApiKey = (options?.env ?? process.env).BRAVE_SEARCH_API_KEY?.trim();

  if (braveApiKey) {
    pi.registerTool(createBraveWebSearchTool(braveApiKey, () => pi.events?.emit('brave-counter:increment', 'brave_web_search')));
    pi.registerTool(createBraveWebFetchTool(() => pi.events?.emit('brave-counter:increment', 'brave_web_fetch')));
  } else {
    // Уведомляем об отсутствии brave-ключа при session_start
    pi.on('session_start', (_event: any, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(
        'search-tools: BRAVE_SEARCH_API_KEY не задан — brave_web_search/brave_web_fetch не зарегистрированы.',
        'info',
      );
    });
  }

  // --- Регистрация Tavily-инструментов ---

  const tavilyApiKey = (options?.env ?? process.env).TAVILY_API_KEY?.trim();

  if (tavilyApiKey) {
    const tavilyClient = createTavilyClient(tavilyApiKey);
    pi.registerTool(createTavilyWebSearchTool(tavilyClient));
    pi.registerTool(createTavilyWebExtractTool(tavilyClient));
  } else {
    // Уведомляем об отсутствии tavily-ключа при session_start
    pi.on('session_start', (_event: any, ctx: ExtensionCommandContext) => {
      ctx.ui.notify(
        'search-tools: TAVILY_API_KEY не задан — tavily_web_search/tavily_web_extract не зарегистрированы.',
        'info',
      );
    });
  }

  // --- Lifecycle-обработчики ---

  pi.on('session_start', () => {
    // Очищаем кэш результатов tavily при новой сессии
    resultCache.clear();
  });

  pi.on('session_shutdown', async (_event: any, ctx: ExtensionCommandContext) => {
    // Очищаем временные файлы tavily (best-effort)
    await cleanupTempDir(ctx.cwd).catch(() => {});
  });
}
