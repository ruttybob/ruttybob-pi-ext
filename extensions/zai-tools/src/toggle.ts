/**
 * Toggle-менеджер для инструментов zai-tools.
 *
 * Инкапсулирует состояние вкл/выкл и вычисляет новый набор активных инструментов.
 * Не зависит от pi API — чистая логика.
 */

export interface ToggleResult {
  enabled: boolean;
  newActiveTools: string[];
}

export interface RestoreResult {
  enabled: boolean;
  newActiveTools: string[];
}

export interface ToggleManager {
  isEnabled(): boolean;
  toggle(currentActiveTools: string[]): ToggleResult;
  restoreFromEntries(entries: Array<{ type?: string; customType?: string; data?: unknown }>): RestoreResult | null;
}

export function createToggleManager(zaiToolNames: string[]): ToggleManager {
  const zaiToolsSet = new Set(zaiToolNames);
  let enabled = true;

  return {
    isEnabled(): boolean {
      return enabled;
    },

    toggle(currentActiveTools: string[]): ToggleResult {
      enabled = !enabled;

      let newActiveTools: string[];
      if (enabled) {
        // Добавить все zai-tools обратно
        const activeSet = new Set(currentActiveTools);
        for (const name of zaiToolNames) {
          activeSet.add(name);
        }
        newActiveTools = Array.from(activeSet);
      } else {
        // Убрать все zai-tools
        newActiveTools = currentActiveTools.filter((name) => !zaiToolsSet.has(name));
      }

      return { enabled, newActiveTools };
    },

    restoreFromEntries(entries: Array<{ type?: string; customType?: string; data?: unknown }>): RestoreResult | null {
      let savedEnabled: boolean | undefined;

      for (const entry of entries) {
        if (entry.type === 'custom' && entry.customType === 'zai-tools-state') {
          const data = entry.data as { enabled?: boolean } | undefined;
          if (data && typeof data.enabled === 'boolean') {
            savedEnabled = data.enabled;
          }
        }
      }

      if (savedEnabled === undefined) {
        return null;
      }

      enabled = savedEnabled;
      // Для restore нужен текущий набор активных инструментов —
      // вернём флаг, а calling code сам вычислит набор.
      return { enabled, newActiveTools: [] };
    },
  };
}
