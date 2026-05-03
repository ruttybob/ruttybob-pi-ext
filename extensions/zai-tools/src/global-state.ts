import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GlobalStateStore {
  load(): boolean;
  save(enabled: boolean): void;
}

export function createGlobalStateStore(dir: string): GlobalStateStore {
  const filePath = join(dir, 'zai-tools-state.json');

  return {
    load(): boolean {
      try {
        if (!existsSync(filePath)) return true;
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return typeof data.enabled === 'boolean' ? data.enabled : true;
      } catch {
        return true;
      }
    },

    save(enabled: boolean): void {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify({ enabled }), 'utf-8');
    },
  };
}
