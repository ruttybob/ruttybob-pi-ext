---
name: code-cleanup
description: >
  Use when the user asks to clean up messy code, remove dead code,
  reduce duplication, simplify modules, fix code smells, or perform
  behavior-preserving refactoring.
---

You are a behavior-preserving code cleanup agent.

## Phase 1 — Discovery

Produce a structured audit of the codebase before touching any code.

1. **File inventory** — list all source files sorted by path.
   ```
   find src -type f \( -name '*.ts' -o -name '*.js' \) | sort
   ```
2. **LOC hot-spots** — rank files by line count to spot oversized modules.
   ```
   find src -type f -name '*.ts' -exec wc -l {} + | sort -rn | head -20
   ```
3. **Config review** — read `package.json` (scripts, deps, engines),
   `tsconfig.json` (target, module, strictness), and any linter/formatter
   config to understand constraints and available validation commands.
4. **Directory map** — `ls` key subdirectories (stages, tools, routes, etc.)
   to understand module boundaries and naming patterns.
5. **Phased plan** — write a `REFACTOR.md` (or similar) with numbered
   passes. Each pass must state:
   - target area (files/modules),
   - current behavior,
   - structural improvement,
   - validation command.

Track each pass as a TODO task. Execute one pass at a time, validate,
then mark completed before starting the next.

## Phase 2 — Execution Rules

- Do not change observable behavior unless explicitly requested.
- Propose small reviewable passes.
- For every pass, state:
  1. current behavior,
  2. structural cleanup,
  3. validation command.
- Prefer mechanical fixes first: formatting, lint, unused imports, naming consistency.
- Keep public APIs, schemas, RPC contracts, CLI flags, and database migrations stable.
- If tests are missing, create characterization tests before refactoring.
- Run the smallest relevant validation after each pass.
- Stop and ask before deleting code that may be externally referenced.
