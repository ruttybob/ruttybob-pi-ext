# AGENTS.md — pi-goal

- Goal tracking with status lifecycle: active → paused → budget_limited → complete.
- Persists to `~/.pi/goal.json`; restores on `session_start`.
- Budget monitoring hooks into `turn_end` — pauses goal when cost exceeds limit.
- Skill files in `skills/goal/` — not extension code, included verbatim as system prompt.
