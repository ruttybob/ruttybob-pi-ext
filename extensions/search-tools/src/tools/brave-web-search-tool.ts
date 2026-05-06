/**
 * Brave web_search — поиск через Brave Search API.
 *
 * Регистрируется в группе `brave` расширения search-tools.
 */

import type { AgentToolUpdateCallback } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { BraveSearchResult } from '../services/brave-search.js';
import { searchBrave } from '../services/brave-search.js';

export function createBraveWebSearchTool(apiKey: string, onInvoke?: () => void) {
	return {
		name: 'brave_web_search' as const,
		label: 'Brave Web Search',
		description:
			'Search the web for information via the Brave Search API. Returns a list of results with titles, URLs, and snippets. Use when you need current information not in your training data.',
		promptSnippet: 'Search the web for up-to-date information via Brave Search',
		promptGuidelines: [
			'Use brave_web_search for information beyond your training data — recent events, current library versions, live API documentation.',
			'Use the current year from "Current date:" in your context when searching for recent information or documentation.',
			'After answering using search results, include a "Sources:" section listing relevant URLs as markdown hyperlinks: [Title](URL). Never skip this.',
			'Domain filtering is supported to include or block specific websites.',
			'If BRAVE_SEARCH_API_KEY is not set, ask the user to set the environment variable before proceeding.',
		],
		parameters: Type.Object({
			query: Type.String({
				description: 'The search query. Be specific and use natural language.',
			}),
			max_results: Type.Optional(
				Type.Number({
					description: 'Maximum number of results to return (1-10). Default: 5.',
					default: 5,
					minimum: 1,
					maximum: 10,
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { query: string; max_results?: number },
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		) {
			const maxResults = Math.min(Math.max(params.max_results ?? 5, 1), 10);

			onInvoke?.();

			onUpdate?.({
				content: [{ type: 'text', text: `Searching Brave for: "${params.query}"...` }],
				details: { query: params.query, backend: 'brave', resultCount: 0 },
			});

			const response = await searchBrave(params.query, maxResults, apiKey, signal);

			if (response.results.length === 0) {
				return {
					content: [
						{
							type: 'text' as const,
							text: `No results found for "${params.query}".`,
						},
					],
					details: { query: params.query, backend: 'brave', resultCount: 0 },
				};
			}

			let text = `**Search results for "${response.query}":**\n\n`;
			for (let i = 0; i < response.results.length; i++) {
				const r = response.results[i];
				text += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}\n\n`;
			}

			return {
				content: [{ type: 'text' as const, text: text.trimEnd() }],
				details: {
					query: params.query,
					backend: 'brave',
					resultCount: response.results.length,
					results: response.results,
				},
			};
		},

		renderCall(args: { query: string }, theme: any, _context: any) {
			let text = theme.fg('toolTitle', theme.bold('BraveWebSearch '));
			text += theme.fg('accent', `"${args.query}"`);
			return { text, x: 0, y: 0 };
		},

		renderResult(
			result: { details?: { resultCount?: number; results?: BraveSearchResult[] } },
			{ expanded, isPartial }: { expanded: boolean; isPartial: boolean },
			theme: any,
			_context: any,
		) {
			if (isPartial) {
				return { text: theme.fg('warning', 'Searching...'), x: 0, y: 0 };
			}
			const details = result.details;
			const count = details?.resultCount ?? 0;
			let text = theme.fg('success', `✓ ${count} result${count !== 1 ? 's' : ''}`);
			if (expanded && details?.results) {
				for (const r of details.results.slice(0, 5)) {
					text += `\n  ${theme.fg('dim', `• ${r.title}`)}`;
				}
				if (details.results.length > 5) {
					text += `\n  ${theme.fg('dim', `... and ${details.results.length - 5} more`)}`;
				}
			}
			return { text, x: 0, y: 0 };
		},
	};
}
