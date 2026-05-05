import { describe, expect, it, vi } from 'vitest';
import { createMockExtensionAPI } from '../test-helpers/mock-api.js';

describe('pi-powerline index — registration', () => {
  it('registers /powerline command', async () => {
    const pi = createMockExtensionAPI();
    const mod = await import('../../extensions/pi-powerline/index.js');
    mod.default(pi);

    const cmd = pi._calls.registerCommand.find((c: any) => c.name === 'powerline');
    expect(cmd).toBeDefined();
    expect(cmd.options.description).not.toContain('header');
  });

  it('registers event handlers for session_start, model_select', async () => {
    const pi = createMockExtensionAPI();
    const mod = await import('../../extensions/pi-powerline/index.js');
    mod.default(pi);

    const events = pi._calls.on.map((c: any) => c.event);
    expect(events).toContain('session_start');
    expect(events).toContain('model_select');
  });

  it('autocomplete does NOT contain header:on or header:off', async () => {
    const pi = createMockExtensionAPI();
    const mod = await import('../../extensions/pi-powerline/index.js');
    mod.default(pi);

    const cmd = pi._calls.registerCommand.find((c: any) => c.name === 'powerline');
    const completions = cmd.options.getArgumentCompletions('');
    const values = completions.map((i: any) => i.value);

    expect(values).not.toContain('header:on');
    expect(values).not.toContain('header:off');
    expect(values).toContain('footer:on');
    expect(values).toContain('footer:off');
    expect(values).toContain('info');
  });

  it('/powerline info does not show header line', async () => {
    const pi = createMockExtensionAPI();
    const mod = await import('../../extensions/pi-powerline/index.js');
    mod.default(pi);

    const cmd = pi._calls.registerCommand.find((c: any) => c.name === 'powerline');
    const notify = vi.fn();
    const ctx = {
      cwd: '/tmp/nonexistent',
      ui: { notify },
    };

    await cmd.options.handler('info', ctx);

    expect(notify).toHaveBeenCalled();
    const notifiedText = notify.mock.calls[0][0] as string;
    expect(notifiedText).not.toContain('header');
    expect(notifiedText).toContain('powerline');
    expect(notifiedText).toContain('breadcrumb');
    expect(notifiedText).toContain('footer');
  });
});
