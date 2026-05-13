/**
 * Построение деталей результата для Tavily-инструментов.
 *
 * Перенесено из extensions/tavily-tools/tools/tavily/details.ts.
 */

import type { TruncateResult } from "@earendil-works/pi-coding-agent";
import type { TavilyExtractOptions, TavilySearchOptions } from "@tavily/core";
import { DEFAULT_MAX_RESULTS } from "./client.js";
import type {
  ExtractFailedResult,
  ExtractResult,
  SearchResult,
  WebExtractDetails,
  WebSearchDetails,
} from "./types.js";

// ============================================================================
// Option normalization
// ============================================================================

/**
 * Нормализовать дефолты опций поиска.
 */
function optionDefaults(options: TavilySearchOptions) {
  return {
    maxResults: options.maxResults ?? DEFAULT_MAX_RESULTS,
    searchDepth: String(options.searchDepth ?? "basic"),
    includeImages: options.includeImages ?? false,
    includeAnswer: options.includeAnswer !== false,
    includeRawContent: typeof options.includeRawContent === "string",
  };
}

// ============================================================================
// Success details
// ============================================================================

export interface SuccessDetailsInput {
  query: string;
  options: TavilySearchOptions;
  answer: string | null;
  results: SearchResult[];
  truncation?: TruncateResult;
  fullOutputPath?: string;
}

/**
 * Построить WebSearchDetails для успешного поиска.
 */
export function buildSuccessDetails(input: SuccessDetailsInput): WebSearchDetails {
  const defaults = optionDefaults(input.options);

  return {
    query: input.query,
    maxResults: defaults.maxResults,
    searchDepth: defaults.searchDepth,
    includeAnswer: defaults.includeAnswer,
    includeRawContent: defaults.includeRawContent,
    includeImages: defaults.includeImages,
    days: input.options.days,
    answer: input.answer ?? undefined,
    resultCount: input.results.length,
    sources: input.results.map((r) => ({
      title: r.title,
      url: r.url,
      score: r.score,
    })),
    truncation: input.truncation,
    fullOutputPath: input.fullOutputPath,
  };
}

// ============================================================================
// Extract success details
// ============================================================================

export interface ExtractSuccessDetailsInput {
  urlCount: number;
  options: TavilyExtractOptions;
  results: ExtractResult[];
  failedResults: ExtractFailedResult[];
  truncation?: TruncateResult;
  fullOutputPath?: string;
}

/**
 * Нормализовать дефолты опций извлечения.
 */
function extractOptionDefaults(options: TavilyExtractOptions) {
  return {
    extractDepth: String(options.extractDepth ?? "basic"),
    includeImages: options.includeImages ?? false,
    format: String(options.format ?? "markdown"),
  };
}

/**
 * Построить WebExtractDetails для успешного извлечения.
 */
export function buildExtractSuccessDetails(input: ExtractSuccessDetailsInput): WebExtractDetails {
  const defaults = extractOptionDefaults(input.options);

  return {
    urlCount: input.urlCount,
    extractDepth: defaults.extractDepth,
    includeImages: defaults.includeImages,
    format: defaults.format,
    query: input.options.query,
    successCount: input.results.length,
    failureCount: input.failedResults.length,
    results: input.results,
    failedResults: input.failedResults,
    truncation: input.truncation,
    fullOutputPath: input.fullOutputPath,
  };
}
