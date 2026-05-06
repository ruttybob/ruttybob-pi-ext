/**
 * Утилиты для преобразования HTML → text.
 * Используется в brave web_fetch.
 */

/** Убирает HTML-теги и декодирует entities, возвращая читаемый текст */
export function htmlToText(html: string): string {
	let text = html;
	text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
	text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
	text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
	text = text.replace(
		/<\/(p|div|h[1-6]|li|tr|br|blockquote|pre|section|article|header|footer|nav|details|summary)>/gi,
		'\n',
	);
	text = text.replace(/<br\s*\/?>/gi, '\n');
	text = text.replace(/<[^>]+>/g, ' ');
	text = text.replace(/&amp;/g, '&');
	text = text.replace(/&lt;/g, '<');
	text = text.replace(/&gt;/g, '>');
	text = text.replace(/&quot;/g, '"');
	text = text.replace(/&#39;/g, "'");
	text = text.replace(/&nbsp;/g, ' ');
	text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
	text = text.replace(/[ \t]+/g, ' ');
	text = text.replace(/\n{3,}/g, '\n\n');
	return text.trim();
}

/** Извлекает <title> из HTML */
export function extractTitle(html: string): string | undefined {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (match) {
		return match[1].replace(/<[^>]+>/g, '').trim() || undefined;
	}
	return undefined;
}
