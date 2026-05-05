/**
 * Profiles Extension for pi
 * Команды:
 *   /profile              — список профилей
 *   /profile save <name>  — сохранить текущий settings.json как профиль
 *   /profile <name>       — применить профиль
 *   /profile rm <name>    — удалить профиль
 *   /profile help         — справка
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

const PROFILES_DIR = "profiles";
const STATUS_KEY = "profiles";

function getProfilesDir(agentDir?: string): string {
	return join(agentDir ?? getAgentDir(), PROFILES_DIR);
}

function getSettingsPath(agentDir?: string): string {
	return join(agentDir ?? getAgentDir(), "settings.json");
}

function listProfiles(agentDir?: string): string[] {
	const dir = getProfilesDir(agentDir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => f.slice(0, -".json".length))
		.sort();
}

function detectActiveProfile(agentDir?: string): string | null {
	const settingsPath = getSettingsPath(agentDir);
	if (!existsSync(settingsPath)) return null;
	const settingsContent = readFileSync(settingsPath, "utf-8");
	for (const name of listProfiles(agentDir)) {
		const profilePath = join(getProfilesDir(agentDir), `${name}.json`);
		if (existsSync(profilePath) && readFileSync(profilePath, "utf-8") === settingsContent) {
			return name;
		}
	}
	return null;
}

function resolveProfileName(input: string): { ok: true; name: string } | { ok: false; error: string } {
	const name = input.trim();
	if (!name) return { ok: false, error: "Profile name required" };
	if (/[\/\\:*?"<>|]/.test(name)) return { ok: false, error: "Invalid characters in profile name" };
	if (name.length > 64) return { ok: false, error: "Profile name too long (max 64)" };
	return { ok: true, name };
}

const SUBCOMMANDS: AutocompleteItem[] = [
	{ value: "save", label: "save", description: "Save current settings as profile" },
	{ value: "rm", label: "rm", description: "Delete a profile" },
	{ value: "help", label: "help", description: "Show help" },
];

export function getProfileCompletions(argumentPrefix: string, agentDir?: string): AutocompleteItem[] | null {
	// После "save " или "rm " — дополняем имена профилей
	const saveMatch = argumentPrefix.match(/^save\s+(.*)/);
	if (saveMatch) {
		const prefix = saveMatch[1]!.toLowerCase();
		const profiles = listProfiles(agentDir);
		const items: AutocompleteItem[] = profiles.map((p) => ({ value: p, label: p }));
		const filtered = prefix
			? items.filter((i) => i.value.toLowerCase().startsWith(prefix))
			: items;
		return filtered.length > 0 ? filtered : null;
	}

	const rmMatch = argumentPrefix.match(/^rm\s+(.*)/);
	if (rmMatch) {
		const prefix = rmMatch[1]!.toLowerCase();
		const profiles = listProfiles(agentDir);
		const items: AutocompleteItem[] = profiles.map((p) => ({ value: p, label: p }));
		const filtered = prefix
			? items.filter((i) => i.value.toLowerCase().startsWith(prefix))
			: items;
		return filtered.length > 0 ? filtered : null;
	}

	// После пробела в других случаях — не дополняем
	if (argumentPrefix.includes(" ")) return null;

	// Первый аргумент — подкоманды + имена профилей
	const query = argumentPrefix.toLowerCase();
	const profileItems: AutocompleteItem[] = listProfiles(agentDir).map((p) => ({
		value: p,
		label: p,
		description: "Apply profile",
	}));
	const all = [...SUBCOMMANDS, ...profileItems];
	const filtered = query
		? all.filter((i) => i.value.toLowerCase().startsWith(query))
		: all;
	return filtered.length > 0 ? filtered : null;
}

export default function profilesExtension(pi: ExtensionAPI) {
	pi.registerCommand("profile", {
		description: "Manage settings profiles (save/apply/remove)",
		getArgumentCompletions: (prefix: string) => getProfileCompletions(prefix),
		handler: async (args: string, ctx: any) => {
			const agentDir = (ctx as any)?.agentDir ?? undefined;
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0]?.toLowerCase();

			// /profile — список профилей
			if (!subcommand) {
				const profiles = listProfiles(agentDir);
				if (profiles.length === 0) {
					ctx.ui.notify("No profiles. Use: /profile save <name>", "info");
					return;
				}
				const lines = profiles.map((p) => `  • ${p}`).join("\n");
				ctx.ui.notify(`Profiles:\n${lines}`, "info");
				return;
			}

			// /profile help — справка
			if (subcommand === "help") {
				ctx.ui.notify(
					"Profile Commands:\n" +
					"  /profile              — List profiles\n" +
					"  /profile save <name>  — Save current settings as profile\n" +
					"  /profile <name>       — Apply profile (reload settings)\n" +
					"  /profile rm <name>    — Delete profile\n" +
					"  /profile help         — Show this help",
					"info",
				);
				return;
			}

			// /profile save <name>
			if (subcommand === "save") {
				const nameInput = parts.slice(1).join(" ");
				const parsed = resolveProfileName(nameInput);
				if (!parsed.ok) { ctx.ui.notify(parsed.error, "error"); return; }
				const { name } = parsed;

				const settingsPath = getSettingsPath(agentDir);
				if (!existsSync(settingsPath)) {
					ctx.ui.notify("settings.json not found", "error");
					return;
				}

				const profilesDir = getProfilesDir(agentDir);
				mkdirSync(profilesDir, { recursive: true });
				copyFileSync(settingsPath, join(profilesDir, `${name}.json`));
				ctx.ui.notify(`Profile "${name}" saved`, "success");
				return;
			}

			// /profile rm <name>
			if (subcommand === "rm") {
				const nameInput = parts.slice(1).join(" ");
				const parsed = resolveProfileName(nameInput);
				if (!parsed.ok) { ctx.ui.notify(parsed.error, "error"); return; }
				const { name } = parsed;

				const profilePath = join(getProfilesDir(agentDir), `${name}.json`);
				if (!existsSync(profilePath)) {
					ctx.ui.notify(`Profile "${name}" not found`, "error");
					return;
				}
				rmSync(profilePath);
				ctx.ui.notify(`Profile "${name}" deleted`, "info");
				return;
			}

			// /profile <name> — применить профиль
			const nameInput = parts.join(" ");
			const parsed = resolveProfileName(nameInput);
			if (!parsed.ok) { ctx.ui.notify(parsed.error, "error"); return; }
			const { name } = parsed;

			const profilePath = join(getProfilesDir(agentDir), `${name}.json`);
			if (!existsSync(profilePath)) {
				ctx.ui.notify(`Profile "${name}" not found. Available: ${listProfiles(agentDir).join(", ") || "none"}`, "error");
				return;
			}

			const settingsPath = getSettingsPath(agentDir);
			copyFileSync(profilePath, settingsPath);
			ctx.ui.notify(`Applying profile "${name}"…`, "info");
			await ctx.reload();
		},
	});

	// session_start — показать активный профиль или счётчик в footer
	pi.on("session_start", async (_event: any, ctx: any) => {
		try {
			if (ctx?.hasUI && ctx?.ui?.setStatus) {
				const dir = (ctx as any)?.agentDir ?? undefined;
				const active = detectActiveProfile(dir);
				if (active) {
					ctx.ui.setStatus(STATUS_KEY, `◉ ${active}`);
				} else {
					const profiles = listProfiles(dir);
					if (profiles.length > 0) {
						ctx.ui.setStatus(STATUS_KEY, `○ ${profiles.length}`);
					}
			}
			}
		} catch {}
	});
}
