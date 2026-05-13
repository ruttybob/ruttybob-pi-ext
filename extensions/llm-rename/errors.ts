export type ErrorKind = "rate_limit" | "network" | "unknown";

export function classifyError(error: unknown): ErrorKind {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		if (msg.includes("429") || msg.includes("rate") || msg.includes("too many requests")) {
			return "rate_limit";
		}
		if (
			msg.includes("econnrefused") ||
			msg.includes("enotfound") ||
			msg.includes("etimedout") ||
			msg.includes("fetch failed") ||
			msg.includes("network") ||
			msg.includes("dns")
		) {
			return "network";
		}
	}
	return "unknown";
}

export function classifyStopError(errorMessage: string | undefined): ErrorKind {
	const msg = (errorMessage ?? "").toLowerCase();
	if (msg.includes("429") || msg.includes("rate") || msg.includes("too many requests")) {
		return "rate_limit";
	}
	if (
		msg.includes("overloaded") ||
		msg.includes("unavailable") ||
		msg.includes("503") ||
		msg.includes("500") ||
		msg.includes("capacity")
	) {
		return "network";
	}
	return "unknown";
}

export function errorUserMessage(kind: ErrorKind, detail: string): string {
	switch (kind) {
		case "rate_limit":
			return `Rename skipped: rate limit reached (${detail}). Will retry on next message.`;
		case "network":
			return `Rename skipped: model unavailable (${detail}). Will retry on next message.`;
		case "unknown":
			return `Rename failed: ${detail}`;
	}
}
