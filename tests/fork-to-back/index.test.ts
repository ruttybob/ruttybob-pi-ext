import { describe, expect, it } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";

describe("fork-to-back", () => {
	it("registers both /fork-to and /fork-back commands", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/fork-to-back/index.js");
		mod.default(pi);

		const names = pi._calls.registerCommand.map((c: any) => c.name);
		expect(names).toContain("fork-to");
		expect(names).toContain("fork-back");
	});

	it("fork-to has description about copying session", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/fork-to-back/index.js");
		mod.default(pi);

		const forkTo = pi._calls.registerCommand.find((c: any) => c.name === "fork-to");
		expect(forkTo).toBeDefined();
		expect(forkTo!.options.description).toContain("Copy");
	});

	it("fork-back has description about parent session", async () => {
		const pi = createMockExtensionAPI();
		const mod = await import("../../extensions/fork-to-back/index.js");
		mod.default(pi);

		const forkBack = pi._calls.registerCommand.find((c: any) => c.name === "fork-back");
		expect(forkBack).toBeDefined();
		expect(forkBack!.options.description).toContain("parent");
	});
});
