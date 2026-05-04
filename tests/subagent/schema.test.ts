/**
 * Тесты для subagent/schema — условная сборка схемы.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../extensions/subagent/config.js";
import { buildSchema, buildDescription } from "../../extensions/subagent/schema.js";

describe("subagent/schema > buildSchema", () => {
	it("включает tasks когда parallelEnabled: true", () => {
		const schema = buildSchema({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4 });
		expect(schema.properties).toHaveProperty("tasks");
		expect(schema.properties).toHaveProperty("agent");
		expect(schema.properties).toHaveProperty("task");
		expect(schema.properties).toHaveProperty("chain");
		expect(schema.properties).toHaveProperty("agentScope");
		expect(schema.properties).toHaveProperty("cwd");
	});

	it("НЕ включает tasks когда parallelEnabled: false", () => {
		const schema = buildSchema({ parallelEnabled: false, maxParallelTasks: 8, maxConcurrency: 4 });
		expect(schema.properties).not.toHaveProperty("tasks");
		expect(schema.properties).toHaveProperty("agent");
		expect(schema.properties).toHaveProperty("task");
		expect(schema.properties).toHaveProperty("chain");
		expect(schema.properties).toHaveProperty("agentScope");
		expect(schema.properties).toHaveProperty("cwd");
	});
});

describe("subagent/schema > buildDescription", () => {
	it("упоминает parallel (tasks array) когда enabled", () => {
		const desc = buildDescription({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4 });
		expect(desc).toContain("parallel (tasks array)");
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
		expect(desc).not.toContain("requires");
	});

	it("НЕ упоминает parallel в modes когда disabled, но содержит подсказку", () => {
		const desc = buildDescription({ parallelEnabled: false, maxParallelTasks: 8, maxConcurrency: 4 });
		expect(desc).not.toMatch(/parallel \(tasks array\)/);
		expect(desc).toContain("parallelEnabled");
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
	});
});

describe("subagent/schema > интеграция с config", () => {
	it("DEFAULT_CONFIG (parallelEnabled: false) — tasks нет в схеме", () => {
		const schema = buildSchema(DEFAULT_CONFIG);
		expect(schema.properties).not.toHaveProperty("tasks");
	});

	it("config с parallelEnabled: true — tasks есть в схеме", () => {
		const schema = buildSchema({ ...DEFAULT_CONFIG, parallelEnabled: true });
		expect(schema.properties).toHaveProperty("tasks");
	});

	it("description без parallel не содержит 'parallel (tasks array)'", () => {
		const desc = buildDescription(DEFAULT_CONFIG);
		expect(desc).not.toMatch(/parallel \(tasks array\)/);
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
	});

	it("description с parallel содержит 'parallel (tasks array)'", () => {
		const desc = buildDescription({ ...DEFAULT_CONFIG, parallelEnabled: true });
		expect(desc).toContain("parallel (tasks array)");
	});
});
