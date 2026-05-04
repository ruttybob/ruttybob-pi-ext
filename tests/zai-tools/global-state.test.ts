import { afterEach, describe, expect, it } from 'vitest';
import { createGlobalStateStore } from '../../extensions/zai-tools/src/global-state.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('createGlobalStateStore', () => {
  const testDir = join(tmpdir(), `zai-tools-global-state-test-${Date.now()}`);

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns enabled=true when no state file exists', () => {
    const store = createGlobalStateStore(testDir);
    expect(store.load()).toBe(true);
  });

  it('saves and loads enabled=false', () => {
    const store = createGlobalStateStore(testDir);
    store.save(false);
    expect(store.load()).toBe(false);
  });

  it('saves and loads enabled=true', () => {
    const store = createGlobalStateStore(testDir);
    store.save(false);
    store.save(true);
    expect(store.load()).toBe(true);
  });

  it('handles corrupted file gracefully', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'zai-tools-state.json'), 'not-json');

    const store = createGlobalStateStore(testDir);
    expect(store.load()).toBe(true);
  });

  it('creates directory if it does not exist', () => {
    const nestedDir = join(testDir, 'nested', 'dir');
    const store = createGlobalStateStore(nestedDir);
    store.save(false);
    expect(store.load()).toBe(false);
  });
});
