import { describe, it, expect } from "vitest";
import { classifyError, classifyStopError, errorUserMessage } from "../../extensions/pi-auto-rename/errors.js";

describe("classifyError", () => {
	it("распознаёт rate limit (429)", () => {
		expect(classifyError(new Error("HTTP 429 Too Many Requests"))).toBe("rate_limit");
	});

	it("распознаёт rate limit (rate в сообщении)", () => {
		expect(classifyError(new Error("Rate limit exceeded"))).toBe("rate_limit");
	});

	it("распознаёт сетевую ошибку (ECONNREFUSED)", () => {
		expect(classifyError(new Error("ECONNREFUSED 127.0.0.1:443"))).toBe("network");
	});

	it("распознаёт сетевую ошибку (fetch failed)", () => {
		expect(classifyError(new Error("fetch failed"))).toBe("network");
	});

	it("распознаёт сетевую ошибку (ENOTFOUND)", () => {
		expect(classifyError(new Error("getaddrinfo ENOTFOUND api.example.com"))).toBe("network");
	});

	it("распознаёт сетевую ошибку (ETIMEDOUT)", () => {
		expect(classifyError(new Error("ETIMEDOUT"))).toBe("network");
	});

	it("возвращает unknown для неизвестных ошибок", () => {
		expect(classifyError(new Error("something unexpected"))).toBe("unknown");
	});

	it("возвращает unknown для не-Error объектов", () => {
		expect(classifyError("string error")).toBe("unknown");
		expect(classifyError(42)).toBe("unknown");
		expect(classifyError(null)).toBe("unknown");
	});
});

describe("classifyStopError", () => {
	it("распознаёт rate limit", () => {
		expect(classifyStopError("HTTP 429: rate limit exceeded")).toBe("rate_limit");
	});

	it("распознаёт перегрузку (overloaded)", () => {
		expect(classifyStopError("Server is overloaded")).toBe("network");
	});

	it("распознаёт недоступность (503)", () => {
		expect(classifyStopError("HTTP 503 Service Unavailable")).toBe("network");
	});

	it("распознаёт capacity", () => {
		expect(classifyStopError("Insufficient capacity")).toBe("network");
	});

	it("возвращает unknown для пустого сообщения", () => {
		expect(classifyStopError(undefined)).toBe("unknown");
		expect(classifyStopError("")).toBe("unknown");
	});

	it("возвращает unknown для неизвестных ошибок", () => {
		expect(classifyStopError("some random error")).toBe("unknown");
	});
});

describe("errorUserMessage", () => {
	it("формирует сообщение для rate_limit", () => {
		const msg = errorUserMessage("rate_limit", "429");
		expect(msg).toContain("rate limit");
		expect(msg).toContain("429");
	});

	it("формирует сообщение для network", () => {
		const msg = errorUserMessage("network", "ECONNREFUSED");
		expect(msg).toContain("unavailable");
		expect(msg).toContain("ECONNREFUSED");
	});

	it("формирует сообщение для unknown", () => {
		const msg = errorUserMessage("unknown", "something broke");
		expect(msg).toContain("Rename failed");
		expect(msg).toContain("something broke");
	});
});
