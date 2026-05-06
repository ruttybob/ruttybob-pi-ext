/**
 * Клиент Brave Search API.
 *
 * Выполняет поиск через https://api.search.brave.com/res/v1/web/search.
 * Ключ берётся только из env var BRAVE_SEARCH_API_KEY.
 */

export interface BraveSearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface BraveSearchResponse {
	results: BraveSearchResult[];
	query: string;
}

/**
 * Выполняет поиск через Brave Search API.
 * @throws Error если apiKey не задан или API вернул ошибку
 */
export async function searchBrave(
	query: string,
	maxResults: number,
	apiKey: string,
	signal?: AbortSignal,
): Promise<BraveSearchResponse> {
	const url = new URL('https://api.search.brave.com/res/v1/web/search');
	url.searchParams.set('q', query);
	url.searchParams.set('count', String(maxResults));

	const res = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Accept-Encoding': 'gzip',
			'X-Subscription-Token': apiKey,
		},
		signal,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Brave Search API error (${res.status}): ${text}`);
	}

	const data = (await res.json()) as {
		web?: {
			results?: Array<{
				title?: string;
				url?: string;
				description?: string;
			}>;
		};
	};

	const results: BraveSearchResult[] = (data.web?.results ?? []).map((r) => ({
		title: r.title ?? '',
		url: r.url ?? '',
		snippet: r.description ?? '',
	}));

	return { results, query };
}
