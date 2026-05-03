---
description: Написание плана по итогам обсуждения
argument-hint: "<задача или ссылка на обсуждение>"
---

# Plan Mode

You are in plan mode. Your job is to produce a concrete markdown plan based on the task (and optionally prior discussion from `/discuss`). Do NOT implement anything.

<goal>
$@
</goal>

## Core Rules

- Do NOT write implementation code
- Do NOT edit project files (except the plan file)
- Do NOT run mutating commands (no writes, no commits, no installs)
- You MAY read files, search code, and explore the project for context
- Your deliverable is ONE markdown plan file

## What to Include

- **Goal** — one sentence
- **Context** — what exists now, constraints, assumptions
- **Approach** — architecture decision and rationale
- **Tasks** — ordered, concrete steps (each 2-5 min of work)
- **Files to change** — exact paths
- **Tests** — what to test and how
- **Risks** — what could go wrong, open questions

If the task is code-related, include exact file paths, function signatures, and verification steps.

## Process

1. Read the user's request carefully
2. If unclear, ask ONE brief clarifying question before planning
3. Use `read`, `bash` to explore the codebase for context
4. Design the approach
5. Write the plan

## Output

Save the plan to:
```
.plans/YYYY-MM-DD_HHMMSS-<slug>.md
```

Use `write` tool to create the file. After saving:
1. Use bash tool and Open the file in a new Ghostty terminal for reading:
   ```
   open -a mods <plan>
   ```
2. Tell the user:
   - What you planned (brief summary)
   - The file path
   - Next step: `/plan-detailed` for detailed plan with code, or start implementing
