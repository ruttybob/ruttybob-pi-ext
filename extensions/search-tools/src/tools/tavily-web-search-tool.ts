/**
 * Tavily Web Search Tool — инструмент веб-поиска через Tavily API.
 *
 * Перенесено из extensions/tavily-tools/tools/web-search.ts.
 * Адаптировано под стиль search-tools: возвращает объект инструмента
 * вместо прямой регистрации через pi.registerTool().
 */

import type { TavilyClient } from "@tavily/core";

import { resultCache } from "../tavily/cache.js";
import { buildToolResult, raceAbort, sanitizeError, sendProgress } from "../tavily/execute.js";
import { buildSearchOptions, validateQuery } from "../tavily/client.js";
import { buildSuccessDetails } from "../tavily/details.js";
import { extractSearchResults, formatWebSearchResponse } from "../tavily/formatters.js";
import { renderWebSearchCall, renderWebSearchResult } from "../tavily/renderers.js";
import { WebSearchParamsSchema } from "../tavily/schemas.js";

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Создать определение инструмента tavily_web_search.
 */
export function createTavilyWebSearchTool(client: TavilyClient) {
  return {
    name: "tavily_web_search",
    label: "Web Search",
    description:
      `Searches the web for current information using Tavily. ` +
      `Output is truncated to 2000 lines or 50KB (whichever is hit first). ` +
      `Useful for finding recent news, documentation, or any time-sensitive information.`,

    promptSnippet:
      "Search the web for current information, news, documentation, or time-sensitive data.",
    promptGuidelines: [
      "Use this tool when the user asks for recent news, current events, or up-to-date information.",
      "Use this tool to search for documentation, APIs, or technical information.",
      "Use this tool to verify facts or find current statistics.",
      "Use the days parameter to limit results to recent timeframes (e.g., 7 for last week).",
      "Use include_images to find relevant images for your search.",
      "Use include_raw_content to get more detailed page content.",
      "Use search_depth advanced for deeper, more comprehensive searches.",
    ],

    parameters: WebSearchParamsSchema,

    async execute(_toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const query = validateQuery(params.query as string);
      const searchOptions = buildSearchOptions(params);

      sendProgress(onUpdate, `Searching for: ${query}`);

      let response;
      try {
        response = await raceAbort(client.search(query, searchOptions), signal);
      } catch (error) {
        throw sanitizeError(error);
      }
      const { answer, results, images } = extractSearchResults(response);

      for (const r of results) {
        const content = r.rawContent ?? r.content;
        if (r.url && content) {
          resultCache.set({ url: r.url, title: r.title, rawContent: content });
        }
      }

      const fullOutput = formatWebSearchResponse(
        answer,
        results,
        images,
        searchOptions.includeImages
      );
      return buildToolResult(fullOutput, ctx, "search", (truncation, fullOutputPath) =>
        buildSuccessDetails({
          query,
          options: searchOptions,
          answer,
          results,
          truncation,
          fullOutputPath,
        })
      );
    },

    renderCall(args: Record<string, unknown>, theme: any) {
      return renderWebSearchCall(args, theme);
    },

    renderResult(result: any, state: any, theme: any) {
      return renderWebSearchResult(result, state, theme);
    },
  };
}
