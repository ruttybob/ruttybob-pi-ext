---
description: Detailed code review of uncommitted changes via git-diff
argument-hint: "[optional: focus area or file path]"
---

Invoke `subagent` in **single** mode with the `reviewer` agent.

Task:
```
Review uncommitted changes. Start with `git diff` then read every modified file.

Check for:
- logic errors, race conditions, missing error handling
- security vulnerabilities, hardcoded secrets
- performance issues, code duplication
- missing or weak tests
- deviations from project conventions

$@

Do not modify any files — review only.
```
