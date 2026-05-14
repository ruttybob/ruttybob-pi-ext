---
description: Modernize and refactor with behavior preservation
---

$@

Modernize and refactor this codebase.

## Rules

- Preserve behavior unless explicitly asked for a functional change.
- Keep public APIs stable unless a change is required by the refactor.
- Call out framework migrations, dependency upgrades, or architecture moves — these belong in a separate task, not here.

## Approach

- Identify dead code, duplicated paths, oversized modules, stale abstractions, legacy patterns.
- For each refactor pass: name the current behavior, the structural improvement, and the validation check that proves behavior stayed stable.
- Break into small reviewable passes: delete dead code, simplify control flow, extract helpers, replace outdated patterns with repo conventions.
- If the work is broad — propose specs and parity checks before implementation.

## Output

Save the plan to `REFACTOR.md` (overwrite if exists). Then:
1. `open -a mods REFACTOR.md`
2. Tell the user a brief summary and the file path.
