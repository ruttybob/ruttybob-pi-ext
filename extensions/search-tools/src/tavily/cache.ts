/**
 * Сессионный кэш результатов Tavily.
 *
 * Заполняется результатами web_search с содержимым.
 * Проверяется в web_extract перед API-вызовом.
 * Очищается при session_start для предотвращения устаревших данных.
 *
 * Перенесено из extensions/tavily-tools/tools/shared/cache.ts.
 */

import type { ExtractResult } from "./types.js";

const cache = new Map<string, ExtractResult>();

export const resultCache = {
  get(url: string): ExtractResult | undefined {
    return cache.get(url);
  },

  set(result: ExtractResult): void {
    cache.set(result.url, result);
  },

  clear(): void {
    cache.clear();
  },
};
