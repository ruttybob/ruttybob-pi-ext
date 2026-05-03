import { describe, expect, it, vi } from 'vitest';
import { createMockExtensionAPI } from '../test-helpers/mock-api.ts';
import { createMockCommandContext } from '../test-helpers/mock-context.ts';
import extension from '../../extensions/zai-tools/index.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('zai-tools /zai-tools toggle command', () => {
  function setup() {
    const pi = createMockExtensionAPI();

    // Подменим getActiveTools/setActiveTools для отслеживания состояния
    let activeTools: string[] = ['read', 'bash', 'edit', 'write'];

    (pi as any).getActiveTools = () => activeTools;
    (pi as any).setActiveTools = vi.fn((names: string[]) => {
      activeTools = names;
    });

    // Загрузить расширение с одним модулем для простоты
    extension(pi, {
      env: {
        ZAI_API_KEY: 'test-key',
        ZAI_ENABLED_MODULES: 'search',
      },
    });

    // После загрузки расширения — zai-tools добавлены в activeTools
    const registeredTools = (pi as any)._calls.registerTool.map((t: any) => t.name);
    activeTools = [...activeTools, ...registeredTools];

    return { pi, registeredTools, getActiveTools: () => activeTools };
  }

  it('registers the /zai-tools command', () => {
    const { pi } = setup();

    const commandNames = (pi as any)._calls.registerCommand.map((c: any) => c.name);
    expect(commandNames).toContain('zai-tools');
  });

  it('registers session_start and session_tree hooks', () => {
    const { pi } = setup();

    const events = (pi as any)._calls.on.map((c: any) => c.event);
    expect(events).toContain('session_start');
    expect(events).toContain('session_tree');
  });

  it('toggle off removes all zai-tools from active set', async () => {
    const { pi, getActiveTools } = setup();

    const cmd = (pi as any)._calls.registerCommand.find((c: any) => c.name === 'zai-tools');
    const ctx = createMockCommandContext();

    await cmd.options.handler('', ctx);

    const active = getActiveTools();
    // zai-tools должны быть убраны, встроенные — на месте
    expect(active).toContain('read');
    expect(active).toContain('bash');
    expect(active).not.toContain('zai_web_search');
  });

  it('toggle on adds zai-tools back to active set', async () => {
    const { pi, getActiveTools } = setup();

    const cmd = (pi as any)._calls.registerCommand.find((c: any) => c.name === 'zai-tools');
    const ctx = createMockCommandContext();

    // Первый вызов — off
    await cmd.options.handler('', ctx);
    expect(getActiveTools()).not.toContain('zai_web_search');

    // Второй вызов — on
    await cmd.options.handler('', ctx);
    expect(getActiveTools()).toContain('zai_web_search');
    expect(getActiveTools()).toContain('read');
  });

  it('persists state via appendEntry', async () => {
    const { pi } = setup();

    const cmd = (pi as any)._calls.registerCommand.find((c: any) => c.name === 'zai-tools');
    const ctx = createMockCommandContext();

    await cmd.options.handler('', ctx);

    const entries = (pi as any)._calls.appendEntry;
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry.type).toBe('custom');
    expect(lastEntry.data).toEqual({ customType: 'zai-tools-state', enabled: false });
  });

  it('shows notify with correct status', async () => {
    const { pi } = setup();

    const cmd = (pi as any)._calls.registerCommand.find((c: any) => c.name === 'zai-tools');
    const notifySpy = vi.fn();
    const ctx = createMockCommandContext({
      ui: { notify: notifySpy } as any,
    } as any);

    // Toggle off
    await cmd.options.handler('', ctx);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining('disabled'),
      'info',
    );

    notifySpy.mockClear();

    // Toggle on
    await cmd.options.handler('', ctx);
    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining('enabled'),
      'info',
    );
  });

  it('session_start restores disabled state from branch entries', async () => {
    const { pi, registeredTools } = setup();

    // Подменим getBranch чтобы вернуть сохранённое состояние disabled
    const ctx = createMockCommandContext({
      sessionManager: {
        getBranch: () => [
          { type: 'custom', customType: 'zai-tools-state', data: { enabled: false } },
        ],
      },
    } as any);

    await (pi as any)._fire('session_start', {}, ctx);

    // После restore zai-tools должны быть убраны из активного набора
    expect((pi as any).setActiveTools).toHaveBeenCalledWith(
      expect.not.arrayContaining(registeredTools),
    );
  });
});
