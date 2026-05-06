/**
 * Tavily Web Extract Tool — инструмент извлечения контента через Tavily API.
 *
 * Перенесено из extensions/tavily-tools/tools/web-extract.ts.
 * Адаптировано под стиль search-tools: возвращает объект инструмента
 * вместо прямой регистрации через pi.registerTool().
 */

import type { TavilyClient } from "@tavily/core";

import { resultCache } from "../tavily/cache.js";
import { buildToolResult, raceAbort, sanitizeError, sendProgress } from "../tavily/execute.js";
import { buildExtractOptions, validateUrls } from "../tavily/client.js";
import { buildExtractSuccessDetails } from "../tavily/details.js";
import { extractExtractResults, formatExtractResponse } from "../tavily/formatters.js";
import { renderExtractCall, renderExtractResult } from "../tavily/renderers.js";
import { WebExtractParamsSchema } from "../tavily/schemas.js";

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Создать определение инструмента tavily_web_extract.
 */
export function createTavilyWebExtractTool(client: TavilyClient) {
  return {
    name: "tavily_web_extract",
    label: "Web Extract",
    description:
      `Extracts raw content from one or more URLs using Tavily. ` +
      `Output is truncated to 2000 lines or 50KB (whichever is hit first). ` +
      `Useful for reading full content from specific pages, data collection, or content analysis.`,

    promptSnippet: "Extract raw content from one or more web pages.",
    promptGuidelines: [
      "Use this tool when you need to read the full content of specific web pages.",
      "Use this tool after web_search to get detailed content from specific URLs.",
      "Use this tool for data collection and content analysis tasks.",
      "Use extract_depth advanced for more comprehensive extraction.",
      "Use include_images to also extract images from pages.",
      "Use format text if you need plain text instead of markdown.",
      "Use query to focus extraction on specific content within pages.",
      "Provide up to 20 URLs in a single request for batch extraction.",
    ],

    parameters: WebExtractParamsSchema,

    async execute(_toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const urls = validateUrls(params.urls as unknown[]);
      const extractOptions = buildExtractOptions(params);

      const urlCount = urls.length;
      const urlText = urlCount === 1 ? "URL" : "URLs";

      sendProgress(onUpdate, `Extracting content from ${urlCount} ${urlText}...`);

      // Проверяем кэш для single-URL запросов — избегаем лишнего API-вызова
      if (urlCount === 1 && !extractOptions.query) {
        const cached = resultCache.get(urls[0]!);
        if (cached) {
          return buildToolResult(cached.rawContent, ctx, "extract", (truncation, fullOutputPath) =>
            buildExtractSuccessDetails({
              urlCount,
              options: extractOptions,
              results: [cached],
              failedResults: [],
              truncation,
              fullOutputPath,
            })
          );
        }
      }

      let response;
      try {
        response = await raceAbort(client.extract(urls, extractOptions), signal);
      } catch (error) {
        throw sanitizeError(error);
      }
      const { results, failedResults } = extractExtractResults(response);
      const fullOutput = formatExtractResponse(
        results,
        failedResults,
        extractOptions.includeImages ?? false
      );
      return buildToolResult(fullOutput, ctx, "extract", (truncation, fullOutputPath) =>
        buildExtractSuccessDetails({
          urlCount,
          options: extractOptions,
          results,
          failedResults,
          truncation,
          fullOutputPath,
        })
      );
    },

    renderCall(args: Record<string, unknown>, theme: any) {
      return renderExtractCall(args, theme);
    },

    renderResult(result: any, state: any, theme: any) {
      return renderExtractResult(result, state, theme);
    },
  };
}
