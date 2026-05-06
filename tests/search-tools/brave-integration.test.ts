/**
 * Тесты brave-интеграции в search-tools.
 *
 * Проверяют:
 * - Регистрацию web_search и web_fetch при наличии BRAVE_SEARCH_API_KEY
 * - Отсутствие регистрации при отсутствии ключа
 * - Notify при session_start если ключ отсутствует
 */

import { describe, expect, it, vi } from 'vitest';
import { createMockExtensionAPI } from '../test-helpers/mock-api.js';
import { createMockCommandContext } from '../test-helpers/mock-context.js';
import extension from '../../extensions/search-tools/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('search-tools brave integration', () => {
	/** Создаёт extension API с brave-ключом */
	function setupWithBrave(extraEnv?: Record<string, string | undefined>) {
		const pi = createMockExtensionAPI();

		extension(pi, {
			env: {
				BRAVE_SEARCH_API_KEY: 'test-brave-key',
				...extraEnv,
			},
		});

		const registeredTools = (pi as any)._calls.registerTool.map((t: any) => t.name);
		return { pi, registeredTools };
	}

	/** Создаёт extension API без brave-ключа */
	function setupWithoutBrave() {
		const pi = createMockExtensionAPI();

		extension(pi, {
			env: {},
		});

		return { pi };
	}

	// -----------------------------------------------------------------------
	// Регистрация инструментов
	// -----------------------------------------------------------------------

	describe('регистрация brave инструментов', () => {
		it('регистрирует web_search и web_fetch при наличии BRAVE_SEARCH_API_KEY', () => {
			const { registeredTools } = setupWithBrave();

			expect(registeredTools).toContain('brave_web_search');
			expect(registeredTools).toContain('brave_web_fetch');
		});

		it('не регистрирует brave инструменты при отсутствии BRAVE_SEARCH_API_KEY', () => {
			const { pi } = setupWithoutBrave();

			const registeredTools = (pi as any)._calls.registerTool.map((t: any) => t.name);
			expect(registeredTools).not.toContain('brave_web_search');
			expect(registeredTools).not.toContain('brave_web_fetch');
		});

		it('не регистрирует brave инструменты при пустом BRAVE_SEARCH_API_KEY', () => {
			const pi2 = createMockExtensionAPI();
			extension(pi2, { env: { BRAVE_SEARCH_API_KEY: '   ' } });

			const names = (pi2 as any)._calls.registerTool.map((t: any) => t.name);
			expect(names).not.toContain('brave_web_search');
			expect(names).not.toContain('brave_web_fetch');
		});
	});

	// -----------------------------------------------------------------------
	// Notify при session_start
	// -----------------------------------------------------------------------

	describe('notify при отсутствии ключа', () => {
		it('показывает notify при session_start если BRAVE_SEARCH_API_KEY не задан', async () => {
			const { pi } = setupWithoutBrave();

			const notify = vi.fn();
			const ctx = createMockCommandContext({
				ui: { notify } as any,
			} as any);

			await (pi as any)._fire('session_start', {}, ctx);

			expect(notify).toHaveBeenCalledWith(
				expect.stringContaining('BRAVE_SEARCH_API_KEY'),
				'info',
			);
		});

		it('не показывает brave-notify при наличии BRAVE_SEARCH_API_KEY', async () => {
			const { pi } = setupWithBrave();

			const notify = vi.fn();
			const ctx = createMockCommandContext({
				ui: { notify } as any,
			} as any);

			await (pi as any)._fire('session_start', {}, ctx);

			// Не должно быть notify о BRAVE_SEARCH_API_KEY
			const braveNotify = notify.mock.calls.find(
				(call: any) => typeof call[0] === 'string' && call[0].includes('BRAVE_SEARCH_API_KEY'),
			);
			expect(braveNotify).toBeUndefined();
		});
	});
});
