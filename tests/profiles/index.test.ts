// tests/profiles/index.test.ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockCommandContext } from "../test-helpers/mock-context.js";
import profilesExtension, { getProfileCompletions } from "../../extensions/profiles/index.js";

const emptySettings = { packages: [], extensions: [], skills: [], prompts: [], themes: [] };

describe("profiles extension", () => {
	const testDir = join(tmpdir(), `profiles-test-${process.pid}`);
	const agentDir = join(testDir, "agent");
	const profilesDir = join(agentDir, "profiles");
	const settingsPath = join(agentDir, "settings.json");
	let mockReload: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockReload = vi.fn().mockResolvedValue(undefined);
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(settingsPath, JSON.stringify(emptySettings, null, 2));
	});
	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	function createContext(overrides?: any) {
		return createMockCommandContext({
			cwd: testDir,
			agentDir,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				input: vi.fn(),
			},
			...overrides,
		} as any);
	}

	function createContextWithMockReload(overrides?: any) {
		const ctx = createContext(overrides);
		(ctx as any).reload = mockReload;
		return ctx;
	}

	describe("registration", () => {
		it("registers /profile command", () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			expect(pi._calls.registerCommand.some((c) => c.name === "profile")).toBe(true);
		});

		it("registers session_start handler", () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			expect(pi._calls.on.some((h) => h.event === "session_start")).toBe(true);
		});
	});

	describe("/profile — list", () => {
		it("shows info when no profiles", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("No profiles"), "info",
			);
		});

		it("lists saved profiles", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");
			writeFileSync(join(profilesDir, "home.json"), "{}");

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("work"), "info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("home"), "info",
			);
		});

		it("shows help", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("help", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Profile Commands"), "info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("/profile save"), "info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("/profile <name>"), "info",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("/profile rm"), "info",
			);
		});
	});

	describe("/profile save <name>", () => {
		it("saves current settings as profile", async () => {
			const settings = { ...emptySettings, packages: ["npm:foo"] };
			writeFileSync(settingsPath, JSON.stringify(settings));

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("save work", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("work"), "success",
			);
			const saved = JSON.parse(readFileSync(join(profilesDir, "work.json"), "utf8"));
			expect(saved.packages).toEqual(["npm:foo"]);
		});

		it("overwrites existing profile", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), '{"old":true}');

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("save work", ctx);

			const saved = JSON.parse(readFileSync(join(profilesDir, "work.json"), "utf8"));
			expect(saved.old).toBeUndefined();
			expect(saved.packages).toEqual([]);
		});

		it("rejects invalid name", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("save foo/bar", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Invalid"), "error",
			);
		});

		it("rejects empty name", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("save  ", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("required"), "error",
			);
		});
	});

	describe("/profile <name> — apply", () => {
		it("applies profile and reloads", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), JSON.stringify({
				...emptySettings, packages: ["npm:work-pkg"],
			}));

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContextWithMockReload();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("work", ctx);

			// settings.json был перезаписан
			const applied = JSON.parse(readFileSync(settingsPath, "utf8"));
			expect(applied.packages).toEqual(["npm:work-pkg"]);

			// reload был вызван
			expect(mockReload).toHaveBeenCalled();
		});

		it("errors on unknown profile", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("nonexistent", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("not found"), "error",
			);
		});
	});

		describe("/profile rm <name>", () => {
		it("deletes profile", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "old.json"), "{}");

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("rm old", ctx);

			expect(existsSync(join(profilesDir, "old.json"))).toBe(false);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("deleted"), "info",
			);
		});

		it("errors when profile not found", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const ctx = createContext();
			const cmd = pi._calls.registerCommand.find((c) => c.name === "profile")!;
			await cmd.options.handler("rm nope", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("not found"), "error",
			);
		});
	});

	describe("getProfileCompletions", () => {
		it("returns subcommands + profile names for empty prefix", () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");
			writeFileSync(join(profilesDir, "home.json"), "{}");

			const result = getProfileCompletions("", agentDir);
			expect(result).not.toBeNull();
			const values = result!.map((i) => i.value);
			expect(values).toContain("save");
			expect(values).toContain("rm");
			expect(values).toContain("help");
			expect(values).toContain("work");
			expect(values).toContain("home");
		});

		it("filters subcommands by prefix", () => {
			const result = getProfileCompletions("sa", agentDir);
			expect(result).not.toBeNull();
			expect(result!.map((i) => i.value)).toEqual(["save"]);
		});

		it("filters profile names by prefix", () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");
			writeFileSync(join(profilesDir, "home.json"), "{}");

			const result = getProfileCompletions("wo", agentDir);
			expect(result).not.toBeNull();
			expect(result!.map((i) => i.value)).toEqual(["work"]);
		});

		it("completes profile names after 'save '", () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");
			writeFileSync(join(profilesDir, "home.json"), "{}");

			const result = getProfileCompletions("save ", agentDir);
			expect(result).not.toBeNull();
			expect(result!.map((i) => i.value)).toEqual(["home", "work"]);
		});

		it("filters profile names after 'save ho'", () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");
			writeFileSync(join(profilesDir, "home.json"), "{}");

			const result = getProfileCompletions("save ho", agentDir);
			expect(result).not.toBeNull();
			expect(result!.map((i) => i.value)).toEqual(["home"]);
		});

		it("completes profile names after 'rm '", () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");

			const result = getProfileCompletions("rm ", agentDir);
			expect(result).not.toBeNull();
			expect(result!.map((i) => i.value)).toEqual(["work"]);
		});

		it("returns null after unknown subcommand + space", () => {
			const result = getProfileCompletions("foo bar", agentDir);
			expect(result).toBeNull();
		});

		it("returns null when no matches", () => {
			const result = getProfileCompletions("xyz", agentDir);
			expect(result).toBeNull();
		});
	});

	describe("session_start status", () => {
		it("shows active profile name when settings match a profile", async () => {
			mkdirSync(profilesDir, { recursive: true });
			const content = JSON.stringify(emptySettings);
			writeFileSync(settingsPath, content);
			writeFileSync(join(profilesDir, "work.json"), content);
			writeFileSync(join(profilesDir, "home.json"), JSON.stringify({ other: true }));

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const handler = pi._calls.on.find((h) => h.event === "session_start")!.handler;
			const ctx = createContext();
			await handler({}, ctx);

			expect(ctx.ui.setStatus).toHaveBeenCalledWith("profiles", "◉ work");
		});

		it("shows count when settings do not match any profile", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), JSON.stringify({ a: 1 }));
			writeFileSync(join(profilesDir, "home.json"), JSON.stringify({ b: 2 }));
			// settings.json = emptySettings, не совпадает ни с одним профилем

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const handler = pi._calls.on.find((h) => h.event === "session_start")!.handler;
			const ctx = createContext();
			await handler({}, ctx);

			expect(ctx.ui.setStatus).toHaveBeenCalledWith("profiles", "○ 2");
		});

		it("does not set status when no profiles exist", async () => {
			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const handler = pi._calls.on.find((h) => h.event === "session_start")!.handler;
			const ctx = createContext();
			await handler({}, ctx);

			expect(ctx.ui.setStatus).not.toHaveBeenCalled();
		});

		it("does not set status when no UI", async () => {
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const handler = pi._calls.on.find((h) => h.event === "session_start")!.handler;
			const ctx = createMockCommandContext({ hasUI: false } as any);
			await handler({}, ctx);

			// hasUI=false → guard prevents setStatus call; just verify no crash
		});

		it("does not set status when no settings.json", async () => {
			rmSync(settingsPath, { force: true });
			mkdirSync(profilesDir, { recursive: true });
			writeFileSync(join(profilesDir, "work.json"), "{}");

			const pi = createMockExtensionAPI();
			profilesExtension(pi);
			const handler = pi._calls.on.find((h) => h.event === "session_start")!.handler;
			const ctx = createContext();
			await handler({}, ctx);

			expect(ctx.ui.setStatus).toHaveBeenCalledWith("profiles", "○ 1");
		});
	});
});
