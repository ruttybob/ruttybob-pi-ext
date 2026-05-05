/**
 * Global setup/teardown for vitest.
 *
 * setup: no-op.
 * teardown: removes junk files that leak from runtime pi sessions
 *   when getAgentDir() resolves to CWD (empty PI_CODING_AGENT_DIR).
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JUNK_FILES = [
  "presets.json",
  "modes-state.json",
  "profiles",
];

export default function setup() {
  return function teardown() {
    for (const file of JUNK_FILES) {
      const path = resolve(projectRoot, file);
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  };
}
