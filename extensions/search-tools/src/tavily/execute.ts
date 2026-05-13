/**
 * Общие хелперы выполнения для Tavily-инструментов.
 *
 * Перенесено из extensions/tavily-tools/tools/shared/execute.ts.
 */

import type {
  AgentToolUpdateCallback,
  ExtensionContext,
  TruncateResult,
} from "@earendil-works/pi-coding-agent";

import { applyTruncation } from "./truncation.js";

// ============================================================================
// Abort Signal
// ============================================================================

/**
 * Соревнование промиса с AbortSignal.
 * SDK не поддерживает signal нативно, поэтому оборачиваем вызов.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("Tool call aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Tool call aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

// ============================================================================
// Error Sanitization
// ============================================================================

/**
 * Очистить ошибку провайдера перед отображением.
 * Убирает API-ключи Tavily из сообщений об ошибках.
 */
export function sanitizeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = message
    .replace(/tvly-[a-zA-Z0-9_-]+/gi, "[REDACTED]")
    .replace(/(authorization|x-api-key)[^\n]*/gi, "$1: [REDACTED]");
  return new Error(sanitized);
}

// ============================================================================
// Progress Update
// ============================================================================

/**
 * Отправить progress update в TUI во время выполнения инструмента.
 */
export function sendProgress(onUpdate: AgentToolUpdateCallback | undefined, message: string): void {
  onUpdate?.({
    content: [{ type: "text", text: message }],
    details: {},
  });
}

// ============================================================================
// Tool Result Assembly
// ============================================================================

/**
 * Применить усечение и собрать стандартный результат инструмента.
 */
export async function buildToolResult<TDetails>(
  fullOutput: string,
  ctx: ExtensionContext,
  toolName: string,
  buildDetails: (
    truncation: TruncateResult | undefined,
    fullOutputPath: string | undefined
  ) => TDetails
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details: TDetails;
}> {
  const { content, truncation, fullOutputPath } = await applyTruncation(
    fullOutput,
    ctx.cwd,
    toolName
  );

  return {
    content: [{ type: "text", text: content }],
    details: buildDetails(truncation, fullOutputPath),
  };
}
