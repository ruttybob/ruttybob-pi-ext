/**
 * Soft Red Header Extension
 *
 * Показывает ASCII-эмблему «RUTTY PI» из README.md, раскрашенную
 * в soft-red цвет через truecolor escape-коды.
 *
 * Также показывает стандартные сообщения pi (keybinding hints, onboarding)
 * и динамические ресурсные секции [Skills], [Prompts], [Extensions].
 */

import type { ExtensionAPI, Theme, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { type TUI, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// --- ASCII-арт эмблема «RUTTY PI» ---
const LOGO_LINES: string[] = [
	"██████╗ ██╗      ██████╗ ██╗   ██╗████████╗████████╗██╗   ██╗        ",
	"██╔══██╗██║      ██╔══██╗██║   ██║╚══██╔══╝╚══██╔══╝╚██╗ ██╔╝",
	"██████╔╝██║█████╗██████╔╝██║   ██║   ██║      ██║    ╚████╔╝               ",
	"██╔═══╝ ██║╚════╝██╔══██╗██║   ██║   ██║      ██║     ╚██╔╝                      ",
	"██║     ██║      ██║  ██║╚██████╔╝   ██║      ██║      ██║                                             ",
	"╚═╝     ╚═╝      ╚═╝  ╚═╝ ╚═════╝    ╚═╝      ╚═╝      ╚═╝                                                 ",
];

// --- Soft-red цвет (RGB) ---
const SOFT_RED_R = 204;
const SOFT_RED_G = 68;
const SOFT_RED_B = 85;

// --- Soft-red раскраска одной строки ---
function coloredLine(line: string): string {
	const escapeOn = `\x1b[38;2;${SOFT_RED_R};${SOFT_RED_G};${SOFT_RED_B}m`;
	const escapeOff = "\x1b[0m";

	let result = "";
	let inColor = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		// Пробелы не окрашиваем
		if (char === " ") {
			if (inColor) {
				result += escapeOff;
				inColor = false;
			}
			result += char;
		} else {
			if (!inColor) {
				result += escapeOn;
				inColor = true;
			}
			result += char;
		}
	}

	if (inColor) {
		result += escapeOff;
	}

	return result;
}

// --- Стандартные подсказки pi (keybindings по умолчанию) ---
function buildStandardMessages(theme: Theme): string[] {
	const key = (k: string) => theme.fg("accent", k);

	const compactInstructions = [
		`${key("esc")} interrupt`,
		`${key("ctrl+c")}/${key("ctrl+d")} clear/exit`,
		`${key("/")} commands`,
		`${key("!")} bash`,
		`${key("ctrl+o")} more`,
	].join(theme.fg("muted", " · "));

	const compactOnboarding = theme.fg(
		"dim",
		`Press ${key("ctrl+o")} to show full startup help and loaded resources.`
	);

	const onboarding = theme.fg(
		"dim",
		"Pi can explain its own features and look up its docs. Ask it how to use or extend Pi."
	);

	return [compactInstructions, compactOnboarding, "", onboarding];
}

// --- Мутабельный state ресурсов ---
interface ResourceState {
	skills: string[];
	prompts: string[];
	extensions: string[];
}

// --- Ресурсные секции [Skills], [Prompts], [Extensions] ---
function buildResourceSections(resources: ResourceState, theme: Theme, width: number): string[] {
	const sections: { name: string; items: string[] }[] = [];

	if (resources.skills.length > 0) {
		sections.push({
			name: "Skills",
			items: [...resources.skills].sort((a, b) => a.localeCompare(b)),
		});
	}
	if (resources.prompts.length > 0) {
		sections.push({
			name: "Prompts",
			items: [...resources.prompts].sort((a, b) => a.localeCompare(b)),
		});
	}
	if (resources.extensions.length > 0) {
		sections.push({
			name: "Extensions",
			items: [...resources.extensions].sort((a, b) => a.localeCompare(b)),
		});
	}

	if (sections.length === 0) return [];

	const lines: string[] = [];
	for (const section of sections) {
		const header = theme.fg("mdHeading", `[${section.name}]`);
		const list = theme.fg("dim", `  ${section.items.join(", ")}`);
		lines.push(header);
		lines.push(...wrapTextWithAnsi(list, width));
	}
	return lines;
}

// --- Сканирование FS для предварительного обнаружения ресурсов ---
function scanDirNames(dir: string): string[] {
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() &&
					!d.name.startsWith(".") &&
					d.name !== "node_modules",
			)
			.map((d) => d.name);
	} catch {
		return [];
	}
}

function scanResourcesFromFs(cwd: string): ResourceState {
	const home = os.homedir();

	// Skills: ~/.pi/agent/skills/*/, ~/.agents/skills/*/, <cwd>/.pi/skills/*/
	const skillDirs = [
		path.join(home, ".pi", "agent", "skills"),
		path.join(home, ".agents", "skills"),
		path.join(cwd, ".pi", "skills"),
	];
	const skills = [...new Set(skillDirs.flatMap(scanDirNames))];

	// Prompts: ~/.pi/agent/prompts/*.md, <cwd>/.pi/prompts/*.md
	const promptDirs = [
		path.join(home, ".pi", "agent", "prompts"),
		path.join(cwd, ".pi", "prompts"),
	];
	const prompts = [
		...new Set(
			promptDirs.flatMap((dir) => {
				try {
					return fs
						.readdirSync(dir)
						.filter((f) => f.endsWith(".md"))
						.map((f) => `/${f.replace(/\.md$/, "")}`);
				} catch {
					return [];
				}
			}),
		),
	];

	// Extensions: <cwd>/extensions/*/, ~/.pi/agent/extensions/*/
	const extDirs = [
		path.join(cwd, "extensions"),
		path.join(home, ".pi", "agent", "extensions"),
	];
	const extensions = [...new Set(extDirs.flatMap(scanDirNames))];

	return { skills, prompts, extensions };
}

// --- Header-компонент с soft-red эмблемой + стандартные сообщения + ресурсы ---
class SoftRedHeaderComponent {
	private tui: TUI | null = null;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private resources: ResourceState = { skills: [], prompts: [], extensions: [] };

	/** Сохранить TUI для последующего requestRender */
	bindTui(tui: TUI): void {
		this.tui = tui;
	}

	/** Обновить ресурсы и перерисовать */
	updateResources(resources: Partial<ResourceState>): void {
		if (resources.skills) this.resources.skills = resources.skills;
		if (resources.prompts) this.resources.prompts = resources.prompts;
		if (resources.extensions) this.resources.extensions = resources.extensions;
		this.invalidate();
		this.tui?.requestRender();
	}

	render(width: number, theme: Theme): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [""];

		// Soft-red логотип
		const rendered = LOGO_LINES.map((line) => coloredLine(line));
		lines.push(...rendered);

		// Подпись с названием и версией
		const subtitle = theme.fg(
			"muted",
			`   permission gates · modes · handoff for pi${theme.fg("dim", ` v${VERSION}`)}`,
		);
		lines.push(subtitle);
		lines.push("");

		// Стандартные сообщения pi (подсказки клавиш, onboarding)
		const standardMessages = buildStandardMessages(theme);
		lines.push(...standardMessages);

		// Ресурсные секции [Skills], [Prompts], [Extensions]
		const resourceLines = buildResourceSections(this.resources, theme, width);
		if (resourceLines.length > 0) {
			lines.push("", ...resourceLines);
		}

		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// --- Точка входа расширения ---
export default function (pi: ExtensionAPI) {
	// Singleton header-компонент — переживает reload (session_start с reason: "reload")
	const header = new SoftRedHeaderComponent();

	// При старте / reload сессии — установить soft-red header + FS scan
	pi.on("session_start", async (_event: any, ctx: ExtensionCommandContext) => {
		if (!ctx.hasUI) return;

		// Предварительное сканирование FS для раннего отображения ресурсов
		header.updateResources(scanResourcesFromFs(ctx.cwd));

		ctx.ui.setHeader((tui, theme) => {
			header.bindTui(tui);
			return {
				render(width: number): string[] {
					return header.render(width, theme);
				},
				invalidate(): void {
					header.invalidate();
				},
			};
		});
	});

	// При первом запросе пользователя — обновить ресурсы точными данными из API
	pi.on("before_agent_start", async (event: any, _ctx: ExtensionCommandContext) => {
		const skills =
			event.systemPromptOptions.skills?.map((s: any) => s.name) ?? [];
		const commands = pi.getCommands();

		const prompts = commands
			.filter((c) => c.source === "prompt")
			.map((c) => `/${c.name}`)
			.sort((a, b) => a.localeCompare(b));

		const extensions = [
			...new Set(
				commands
					.filter((c) => c.source === "extension")
					.map((c) => {
						// Извлечь имя расширения из sourceInfo.path (dirname basename)
						const p = c.sourceInfo?.path;
						if (!p) return c.name;
						const base = path.basename(path.dirname(p));
						return base || c.name;
					}),
			),
		].sort((a, b) => a.localeCompare(b));

		header.updateResources({ skills, prompts, extensions });
	});
}
