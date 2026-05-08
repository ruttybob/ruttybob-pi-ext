---
 description: Parallel implementation — split a detailed plan into independent tasks
 argument-hint: "<path-to-plan.md>"
---

 Your goal: '$@', then partition its tasks into groups that can run in parallel:

 - Tasks touching the **same files** go in one group (combine into a single sequential task description).
 - Tasks with **no file overlap and no dependencies** go in separate groups for parallel execution.
 - When in doubt, serialize.

 Invoke the `subagent` tool multiple times in **single** mode — one call per independent group, all in the same function_calls block so they execute concurrently. Each call: `{
 agent: "worker", task: "<fully self-contained description>" }`. Each task description must be complete — the worker has zero prior context. Include exact file paths, full code
 snippets, test commands, and expected outcomes.

 After all workers finish, summarize results: succeeded/failed tasks, files changed, and suggest running the full test suite to verify integration.

