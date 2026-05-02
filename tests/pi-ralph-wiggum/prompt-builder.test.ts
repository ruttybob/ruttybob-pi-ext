import { describe, expect, it } from "vitest";
import {
	buildSystemPromptAppend,
} from "../../extensions/pi-ralph-wiggum/prompt-builder.js";
import { COMPLETE_MARKER } from "../../extensions/pi-ralph-wiggum/files.js";
import { createTestLoopState } from "./helpers.js";

describe("prompt-builder — buildSystemPromptAppend", () => {
	it("формирует system prompt append для spawn-режима", () => {
		const state = createTestLoopState({
			iteration: 2,
			maxIterations: 10,
		});
		const result = buildSystemPromptAppend(
			state,
			"## Completed\n- [x] Item 1",
			"### Iteration 1 reflection",
		);
		expect(result).toContain("RALPH LOOP");
		expect(result).toContain("test-loop");
		expect(result).toContain("Iteration 2/10");
		expect(result).toContain("## Completed");
		expect(result).toContain("### Iteration 1 reflection");
		expect(result).toContain(COMPLETE_MARKER);
	});

	it("работает без progress и reflection контента", () => {
		const state = createTestLoopState();
		const result = buildSystemPromptAppend(state, null, null);
		expect(result).toContain("RALPH LOOP");
		expect(result).toContain(COMPLETE_MARKER);
	});

	it("включает путь к reflectionFile для spawn-режима", () => {
		const state = createTestLoopState();
		const result = buildSystemPromptAppend(state, null, null);
		expect(result).toContain(state.reflectionFile);
	});

	it("включает путь к progressFile для spawn-режима", () => {
		const state = createTestLoopState();
		const result = buildSystemPromptAppend(state, null, null);
		expect(result).toContain(state.progressFile);
	});

	it("включает itemsPerIteration hint когда > 0", () => {
		const state = createTestLoopState({ itemsPerIteration: 3 });
		const result = buildSystemPromptAppend(state, null, null);
		expect(result).toContain("approximately 3 items");
	});
});
