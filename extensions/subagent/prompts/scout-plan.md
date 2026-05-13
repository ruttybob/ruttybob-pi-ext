---
description: Scout → plan chain — find relevant code, create plan, publish to jot
argument-hint: "<task>"
---

Invoke `subagent` in **chain** mode:

1. `scout` — find all code relevant to: $@
2. `planner` — create an implementation plan from scout findings ({previous}). Publish the plan to jot:
   - `jot <instance> create "Plan: $@"`
   - Write plan body to `/tmp/jot-plan.md`, then `jot <instance> update <note-id> markdown "$(cat /tmp/jot-plan.md)"`

Do NOT implement — return the plan only.
