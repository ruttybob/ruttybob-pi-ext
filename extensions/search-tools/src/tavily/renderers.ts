/**
 * TUI-рендереры для Tavily-инструментов.
 *
 * Перенесено из extensions/tavily-tools/tools/tavily/renderers.ts.
 */

import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { DEFAULT_MAX_RESULTS } from "./client.js";
import type { SearchResponseDetails, WebExtractDetails, WebSearchDetails } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export type ToolCallResult = {
  details?: unknown;
  content: Array<{ type: string; text?: string }>;
};

type Theme = {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

// ============================================================================
// Render Call
// ============================================================================

/**
 * Рендер вызова web search
 */
export function renderWebSearchCall(args: Record<string, unknown>, theme: Theme): Text {
  let text = theme.fg("toolTitle", theme.bold("tavily_web_search "));
  const query = typeof args.query === "string" ? args.query : "(no query)";
  text += theme.fg("accent", `"${query}"`);

  const options: string[] = [];
  if (typeof args.max_results === "number" && args.max_results !== DEFAULT_MAX_RESULTS) {
    options.push(`max=${args.max_results}`);
  }
  if (args.search_depth === "advanced") {
    options.push("advanced");
  }
  if (args.include_answer === false) {
    options.push("no-answer");
  }
  if (args.include_raw_content === true) {
    options.push("raw-content");
  }
  if (args.include_images === true) {
    options.push("images");
  }
  if (args.days && typeof args.days === "number") {
    options.push(`${args.days}d`);
  }

  if (options.length > 0) {
    text += ` ${theme.fg("dim", `[${options.join(", ")}]`)}`;
  }

  return new Text(truncateToWidth(text, 100), 0, 0);
}

/**
 * Рендер бейджа опций
 */
function renderOptionsBadge(details: SearchResponseDetails, theme: Theme): string {
  const options: string[] = [];
  if (details.searchDepth === "advanced") {
    options.push("advanced");
  }
  if ("includeImages" in details && details.includeImages) {
    options.push("images");
  }
  if (details.days) {
    options.push(`${details.days}d`);
  }
  return options.length > 0 ? theme.fg("dim", ` (${options.join(", ")})`) : "";
}

// ============================================================================
// Render Result
// ============================================================================

/**
 * Рендер результата web search
 */
export function renderWebSearchResult(
  result: ToolCallResult,
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme
): Text {
  const details = result.details as WebSearchDetails | undefined;

  if (state.isPartial) {
    return new Text(theme.fg("warning", "Searching..."), 0, 0);
  }

  if (details?.error) {
    return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
  }

  return renderSearchResultCommon(details, state.expanded, theme, true);
}

/**
 * Рендер вызова web extract
 */
export function renderExtractCall(args: Record<string, unknown>, theme: Theme): Text {
  let text = theme.fg("toolTitle", theme.bold("tavily_web_extract "));
  const urls = Array.isArray(args.urls) ? args.urls : [];
  const urlCount = urls.length;

  if (urlCount === 0) {
    text += theme.fg("warning", "(no URLs)");
  } else if (urlCount === 1) {
    const url = typeof urls[0] === "string" ? urls[0] : "(invalid)";
    text += theme.fg("accent", `"${url}"`);
  } else {
    text += theme.fg("accent", `${urlCount} URLs`);
  }

  const options: string[] = [];
  if (args.extract_depth === "advanced") {
    options.push("advanced");
  }
  if (args.include_images === true) {
    options.push("images");
  }
  if (args.format === "text") {
    options.push("text");
  }
  if (args.query && typeof args.query === "string") {
    options.push(`query: "${args.query.slice(0, 20)}"`);
  }

  if (options.length > 0) {
    text += ` ${theme.fg("dim", `[${options.join(", ")}]`)}`;
  }

  return new Text(truncateToWidth(text, 100), 0, 0);
}

/**
 * Рендер результата web extract
 */
export function renderExtractResult(
  result: ToolCallResult,
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme
): Text {
  const details = result.details as WebExtractDetails | undefined;

  if (state.isPartial) {
    return new Text(theme.fg("warning", "Extracting..."), 0, 0);
  }

  if (details?.error) {
    return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
  }

  return renderExtractResultCommon(details, state.expanded, theme);
}

// ============================================================================
// Common renderers
// ============================================================================

type ExtendedTheme = Theme & {
  accent: (text: string) => string;
  dim: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  text: (text: string) => string;
};

function renderExtractResultCommon(
  details: WebExtractDetails | undefined,
  expanded: boolean,
  theme: Theme
): Text {
  let text = "";

  if (details) {
    const summary = `${details.successCount}/${details.urlCount} extracted`;
    text += theme.fg("success", summary);

    if (details.failureCount > 0) {
      text += ` ${theme.fg("warning", `(${details.failureCount} failed)`)}`;
    }

    const options: string[] = [];
    if (details.extractDepth === "advanced") {
      options.push("advanced");
    }
    if (details.includeImages) {
      options.push("images");
    }
    if (details.format === "text") {
      options.push("text");
    }
    if (options.length > 0) {
      text += theme.fg("dim", ` (${options.join(", ")})`);
    }

    if (details.truncation?.truncated) {
      text += " " + (theme as ExtendedTheme).fg("warning", "(truncated)");
    }

    if (expanded) {
      if (details.results.length > 0) {
        text += "\n\n";
        text += (theme as ExtendedTheme).fg("accent", "Extracted:") + "\n";

        const displayResults = details.results.slice(0, 5);
        for (let i = 0; i < displayResults.length; i++) {
          const result = displayResults[i]!;
          text += `\n${(theme as ExtendedTheme).fg("accent", `${i + 1}.`)} ${result.title || "Untitled"}\n`;
          text += `   ${(theme as ExtendedTheme).fg("dim", result.url)}\n`;
        }

        if (details.results.length > 5) {
          text += `\n${(theme as ExtendedTheme).fg("dim", `... ${details.results.length - 5} more`)}`;
        }
      }

      if (details.failedResults.length > 0) {
        text += "\n\n";
        text += (theme as ExtendedTheme).fg("error", "Failed:") + "\n";

        const displayFailed = details.failedResults.slice(0, 3);
        for (let i = 0; i < displayFailed.length; i++) {
          const failed = displayFailed[i]!;
          text += `\n${(theme as ExtendedTheme).fg("error", `${i + 1}.`)} ${failed.url}\n`;
          text += `   ${(theme as ExtendedTheme).fg("dim", failed.error)}\n`;
        }

        if (details.failedResults.length > 3) {
          text += `\n${(theme as ExtendedTheme).fg("dim", `... ${details.failedResults.length - 3} more`)}`;
        }
      }

      if (details.fullOutputPath) {
        text += "\n\n";
        text += (theme as ExtendedTheme).fg("dim", `Full output: ${details.fullOutputPath}`);
      }
    }
  }

  return new Text(text, 0, 0);
}

function renderSearchResultCommon(
  details: SearchResponseDetails | undefined,
  expanded: boolean,
  theme: Theme,
  includeAnswer: boolean
): Text {
  let text = "";

  if (details) {
    text += theme.fg(
      "success",
      `${details.resultCount} result${details.resultCount !== 1 ? "s" : ""}`
    );

    text += renderOptionsBadge(details, theme);

    if (details.truncation?.truncated) {
      text += " " + (theme as ExtendedTheme).fg("warning", "(truncated)");
    }

    if (expanded && details.sources.length > 0) {
      text += "\n\n";
      const displaySources = details.sources.slice(0, 5);

      for (let i = 0; i < displaySources.length; i++) {
        const source = displaySources[i];
        if (source) {
          text += `${(theme as ExtendedTheme).fg("accent", `${i + 1}.`)} ${source.title}\n`;
          text += `   ${(theme as ExtendedTheme).fg("dim", source.url)}\n`;
        }
      }

      if (details.sources.length > 5) {
        text += `\n${(theme as ExtendedTheme).fg("dim", `... ${details.sources.length - 5} more`)}`;
      }

      if (details.fullOutputPath) {
        text += `\n\n${(theme as ExtendedTheme).fg("dim", `Full output: ${details.fullOutputPath}`)}`;
      }
    }

    if (expanded && includeAnswer && "answer" in details && details.answer) {
      text += "\n\n";
      text += (theme as ExtendedTheme).fg("accent", "AI Answer: ");
      text += (theme as ExtendedTheme).fg("text", details.answer);
    }
  }

  return new Text(text, 0, 0);
}
