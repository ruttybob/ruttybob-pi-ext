import { describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";

// vi.mock для scanResourcesFromFs
vi.mock("node:fs", () => ({
	readdirSync: vi.fn().mockReturnValue([]),
	existsSync: vi.fn().mockReturnValue(false),
	readFileSync: vi.fn(),
}));
vi.mock("node:os", () => ({
	homedir: () => "/tmp/test-home",
}));

describe("soft-red-header", () => {
	it("registers session_start and before_agent_start listeners", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/soft-red-header/index.js");
		mod.default(pi);

		const events = pi._calls.on.map((c: any) => c.event);
		expect(events).toContain("session_start");
		expect(events).toContain("before_agent_start");
	});
});

describe("soft-red-header — handler coverage", () => {
	it("session_start вызывает setHeader для hasUI=true", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/soft-red-header/index.js");
		mod.default(pi);

		const setHeader = vi.fn();
		const ctx = { hasUI: true, cwd: "/tmp/project", ui: { setHeader } };
		await pi._fire("session_start", {}, ctx);
		expect(setHeader).toHaveBeenCalledTimes(1);
	});

	it("session_start НЕ вызывает setHeader для hasUI=false", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/soft-red-header/index.js");
		mod.default(pi);

		const setHeader = vi.fn();
		const ctx = { hasUI: false, cwd: "/tmp/project", ui: { setHeader } };
		await pi._fire("session_start", {}, ctx);
		expect(setHeader).not.toHaveBeenCalled();
	});

	it("header render возвращает строки с логотипом", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/soft-red-header/index.js");
		mod.default(pi);

		let capturedFactory: any;
		const setHeader = vi.fn((factory) => {
			capturedFactory = factory;
		});
		const ctx = { hasUI: true, cwd: "/tmp/project", ui: { setHeader } };
		await pi._fire("session_start", {}, ctx);

		expect(capturedFactory).toBeDefined();
		const mockTheme = {
			fg: (_c: string, t: string) => t,
			bold: (t: string) => t,
			success: (t: string) => t,
			dim: (t: string) => t,
			warning: (t: string) => t,
			accent: (t: string) => t,
			muted: (t: string) => t,
			mdHeading: (t: string) => t,
		};
		const component = capturedFactory(
			{ requestRender: () => {} },
			mockTheme,
		);
		const lines = component.render(80);
		// Первая строка — пустая, затем логотип
		expect(lines.length).toBeGreaterThan(5);
		// Логотип содержит RUTTY
		expect(lines.some((l: string) => l.includes("████"))).toBe(true);
	});
});
