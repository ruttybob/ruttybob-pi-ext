/**
 * Клиент Tavily: создание экземпляра, валидация параметров.
 *
 * Перенесено из extensions/tavily-tools/tools/tavily/client.ts
 * без изменений в бизнес-логике.
 */

import {
  tavily,
  type TavilyClient,
  type TavilyExtractOptions,
  type TavilySearchOptions,
} from "@tavily/core";

// ============================================================================
// Constants
// ============================================================================

/** Количество результатов поиска по умолчанию */
export const DEFAULT_MAX_RESULTS = 8;

// ============================================================================
// Client Creation
// ============================================================================

/**
 * Создать экземпляр Tavily-клиента
 * @throws {Error} Если apiKey не задан или инициализация не удалась
 */
export function createTavilyClient(apiKey?: string): TavilyClient {
  const key = apiKey ?? process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      "TAVILY_API_KEY environment variable is not set. " +
        'Please set it with: export TAVILY_API_KEY="your-api-key" ' +
        "or get a free key from https://tavily.com"
    );
  }

  try {
    return tavily({ apiKey: key });
  } catch (error) {
    throw new Error(
      `Failed to initialize Tavily client: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Построить опции поиска из параметров инструмента
 */
export function buildSearchOptions(params: Record<string, unknown>): TavilySearchOptions {
  return {
    maxResults:
      typeof params.max_results === "number"
        ? Math.max(1, Math.min(20, params.max_results))
        : DEFAULT_MAX_RESULTS,
    searchDepth: (params.search_depth as "basic" | "advanced") ?? "basic",
    includeAnswer: params.include_answer !== false,
    includeImages: params.include_images === true,
    includeRawContent: params.include_raw_content === true ? "markdown" : false,
    days: typeof params.days === "number" ? params.days : undefined,
    includeDomains: undefined,
    excludeDomains: undefined,
  };
}

/**
 * Валидировать поисковый запрос
 * @throws {Error} Если запрос пустой
 */
export function validateQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Query cannot be empty");
  }
  return trimmed;
}

// ============================================================================
// Extract Helpers
// ============================================================================

/**
 * Построить опции извлечения из параметров инструмента
 */
export function buildExtractOptions(params: Record<string, unknown>): TavilyExtractOptions {
  return {
    extractDepth: (params.extract_depth as "basic" | "advanced") ?? "basic",
    includeImages: params.include_images === true,
    format: (params.format as "markdown" | "text") ?? "markdown",
    query: typeof params.query === "string" ? params.query : undefined,
  };
}

/**
 * Валидировать массив URL
 * @throws {Error} Если массив пустой, превышает лимит или содержит невалидные URL
 */
export function validateUrls(urls: unknown[]): string[] {
  if (!Array.isArray(urls)) {
    throw new Error("URLs must be an array");
  }

  if (urls.length === 0) {
    throw new Error("URLs array cannot be empty");
  }

  if (urls.length > 20) {
    throw new Error("Maximum 20 URLs allowed, got " + urls.length);
  }

  const validatedUrls: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string") {
      throw new Error("All URLs must be strings");
    }

    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("URLs cannot be empty strings");
    }

    // Базовая валидация — URL должен начинаться с http:// или https://
    if (!trimmed.match(/^https?:\/\//i)) {
      throw new Error(`Invalid URL format: ${trimmed}. URLs must start with http:// or https://`);
    }

    validatedUrls.push(trimmed);
  }

  return validatedUrls;
}
