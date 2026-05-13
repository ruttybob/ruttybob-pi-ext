---
description: Split a plan into independent parallel tasks, invoke workers concurrently
argument-hint: "<path-to-plan.md>"
---

Goal: $@ — partition its tasks into parallel groups.

**Grouping rules:**
- Tasks touching the **same files** → merge into one sequential task
- Tasks with **no file overlap and no dependencies** → separate groups, run in parallel
- When in doubt, serialize

**Invoke:** `subagent` tool in **single** mode — one call per group, all in the same function_calls block (concurrent). Each task must be fully self-contained: exact file paths, code snippets, test commands, expected outcome.

```
{ agent: "worker", task: "<complete description>" }
```

After all workers finish — summarize: succeeded/failed, files changed, suggest running full test suite.
