/**
 * Brave web_fetch — HTTP-запрос + HTML-to-text с truncation.
 *
 * Регистрируется в группе `brave` расширения search-tools.
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentToolUpdateCallback } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncateResult,
	truncateHead,
} from '@mariozechner/pi-coding-agent';
import { htmlToText, extractTitle } from '../utils/html.js';

interface FetchDetails {
	url: string;
	title?: string;
	contentType?: string;
	contentLength?: number;
	truncation?: TruncateResult;
	fullOutputPath?: string;
}

/**
 * Brave web_fetch — HTTP-клиент без авторизации.
 *
 * Не требует API-ключа, т.к. выполняет прямой HTTP-запрос.
 * Привязан к группе `brave` для управления доступностью через toggle:
 * если BRAVE_SEARCH_API_KEY не задан, инструмент не регистрируется,
 * чтобы не плодить неуправляемые инструменты.
 */
export function createBraveWebFetchTool(onInvoke?: () => void) {
	return {
		name: 'brave_web_fetch' as const,
		label: 'Brave Web Fetch',
		description:
			'Fetch the content of a specific URL via HTTP. Returns text content for HTML pages (tags stripped), raw text for plain text or JSON. Supports http and https only. Content is truncated to avoid overwhelming the context window. Does not require Brave API key.',
		promptSnippet: 'Fetch and read content from a specific URL via Brave Web Fetch',
		promptGuidelines: [
			'Use brave_web_fetch to read the full content of a specific URL — documentation pages, blog posts, API references found via brave_web_search.',
			'brave_web_fetch is complementary to brave_web_search: search finds URLs, fetch reads them.',
			'After answering using fetched content, include a "Sources:" section with a markdown hyperlink to the fetched URL.',
			'Large responses are truncated and spilled to a temp file — the temp path is reported in the result details.',
		],
		parameters: Type.Object({
			url: Type.String({
				description: 'The URL to fetch. Must be http or https.',
			}),
			raw: Type.Optional(
				Type.Boolean({
					description: 'If true, return the raw HTML instead of extracted text. Default: false.',
					default: false,
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { url: string; raw?: boolean },
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		) {
			const { url, raw = false } = params;

			onInvoke?.();

			let parsedUrl: URL;
			try {
				parsedUrl = new URL(url);
			} catch {
				throw new Error(`Invalid URL: ${url}`);
			}
			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}. Only http and https are supported.`);
			}

			onUpdate?.({
				content: [{ type: 'text', text: `Fetching: ${url}...` }],
				details: { url } as FetchDetails,
			});

			const res = await fetch(url, {
				signal,
				redirect: 'follow',
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; rpiv-pi/1.0)',
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
				},
			});

			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
			}

			const contentType = res.headers.get('content-type') ?? '';
			const contentLength = res.headers.get('content-length');

			if (
				contentType.includes('image/') ||
				contentType.includes('video/') ||
				contentType.includes('audio/')
			) {
				throw new Error(`Unsupported content type: ${contentType}. web_fetch supports text pages only.`);
			}

			const body = await res.text();

			let resultText: string;
			let title: string | undefined;

			if (contentType.includes('text/html') && !raw) {
				title = extractTitle(body);
				resultText = htmlToText(body);
			} else {
				resultText = body;
			}

			const truncation = truncateHead(resultText, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			const details: FetchDetails = {
				url,
				title,
				contentType,
				contentLength: contentLength ? Number(contentLength) : undefined,
			};

			let output = truncation.content;

			if (truncation.truncated) {
				const tempDir = await mkdtemp(join(tmpdir(), 'rpiv-fetch-'));
				const tempFile = join(tempDir, 'content.txt');
				await writeFile(tempFile, resultText, 'utf8');
				details.truncation = truncation;
				details.fullOutputPath = tempFile;

				const truncatedLines = truncation.totalLines - truncation.outputLines;
				const truncatedBytes = truncation.totalBytes - truncation.outputBytes;
				output += `\n\n[Content truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
				output += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
				output += ` ${truncatedLines} lines (${formatSize(truncatedBytes)}) omitted.`;
				output += ` Full content saved to: ${tempFile}]`;
			}

			let header = `**Fetched:** ${url}`;
			if (title) header += `\n**Title:** ${title}`;
			if (contentType) header += `\n**Content-Type:** ${contentType}`;
			header += '\n\n';

			return {
				content: [{ type: 'text' as const, text: header + output }],
				details,
			};
		},

		renderCall(args: { url: string }, theme: any, _context: any) {
			let text = theme.fg('toolTitle', theme.bold('BraveWebFetch '));
			text += theme.fg('accent', args.url);
			return { text, x: 0, y: 0 };
		},

		renderResult(
			result: { details?: FetchDetails; content?: Array<{ type: string; text?: string }> },
			{ expanded, isPartial }: { expanded: boolean; isPartial: boolean },
			theme: any,
			_context: any,
		) {
			if (isPartial) {
				return { text: theme.fg('warning', 'Fetching...'), x: 0, y: 0 };
			}
			const details = result.details;
			let text = theme.fg('success', '✓ Fetched');
			if (details?.title) {
				text += theme.fg('muted', `: ${details.title}`);
			}
			if (details?.truncation?.truncated) {
				text += theme.fg('warning', ' (truncated)');
			}
			if (expanded) {
				const content = result.content?.[0];
				if (content?.type === 'text' && content.text) {
					const lines = content.text.split('\n').slice(0, 15);
					for (const line of lines) {
						text += `\n  ${theme.fg('dim', line)}`;
					}
					if (content.text.split('\n').length > 15) {
						text += `\n  ${theme.fg('muted', '... (use read tool to see full content)')}`;
					}
				}
			}
			return { text, x: 0, y: 0 };
		},
	};
}


