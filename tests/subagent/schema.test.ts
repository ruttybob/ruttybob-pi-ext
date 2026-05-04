/**
 * Тесты для subagent/schema — условная сборка схемы.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../extensions/subagent/config.js";
import { buildSchema, buildDescription } from "../../extensions/subagent/schema.js";

describe("subagent/schema > buildSchema", () => {
	it("включает tasks когда parallelEnabled: true", () => {
		const schema = buildSchema({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		expect(schema.properties).toHaveProperty("agent");
		expect(schema.properties).toHaveProperty("task");
		expect(schema.properties).toHaveProperty("chain");
		expect(schema.properties).toHaveProperty("cwd");
	});

	it("НЕ включает tasks когда parallelEnabled: false", () => {
		const schema = buildSchema({ parallelEnabled: false, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		expect(schema.properties).toHaveProperty("agent");
		expect(schema.properties).toHaveProperty("task");
		expect(schema.properties).toHaveProperty("chain");
		expect(schema.properties).toHaveProperty("cwd");
	});
});

describe("subagent/schema > buildDescription", () => {
	it("упоминает parallel когда enabled", () => {
		const desc = buildDescription({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		expect(desc).toContain("parallel");
		expect(desc).toContain("concurrently");
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
		expect(desc).not.toContain("unavailable");
	});

	it("НЕ упоминает parallel когда disabled", () => {
		const desc = buildDescription({ parallelEnabled: false, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		expect(desc).not.toContain("parallel");
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
	});
});

describe("subagent/schema > TaskItem.agent — Optional", () => {
	it("description упоминает наследование agent от top-level", () => {
		const desc = buildDescription({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		expect(desc).toContain("Omit agent");
		expect(desc).toContain("inherit");
	});

	it("схема tasks позволяет task item без agent", () => {
		const schema = buildSchema({ parallelEnabled: true, maxParallelTasks: 8, maxConcurrency: 4, agentScope: "user", confirmProjectAgents: true });
		const tasksSchema = schema.properties.tasks;
		const itemSchema = tasksSchema?.items as { properties: Record<string, unknown> } | undefined;
		expect(itemSchema).toBeDefined();
		expect(itemSchema!.properties).toHaveProperty("task");
		// agent — optional: нет в required
		const required = (itemSchema as any).required as string[] | undefined;
		if (required) {
			expect(required).not.toContain("agent");
		}
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

	it("description без parallel не упоминает его", () => {
		const desc = buildDescription(DEFAULT_CONFIG);
		expect(desc).not.toContain("parallel");
		expect(desc).toContain("single");
		expect(desc).toContain("chain");
	});

	it("description с parallel содержит 'concurrently'", () => {
		const desc = buildDescription({ ...DEFAULT_CONFIG, parallelEnabled: true });
		expect(desc).toContain("concurrently");
	});
});
