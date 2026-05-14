# AGENTS.md — subagent

- Delegates tasks to isolated `pi` child processes. Two modes: single, chain.
- Agent sources (priority: builtin < user < project):
  - **builtin**: `extensions/subagent/agents/*.md` — always available, overridable. `optional-agents/` holds disabled agents not loaded by discovery.
  - **user**: `~/.pi/agents/*.md`
  - **project**: `.pi/agents/*.md` (nearest `.pi/agents/` walking up from cwd)
- Frontmatter fields: `name`, `description`, `tools`, `skills`, `model`.
- `promptSnippet`: appears in Available tools section of system prompt.
- `promptGuidelines`: agent descriptions from frontmatter injected into system prompt Guidelines section.
- `description` (tool): modes only — no duplication with snippet/guidelines.
- Model: add `model: <name>` to agent frontmatter to override default. Without it, subagent inherits parent model.
- Prompts: `prompts/*.md` — system prompt templates inserted before agent definition.
- Chain mode: `{chain: [{agent, task}...]}` — `{previous}` placeholder passes prior output.
- Concurrency limiter in `runner.ts`: max 4 parallel agents.
