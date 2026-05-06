/**
 * Тесты tavily-интеграции в search-tools.
 *
 * Проверяют:
 * - Регистрацию tavily_web_search и tavily_web_extract при наличии TAVILY_API_KEY
 * - Отсутствие регистрации при отсутствии ключа
 * - Notify при session_start если ключ отсутствует
 * - Параметры и schema инструментов
 * - Очистку кэша при session_start
 */

import { describe, expect, it, vi } from 'vitest';
import { createMockExtensionAPI } from '../test-helpers/mock-api.js';
import { createMockCommandContext } from '../test-helpers/mock-context.js';
import extension from '../../extensions/search-tools/index.js';
import { resultCache } from '../../extensions/search-tools/src/tavily/cache.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('search-tools tavily integration', () => {
  /** Создаёт extension API с tavily-ключом */
  function setupWithTavily(extraEnv?: Record<string, string | undefined>) {
    const pi = createMockExtensionAPI();

    extension(pi, {
      env: {
        TAVILY_API_KEY: 'tvly-test-key-12345',
        ...extraEnv,
      },
    });

    const registeredTools = (pi as any)._calls.registerTool.map((t: any) => t.name);
    return { pi, registeredTools };
  }

  /** Создаёт extension API без tavily-ключа */
  function setupWithoutTavily(extraEnv?: Record<string, string | undefined>) {
    const pi = createMockExtensionAPI();

    extension(pi, {
      env: {
        ...extraEnv,
      },
    });

    const registeredTools = (pi as any)._calls.registerTool.map((t: any) => t.name);
    return { pi, registeredTools };
  }

  // -----------------------------------------------------------------------
  // Регистрация инструментов
  // -----------------------------------------------------------------------

  describe('регистрация tavily инструментов', () => {
    it('регистрирует tavily_web_search и tavily_web_extract при наличии TAVILY_API_KEY', () => {
      const { registeredTools } = setupWithTavily();

      expect(registeredTools).toContain('tavily_web_search');
      expect(registeredTools).toContain('tavily_web_extract');
    });

    it('не регистрирует tavily инструменты при отсутствии TAVILY_API_KEY', () => {
      const { registeredTools } = setupWithoutTavily();

      expect(registeredTools).not.toContain('tavily_web_search');
      expect(registeredTools).not.toContain('tavily_web_extract');
    });

    it('не регистрирует tavily инструменты при пустом TAVILY_API_KEY', () => {
      const pi = createMockExtensionAPI();
      extension(pi, { env: { TAVILY_API_KEY: '   ' } });

      const names = (pi as any)._calls.registerTool.map((t: any) => t.name);
      expect(names).not.toContain('tavily_web_search');
      expect(names).not.toContain('tavily_web_extract');
    });
  });

  // -----------------------------------------------------------------------
  // Notify при session_start
  // -----------------------------------------------------------------------

  describe('notify при отсутствии ключа', () => {
    it('показывает notify при session_start если TAVILY_API_KEY не задан', async () => {
      const { pi } = setupWithoutTavily();

      const notify = vi.fn();
      const ctx = createMockCommandContext({
        ui: { notify } as any,
      } as any);

      await (pi as any)._fire('session_start', {}, ctx);

      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('TAVILY_API_KEY'),
        'info',
      );
    });

    it('не показывает tavily-notify при наличии TAVILY_API_KEY', async () => {
      const { pi } = setupWithTavily();

      const notify = vi.fn();
      const ctx = createMockCommandContext({
        ui: { notify } as any,
      } as any);

      await (pi as any)._fire('session_start', {}, ctx);

      const tavilyNotify = notify.mock.calls.find(
        (call: any) => typeof call[0] === 'string' && call[0].includes('TAVILY_API_KEY'),
      );
      expect(tavilyNotify).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Schema и параметры инструментов
  // -----------------------------------------------------------------------

  describe('параметры tavily инструментов', () => {
    it('tavily_web_search имеет корректные параметры', () => {
      const { pi } = setupWithTavily();

      const tool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_search');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('tavily_web_search');
      expect(tool.label).toBe('Web Search');
      expect(tool.parameters).toBeDefined();
      // Проверяем что schema содержит query
      const schema = tool.parameters;
      expect(schema.properties).toHaveProperty('query');
      expect(schema.properties).toHaveProperty('max_results');
      expect(schema.properties).toHaveProperty('search_depth');
      expect(schema.properties).toHaveProperty('include_answer');
      expect(schema.properties).toHaveProperty('include_raw_content');
      expect(schema.properties).toHaveProperty('include_images');
      expect(schema.properties).toHaveProperty('days');
    });

    it('tavily_web_extract имеет корректные параметры', () => {
      const { pi } = setupWithTavily();

      const tool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_extract');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('tavily_web_extract');
      expect(tool.label).toBe('Web Extract');
      expect(tool.parameters).toBeDefined();
      // Проверяем что schema содержит urls
      const schema = tool.parameters;
      expect(schema.properties).toHaveProperty('urls');
      expect(schema.properties).toHaveProperty('extract_depth');
      expect(schema.properties).toHaveProperty('include_images');
      expect(schema.properties).toHaveProperty('format');
      expect(schema.properties).toHaveProperty('query');
    });

    it('оба tavily инструмента имеют promptSnippet и promptGuidelines', () => {
      const { pi } = setupWithTavily();

      const searchTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_search');
      const extractTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_extract');

      expect(searchTool.promptSnippet).toBeDefined();
      expect(searchTool.promptGuidelines).toBeDefined();
      expect(Array.isArray(searchTool.promptGuidelines)).toBe(true);

      expect(extractTool.promptSnippet).toBeDefined();
      expect(extractTool.promptGuidelines).toBeDefined();
      expect(Array.isArray(extractTool.promptGuidelines)).toBe(true);
    });

    it('оба tavily инструмента имеют renderCall и renderResult', () => {
      const { pi } = setupWithTavily();

      const searchTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_search');
      const extractTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_extract');

      expect(typeof searchTool.renderCall).toBe('function');
      expect(typeof searchTool.renderResult).toBe('function');

      expect(typeof extractTool.renderCall).toBe('function');
      expect(typeof extractTool.renderResult).toBe('function');
    });

    it('оба tavily инструмента имеют execute', () => {
      const { pi } = setupWithTavily();

      const searchTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_search');
      const extractTool = (pi as any)._calls.registerTool.find((t: any) => t.name === 'tavily_web_extract');

      expect(typeof searchTool.execute).toBe('function');
      expect(typeof extractTool.execute).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // session_shutdown — cleanup
  // -----------------------------------------------------------------------

  describe('session_shutdown cleanup', () => {
    it('регистрирует session_shutdown обработчик', () => {
      const { pi } = setupWithTavily();

      const events = (pi as any)._calls.on.map((c: any) => c.event);
      expect(events).toContain('session_shutdown');
    });
  });

  // -----------------------------------------------------------------------
  // session_start — очистка resultCache
  // -----------------------------------------------------------------------

  describe('session_start очищает resultCache', () => {
    it('очищает кэш результатов tavily при session_start', async () => {
      const { pi } = setupWithTavily();

      // Наполняем кэш фиктивными данными
      resultCache.set({ url: 'https://example.com/page1', text: 'content 1' });
      resultCache.set({ url: 'https://example.com/page2', text: 'content 2' });
      expect(resultCache.get('https://example.com/page1')).toBeDefined();
      expect(resultCache.get('https://example.com/page2')).toBeDefined();

      // Вызываем session_start
      const ctx = createMockCommandContext();

      await (pi as any)._fire('session_start', {}, ctx);

      // Кэш должен быть пуст
      expect(resultCache.get('https://example.com/page1')).toBeUndefined();
      expect(resultCache.get('https://example.com/page2')).toBeUndefined();
    });
  });
});
