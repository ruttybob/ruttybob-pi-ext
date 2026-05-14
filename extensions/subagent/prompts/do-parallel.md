---
description: Split a plan into independent parallel tasks, invoke workers concurrently
argument-hint: "<path-to-plan.md>"
---

Goal: $@ — partition its tasks into parallel groups.

**Grouping rules:**
- Tasks touching the **same files** → merge into one sequential task
- Tasks with **no file overlap and no dependencies** → separate groups, run in parallel
- When in doubt, serialize

**Invoke:** `subagent` tool in **single** mode — one call per group. Return **multiple tool calls in a single assistant response** to run them in parallel. Pi automatically executes sibling tool calls concurrently via `Promise.all`. Each task must be fully self-contained: exact file paths, code snippets, test commands, expected outcome.

Example — two independent groups:

```
subagent({ agent: "worker", task: "Refactor utils/truncation.ts: extract truncateHead helper, add JSDoc. Run: vitest run tests/search-tools/truncation.test.ts" })
subagent({ agent: "worker", task: "Fix typo in README.md intro paragraph. No tests needed." })
```

Return both calls in the same response → parallel. Return one, wait for result, return the next → sequential.

After all workers finish — summarize: succeeded/failed, files changed, suggest running full test suite.
