/**
 * Tmux-утилиты для side-agents.
 *
 * Изолирует terminal-взаимодействие.
 */

import { run, runOrThrow } from "../shared/git.js";
import { shellQuote } from "../shared/git.js";
import { splitLines, tailLines } from "../shared/text.js";
import { TMUX_BACKLOG_CAPTURE_LINES } from "./types.js";

export function ensureTmuxReady(): void {
	const version = run("tmux", ["-V"]);
	if (!version.ok) {
		throw new Error("tmux is required for /agent but was not found or is not working");
	}

	const session = run("tmux", ["display-message", "-p", "#S"]);
	if (!session.ok) {
		throw new Error("/agent must be run from inside tmux (current tmux session was not detected)");
	}
}

export function getCurrentTmuxSession(): string {
	const result = runOrThrow("tmux", ["display-message", "-p", "#S"]);
	const value = result.stdout.trim();
	if (!value) throw new Error("Failed to determine current tmux session");
	return value;
}

export function createTmuxWindow(tmuxSession: string, name: string): { windowId: string; windowIndex: number } {
	const result = runOrThrow("tmux", [
		"new-window",
		"-d",
		"-t",
		`${tmuxSession}:`,
		"-P",
		"-F",
		"#{window_id} #{window_index}",
		"-n",
		name,
	]);
	const out = result.stdout.trim();
	const [windowId, indexRaw] = out.split(/\s+/);
	const windowIndex = Number(indexRaw);
	if (!windowId || !Number.isFinite(windowIndex)) {
		throw new Error(`Unable to parse tmux window identity: ${out}`);
	}
	return { windowId, windowIndex };
}

export function tmuxWindowExists(windowId: string): boolean {
	const result = run("tmux", ["display-message", "-p", "-t", windowId, "#{window_id}"]);
	return result.ok && result.stdout.trim() === windowId;
}

export function tmuxPipePaneToFile(windowId: string, logPath: string): void {
	runOrThrow("tmux", ["pipe-pane", "-t", windowId, "-o", `cat >> ${shellQuote(logPath)}`]);
}

export function tmuxInterrupt(windowId: string): void {
	run("tmux", ["send-keys", "-t", windowId, "C-c"]);
}

export function tmuxSendPrompt(windowId: string, prompt: string): void {
	const loaded = run("tmux", ["load-buffer", "-"], { input: prompt });
	if (!loaded.ok) {
		throw new Error(`Failed to send input to tmux window ${windowId}: ${loaded.stderr || loaded.error || "unknown error"}`);
	}
	runOrThrow("tmux", ["paste-buffer", "-d", "-t", windowId]);
	runOrThrow("tmux", ["send-keys", "-t", windowId, "C-m"]);
}

export function tmuxCaptureTail(windowId: string, lines = 10): string[] {
	const captured = run("tmux", ["capture-pane", "-p", "-t", windowId, "-S", `-${TMUX_BACKLOG_CAPTURE_LINES}`]);
	if (!captured.ok) return [];
	return tailLines(captured.stdout, lines);
}

export function tmuxCaptureVisible(windowId: string): string[] {
	const captured = run("tmux", ["capture-pane", "-p", "-t", windowId]);
	if (!captured.ok) return [];
	return splitLines(captured.stdout);
}
