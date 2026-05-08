---
name: agents-md
description: >
  Use before creating or editing any `AGENTS.md`. Defines what belongs there,
  how to keep it root-scoped, and how to keep agent guidance project-specific,
  actionable, and terse. Includes hierarchy rules, sizing limits, anti-patterns,
  and the companion `MEMORY.md` layer.
disable-model-invocation: true
---

Use before any create/edit of `AGENTS.md`.

## Mental Model

Write for an experienced principal engineer: setup done, real work starting.

`AGENTS.md` is an orientation layer, not a full map. It should help them choose the right starting point for the work in front of them, avoid repo-specific mistakes, and know how to verify the result. If a line would not change how they scope, execute, debug, review, document, or validate the work, cut it.

`AGENTS.md` is user-scoped operational memory, not agent-authored completeness. Start with the smallest useful instruction set. Expand only when the user asks or when a missing rule would clearly cause repeated repo-specific mistakes.

## Core Principle: Non-Inferable Only

Write only what the agent **cannot infer from the code**. Research (arXiv 2601.20404, InfoQ 2026 review) shows the most valuable AGENTS.md content falls into three categories:

1. **Conventions & best practices** — style rules, naming patterns, clippy/lint rules that aren't encoded in tooling.
2. **Architecture & project structure** — routing cues, non-obvious ownership boundaries, directory map when layout is non-standard.
3. **Project-specific workflow** — build commands, test commands, dangerous operations, regeneration scripts.

Explicitly do **not**:
- Describe what a module does if the file names, exports, and types already say it.
- List every file in a directory unless the mapping is genuinely non-obvious.
- Repeat framework or language basics the agent already knows.
- Write prose architecture docs — that belongs in `docs/` or `ONBOARD.md`.

## Hierarchy-aware scope

- Root/global `AGENTS.md`: repo-wide invariants, routing cues, and cross-cutting verification only.
- Subtree `AGENTS.md`: local conventions, workflow details, validation, and gotchas for that subtree.
- If a closer `AGENTS.md` already owns a topic, do not duplicate it at root unless the user explicitly asks to promote it.
- For root-level references to non-standard directories, default to a directory map: `path — purpose`.
- **Precedence rule**: closest `AGENTS.md` to the edited file wins; explicit user chat prompts override everything.
- **Inheritance**: subtree files complement (not replace) the root. Only override where they conflict.

## Modes

- Patch: if asked to record or fix one thing, change only that.
- Bootstrap: if `AGENTS.md` does not exist, create the smallest useful file for the request.
- Comprehensive: only do a broad/default pass when the user explicitly asks for a standard, full, or comprehensive file.

## Coverage Areas

Cover only what the requested scope needs. For comprehensive passes, make sure the file answers:

- Where to start: source-of-truth paths, relevant subtrees, task routing cues.
- What can go wrong: forbidden actions, risky commands, confirmations, stop conditions.
- What "done" means: mandatory tests, checks, review steps.
- How this repo differs from defaults: ownership boundaries, invariants, non-obvious conventions, workflow traps.
- Where to go deeper: short conditional pointers for less-common domains.

## Sizing & Format Limits

- Root `AGENTS.md`: target < 50 lines for focused repos, < 100 for monorepos.
- Subtree `AGENTS.md`: target < 30 lines. Most effective subtree files are 5–15 lines (see openai/codex subtree examples: single workflow rule each).
- Combined size across all nested `AGENTS.md` files: keep under 32 KiB (Codex default limit). If approaching this, prune before adding.
- Standard Markdown only. No required fields, no special syntax. Any heading structure works.

## Subtree Anti-Patterns

These are the most common mistakes in nested `AGENTS.md` files:

❌ **Module description**: "This module handles user authentication via JWT tokens..." — the agent reads the code.
❌ **File inventory**: listing every file with a one-line description — `ls` and `read` do this.
❌ **Architecture overview**: data flow diagrams, sequence descriptions — belongs in `docs/`.
❌ **Generic advice**: "Use TypeScript strict mode" when `tsconfig.json` already enforces it.

✅ **Workflow rules**: "If you change `manifest.json`, run `just write-config-schema`" — non-obvious, actionable.
✅ **Sync requirements**: "When editing this state machine, update `docs/tui-chat-composer.md`" — cross-reference the agent wouldn't find.
✅ **Danger zones**: "Never modify `CODEX_SANDBOX_*` env vars" — safety-critical, not inferable.
✅ **Gotchas**: "Regex parser misses template literals and nested classes" — known limitation worth stating.

## Companion: MEMORY.md

`AGENTS.md` is static guidance (human-maintained). For dynamic, session-accumulated knowledge, use `MEMORY.md`:

- **Purpose**: accumulated learnings, fragile test notes, dependency gotchas discovered over time.
- **Who writes**: the agent proposes updates after non-trivial sessions; user approves.
- **Format**: free-form Markdown, organized by topic. Target < 200 lines.
- **Lifecycle**: grows organically. Review periodically; prune stale entries.
- **Relationship to AGENTS.md**: if a MEMORY.md entry becomes a stable rule, promote it to the relevant `AGENTS.md`.
- Example entries:
  - "`PipelineRunner.test.ts` mocks stages 1–17; adding a stage requires updating the mock array."
  - "`InterfaceDiscovery` regex fails on `export const x = () => {}` — known limitation in `src/interface/AGENTS.md`."
  - "Test `coverage-planner.test.ts` is order-dependent; run isolation with `vitest run -t 'test name'`."

Do not create `MEMORY.md` unless the user asks or the project has > 5 sessions of accumulated context worth preserving.

## Writing Rules

- Write in English only. All `AGENTS.md` content must be in English regardless of the project's primary language or the user's language.
- Write instructions, not explanations.
- Default to sparse: prefer short bullets over prose; include only what changes where the agent starts, what it avoids, and how it knows it is done.
- When the user asks for "tight", "brief", "sparse", or "just reference it", default to `path — purpose` bullets or one-clause instructions.
- Add extra clauses, examples, or commands only when they change execution, scope, or verification.
- Prefer imperative bullets, exact paths, concrete commands, explicit decision rules.
- Prefer task-based routing (`if touching X, read Y`) over sequential reading lists.
- Match the file's compression level when it helps readability.
- It is fine, and often preferable, to add sparser/terser guidance to a denser file when that better fits the requested scope and improves scanability.
- Cut generic engineering advice, framework basics, temporary notes, duplicates.
- State defaults, ask points, and no-touch zones.
- Encode explicit user instructions and stable repo facts; do not turn one session into broad policy.
- Do not scan the repo broadly, run tests, or fill gaps just to make a new file feel complete.
- Remove stale or conflicting guidance in the same edit.
- **If a subtree `AGENTS.md` reads like a README or module doc, rewrite it as operational rules.** The test: would a principal engineer already know this from reading the code? If yes, cut it.

## Quality Check

Before finishing, verify a strong new engineer could answer the questions relevant to the requested scope:

- For the work I am doing, where do I start?
- What must I run before I say "done"?
- What would cause damage or review comments?
- What repo-specific rule would I otherwise miss?

If a relevant answer is missing, add it or ask. Do not broaden file scope just to satisfy this checklist.

If you changed `AGENTS.md`, summarize what changed and why this scope fits the orientation-layer mental model.
