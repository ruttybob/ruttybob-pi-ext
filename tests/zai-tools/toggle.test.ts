import { describe, expect, it } from 'vitest';
import { createToggleManager } from '../../extensions/zai-tools/src/toggle.js';

describe('createToggleManager', () => {
  const zaiToolNames = ['zai_web_search', 'zai_web_reader', 'zai_zread_search_doc'];

  it('starts enabled by default', () => {
    const manager = createToggleManager(zaiToolNames);
    expect(manager.isEnabled()).toBe(true);
  });

  it('toggle off removes zai-tools from active set', () => {
    const manager = createToggleManager(zaiToolNames);
    const activeTools = ['read', 'bash', 'zai_web_search', 'zai_web_reader', 'zai_zread_search_doc'];

    const result = manager.toggle(activeTools);

    expect(result.enabled).toBe(false);
    expect(result.newActiveTools).toEqual(['read', 'bash']);
    expect(manager.isEnabled()).toBe(false);
  });

  it('toggle on adds zai-tools back to active set', () => {
    const manager = createToggleManager(zaiToolNames);
    const activeTools = ['read', 'bash', 'zai_web_search', 'zai_web_reader', 'zai_zread_search_doc'];

    // Сначала выключаем
    manager.toggle(activeTools);

    // Теперь включаем обратно — zai-tools в activeTools уже нет
    const currentAfterOff = ['read', 'bash'];
    const result = manager.toggle(currentAfterOff);

    expect(result.enabled).toBe(true);
    expect(result.newActiveTools).toEqual(['read', 'bash', 'zai_web_search', 'zai_web_reader', 'zai_zread_search_doc']);
    expect(manager.isEnabled()).toBe(true);
  });

  describe('restoreFromEntries', () => {
    it('restores disabled state from session entries', () => {
      const manager = createToggleManager(zaiToolNames);
      expect(manager.isEnabled()).toBe(true);

      const entries = [
        { type: 'custom', customType: 'zai-tools-state', data: { enabled: false } },
      ];

      const result = manager.restoreFromEntries(entries);

      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
      expect(manager.isEnabled()).toBe(false);
    });

    it('restores enabled state from session entries', () => {
      const manager = createToggleManager(zaiToolNames);

      // Сначала toggle off
      manager.toggle(['read', 'bash', 'zai_web_search']);
      expect(manager.isEnabled()).toBe(false);

      // Restore перезаписывает
      const entries = [
        { type: 'custom', customType: 'zai-tools-state', data: { enabled: true } },
      ];

      manager.restoreFromEntries(entries);
      expect(manager.isEnabled()).toBe(true);
    });

    it('returns null when no matching entries exist', () => {
      const manager = createToggleManager(zaiToolNames);

      const entries = [
        { type: 'custom', customType: 'other-config', data: { foo: 'bar' } },
      ];

      const result = manager.restoreFromEntries(entries);
      expect(result).toBeNull();
      expect(manager.isEnabled()).toBe(true); // default unchanged
    });

    it('uses the last matching entry when multiple exist', () => {
      const manager = createToggleManager(zaiToolNames);

      const entries = [
        { type: 'custom', customType: 'zai-tools-state', data: { enabled: true } },
        { type: 'custom', customType: 'zai-tools-state', data: { enabled: false } },
      ];

      const result = manager.restoreFromEntries(entries);
      expect(result!.enabled).toBe(false);
      expect(manager.isEnabled()).toBe(false);
    });
  });
});
