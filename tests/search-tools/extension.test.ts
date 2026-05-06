import { describe, expect, it, vi } from 'vitest';
import extension from '../../extensions/search-tools/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockPi() {
  return {
    registerTool: vi.fn(),
    exec: vi.fn(),
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerShortcut: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
    setSessionName: vi.fn(),
    getSessionName: vi.fn(),
    setLabel: vi.fn(),
    getCommands: vi.fn(() => []),
    registerMessageRenderer: vi.fn(),
    getActiveTools: vi.fn(() => []),
    getAllTools: vi.fn(() => []),
    setActiveTools: vi.fn(),
    setModel: vi.fn(),
    getThinkingLevel: vi.fn(),
    setThinkingLevel: vi.fn(),
    events: { on: vi.fn(), emit: vi.fn() },
    registerProvider: vi.fn(),
    unregisterProvider: vi.fn(),
  } as any;
}

describe('search-tools extension', () => {
  it('регистрирует инструменты включённых модулей zai', () => {
    const pi = createMockPi();

    extension(pi, {
      env: {
        ZAI_API_KEY: 'test-key',
        ZAI_ENABLED_MODULES: 'search,reader',
      },
    });

    const names = pi.registerTool.mock.calls.map(([tool]: any) => tool.name);
    expect(names).toEqual(['zai_web_search', 'zai_web_reader']);
  });

  it('регистрирует vision-инструменты при включённом модуле', () => {
    const pi = createMockPi();

    extension(pi, {
      env: {
        ZAI_API_KEY: 'test-key',
        ZAI_ENABLED_MODULES: 'vision',
      },
    });

    const names = pi.registerTool.mock.calls.map(([tool]: any) => tool.name);
    expect(names).toEqual([
      'zai_vision_ui_to_artifact',
      'zai_vision_extract_text',
      'zai_vision_diagnose_error',
      'zai_vision_understand_diagram',
      'zai_vision_analyze_data_viz',
      'zai_vision_ui_diff_check',
      'zai_vision_analyze_image',
      'zai_vision_analyze_video',
    ]);
  });

  it('регистрирует все инструменты при всех модулях', () => {
    const pi = createMockPi();

    extension(pi, {
      env: {
        ZAI_API_KEY: 'test-key',
        ZAI_ENABLED_MODULES: 'search,reader,zread,vision',
      },
    });

    const names = pi.registerTool.mock.calls.map(([tool]: any) => tool.name);
    expect(names).toEqual([
      'zai_web_search',
      'zai_web_reader',
      'zai_zread_search_doc',
      'zai_zread_get_repo_structure',
      'zai_zread_read_file',
      'zai_vision_ui_to_artifact',
      'zai_vision_extract_text',
      'zai_vision_diagnose_error',
      'zai_vision_understand_diagram',
      'zai_vision_analyze_data_viz',
      'zai_vision_ui_diff_check',
      'zai_vision_analyze_image',
      'zai_vision_analyze_video',
    ]);
  });

  it('не регистрирует инструменты при отсутствии ZAI_API_KEY', () => {
    const pi = createMockPi();

    extension(pi, {
      env: {},
    });

    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it('уведомляет при session_start если ZAI_API_KEY отсутствует', async () => {
    const pi = createMockPi();

    extension(pi, {
      env: {},
    });

    // Проверяем что зарегистрирован session_start handler
    const startHandler = pi.on.mock.calls.find(([e]: any) => e === 'session_start');
    expect(startHandler).toBeDefined();

    // Вызываем handler
    const notify = vi.fn();
    const ctx = { ui: { notify } } as any;
    await startHandler[1]({}, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('ZAI_API_KEY'),
      'info',
    );
  });

  it('регистрирует обработчики session_start и session_shutdown', () => {
    const pi = createMockPi();

    extension(pi, {
      env: { ZAI_API_KEY: 'test-key', ZAI_ENABLED_MODULES: 'search' },
    });

    const events = pi.on.mock.calls.map(([event]: any) => event);
    expect(events).toContain('session_start');
    expect(events).toContain('session_shutdown');
  });
});
