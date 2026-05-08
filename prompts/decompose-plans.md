---
description: "Decompose a plan into granular issues in .issues/"
argument-hint: "<path-to-plan.md>"
---

Read the plan (summary or detailed), extract each individual task, and create a file for it in `.issues/`.

<goal>
$@
</goal>

## What to Do

1. Read the plan in full
2. **If there are open questions** — use the `questionnaire` tool to clarify with the user before creating issue files. Do not create tasks with ambiguities.
3. For each Task in the plan, create a separate issue file
4. If the plan is a summary (no copy-paste code), dive into the codebase to clarify files and context for each task
5. Create the `.issues/<plan-slug>/` directory if it doesn't exist

## Issue Format

Each task is one file: `.issues/<plan-slug>/NNN-<task-slug>.md`

```markdown
# <Task Title>

**Status:** ⏳ Not started
**Plan:** <path to source plan>
**Dependencies:** NNN (if this task depends on another)

## Objective

<1-2 sentences — what this task accomplishes>

## Files

- Create: `path/to/new_file.ts`
- Modify: `path/to/existing.ts`
- Tests: `tests/path/test.ts`

## Steps

1. <concrete step>
2. <concrete step>
3. ...

## Verification

- [ ] <completion criterion>
- [ ] <completion criterion>

## Result

When done, move this issue to `.issues/_done/`:
```bash
mv .issues/<plan-slug>/NNN-<task-slug>.md .issues/_done/NNN-<task-slug>.md
```
```

## Numbering

- `NNN` — three-digit sequential number: `001`, `002`, `003`...
- Numbering is continuous within a single plan
- Order matches the order of tasks in the plan

## Rules

- One task = one issue file
- The task must be self-contained — the implementer understands what to do without reading the full plan
- Specify exact file paths, concrete steps, verifiable criteria
- If tasks depend on each other — indicate the dependency number in the **Dependencies** field
- Do not create tasks for already-completed plan items (check status in the plan and code)
- The `.issues/_done/` folder is an archive of completed tasks — do not create new files there

## After Creation

1. Output the list of created issues as a checklist:
```
[ ] 001-create-user-model — Create User model with email field
[ ] 002-add-validation — Add email validation
[ ] 003-write-tests — Write tests for User model
```

2. Indicate the total number of tasks and dependencies between them

3. Suggest: to work on tasks, use the `/handoff` prompt or work step-by-step, moving completed issues to `_done`
