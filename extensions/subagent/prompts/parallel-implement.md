---
description: Parallel implementation — splits a detailed plan into independent tasks and runs multiple workers simultaneously
argument-hint: "<path-to-detailed-plan.md>"
---

Read the detailed plan at `$@`, then partition its tasks into groups that can run in parallel:

- Tasks touching the **same files** go in one group (combine into a single sequential task description).
- Tasks with **no file overlap and no dependencies** go in separate groups for parallel execution.
- When in doubt, serialize.

Use the subagent tool with the `tasks` parameter to run all groups in parallel. Use the **worker** agent for each task. Each task must be fully self-contained (the worker has zero prior context) — include exact file paths, complete code, test commands, and expected outcomes.

After all workers finish, summarize results: succeeded/failed tasks, files changed, and suggest running the full test suite to verify integration.
