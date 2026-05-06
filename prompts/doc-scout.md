---
description: Scout code for documentation — collect APIs, structure, dependencies
argument-hint: "<path-or-module>"
---

Investigate the target code area and prepare context for writing documentation.

<goal>
$@
</goal>

## What to collect

1. **Public surface** — exported functions, types, classes, constants. Signatures + one-line purpose each.
2. **Structure** — file tree, entry points, how modules relate.
3. **Data flow** — what goes in, what comes out, key transformations.
4. **Dependencies** — what this area depends on and what depends on it.
5. **Tests** — what behavior is covered, what's tested implicitly.
6. **Gaps** — what's unclear from code alone (missing comments, magic numbers, implicit contracts).

## Rules

- Read files fully, not just signatures
- Don't write documentation yet — just report findings
- If the area is large, focus on the core 20% and note what's secondary
- Output a structured summary the user can review before running `/doc-write`

## Output format

```
## Target: <name>
## Type: <guess if not specified: api | arch | module | quickstart>
## Public surface: <list>
## Structure: <tree + relationships>
## Data flow: <in → transforms → out>
## Dependencies: <imports + dependents>
## Gaps: <unclear things>
## Suggested doc location: <path>
```
