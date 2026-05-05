/**
 * Stub-модуль для @tavily/core.
 */

export interface TavilySearchOptions {
	maxResults?: number;
	searchDepth?: "basic" | "advanced";
	includeAnswer?: boolean;
	includeImages?: boolean;
	includeRawContent?: boolean | "markdown" | "text";
	days?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
}

export interface TavilyExtractOptions {
	extractDepth?: "basic" | "advanced";
	includeImages?: boolean;
	format?: "markdown" | "text";
	query?: string;
	urls?: string[];
}

export interface TavilyClient {
	search(query: string, options?: TavilySearchOptions): Promise<unknown>;
	extract(urls: string[], options?: TavilyExtractOptions): Promise<unknown>;
}

export function tavily(options: { apiKey: string }): TavilyClient {
	return {
		async search(_query: string, _options?: TavilySearchOptions): Promise<unknown> {
			return { answer: null, results: [], images: [] };
		},
		async extract(_urls: string[], _options?: TavilyExtractOptions): Promise<unknown> {
			return { results: [], failedResults: [] };
		},
	};
}
