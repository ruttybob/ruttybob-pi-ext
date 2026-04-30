import type { Message, TextContent } from "@mariozechner/pi-ai";
import type { SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";

const NAME_LENGTH_CAP = 80;

// ─── Content extraction ───────────────────────────────────────────────────────

function isLlmMessage(entry: SessionEntry): entry is SessionMessageEntry & { message: Message } {
	if (entry.type !== "message") return false;
	const role = (entry as SessionMessageEntry).message.role;
	return role === "user" || role === "assistant" || role === "toolResult";
}

function extractText(content: Message["content"]): string {
	if (typeof content === "string") return content;
	const parts: string[] = [];
	for (const block of content) {
		if (block.type === "text") parts.push((block as TextContent).text);
	}
	return parts.join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getFirstUserMessageText(entries: SessionEntry[]): string | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!entry || !isLlmMessage(entry)) continue;
		if (entry.message.role !== "user") continue;
		const text = extractText(entry.message.content).trim();
		if (text) return text;
	}
	return null;
}

export function getConversationTranscript(entries: SessionEntry[]): string {
	const segments: string[] = [];
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!entry || !isLlmMessage(entry)) continue;
		const { role, content } = entry.message;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(content).trim();
		if (!text) continue;
		segments.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	return segments.join("\n\n");
}

export function parseRenameMd(content: string): { system?: string; instruction?: string } {
	const result: { system?: string; instruction?: string } = {};
	const lines = content.split(/\r?\n/);
	let current: "system" | "instruction" | null = null;
	const buffers: Record<string, string[]> = { system: [], instruction: [] };

	for (const line of lines) {
		const heading = line.trim().toLowerCase();
		if (heading === "## system") {
			current = "system";
			continue;
		}
		if (heading === "## instruction") {
			current = "instruction";
			continue;
		}
		if (heading.startsWith("## ") && current !== null) {
			current = null;
			continue;
		}
		if (current) buffers[current].push(line);
	}

	const sys = buffers.system.join("\n").trim();
	const instr = buffers.instruction.join("\n").trim();
	if (sys) result.system = sys;
	if (instr) result.instruction = instr;
	return result;
}

export function sanitizeSessionName(raw: string): string {
	const firstLine = raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.find((l) => l.length > 0);
	if (!firstLine) return "";

	let name = firstLine
		.replace(/^["'`]+/, "")
		.replace(/["'`]+$/, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.!?:;,]+$/, "");

	if (name.length > NAME_LENGTH_CAP) name = name.slice(0, NAME_LENGTH_CAP).trimEnd();
	return name;
}
