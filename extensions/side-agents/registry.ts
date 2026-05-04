/**
 * Registry для side-agents — load/save/mutate, file locking.
 *
 * Инкапсулирует конкурентный доступ к файлу реестра.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir, fileExists, readJsonFile, atomicWrite } from "../shared/fs.js";
export { ensureDir };
import { sleep, stringifyError } from "../shared/async.js";
import { nowIso } from "./utils.js";
import type { RegistryFile } from "./types.js";
import { REGISTRY_VERSION } from "./types.js";

export function emptyRegistry(): RegistryFile {
	return {
		version: REGISTRY_VERSION,
		agents: {},
	};
}

export function getMetaDir(stateRoot: string): string {
	return join(stateRoot, ".pi", "side-agents");
}

export function getRegistryPath(stateRoot: string): string {
	return join(getMetaDir(stateRoot), "registry.json");
}

export function getRegistryLockPath(stateRoot: string): string {
	return join(getMetaDir(stateRoot), "registry.lock");
}

export function getRuntimeDir(stateRoot: string, agentId: string): string {
	return join(getMetaDir(stateRoot), "runtime", agentId);
}

export function getRuntimeArchiveBaseDir(stateRoot: string, agentId: string): string {
	return join(getMetaDir(stateRoot), "runtime-archive", agentId);
}

export function runtimeArchiveStamp(): string {
	return nowIso().replace(/[:.]/g, "-");
}

export async function loadRegistry(stateRoot: string): Promise<RegistryFile> {
	const registryPath = getRegistryPath(stateRoot);
	const parsed = await readJsonFile<RegistryFile>(registryPath);
	if (!parsed || typeof parsed !== "object") return emptyRegistry();
	if (parsed.version !== REGISTRY_VERSION || typeof parsed.agents !== "object" || parsed.agents === null) {
		return emptyRegistry();
	}
	return parsed;
}

export async function saveRegistry(stateRoot: string, registry: RegistryFile): Promise<void> {
	const registryPath = getRegistryPath(stateRoot);
	await atomicWrite(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
	await ensureDir(dirname(lockPath));

	const started = Date.now();
	while (true) {
		try {
			const handle = await fs.open(lockPath, "wx");
			try {
				await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: nowIso() }) + "\n", "utf8");
			} catch {
				// best effort
			}

			try {
				return await fn();
			} finally {
				await handle.close().catch(() => {});
				await fs.unlink(lockPath).catch(() => {});
			}
		} catch (err: any) {
			if (err?.code !== "EEXIST") throw err;

			try {
				const st = await fs.stat(lockPath);
				const ageMs = Date.now() - st.mtimeMs;
				if (ageMs > 30_000) {
					await fs.unlink(lockPath).catch(() => {});
					continue;
				}
				if (ageMs > 2_000) {
					try {
						const raw = await fs.readFile(lockPath, "utf8");
						const data = JSON.parse(raw);
						if (typeof data.pid === "number") {
							try {
								process.kill(data.pid, 0);
							} catch {
								await fs.unlink(lockPath).catch(() => {});
								continue;
							}
						}
					} catch {
						// fall through to normal timeout
					}
				}
			} catch {
				// ignore
			}

			if (Date.now() - started > 10_000) {
				throw new Error(`Timed out waiting for lock ${lockPath}`);
			}
			await sleep(40 + Math.random() * 80);
		}
	}
}

export async function mutateRegistry(
	stateRoot: string,
	mutator: (registry: RegistryFile) => Promise<void> | void,
): Promise<RegistryFile> {
	const lockPath = getRegistryLockPath(stateRoot);
	return withFileLock(lockPath, async () => {
		const registry = await loadRegistry(stateRoot);
		const before = JSON.stringify(registry);
		await mutator(registry);
		const after = JSON.stringify(registry);
		if (after !== before) {
			await saveRegistry(stateRoot, registry);
		}
		return registry;
	});
}
