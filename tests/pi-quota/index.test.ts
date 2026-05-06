import { describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI, createMockContext } from "../test-helpers/mock-api.js";

describe("pi-quota", () => {
	it("registers /quota command", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/pi-quota/index.js");
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "quota",
		);
		expect(cmd).toBeDefined();
	});
});

describe("pi-quota — handler coverage", () => {
	it("handler вызывает notify в non-interactive режиме", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/pi-quota/index.js");
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "quota",
		);
		const notify = vi.fn();
		const ctx = {
			hasUI: false,
			ui: { notify },
		};

		await cmd!.options.handler("", ctx);

		expect(notify).toHaveBeenCalledWith(
			expect.any(String),
			"info",
		);
	});

	it("handler открывает custom UI в interactive режиме", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/pi-quota/index.js");
		mod.default(pi);

		const cmd = pi._calls.registerCommand.find(
			(c: any) => c.name === "quota",
		);
		const custom = vi.fn().mockResolvedValue(undefined);
		const ctx = {
			hasUI: true,
			ui: { custom, notify: vi.fn() },
		};

		await cmd!.options.handler("", ctx);

		expect(custom).toHaveBeenCalled();
	});
});
