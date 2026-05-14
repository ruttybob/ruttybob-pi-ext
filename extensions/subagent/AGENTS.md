# AGENTS.md — subagent

- Delegates tasks to isolated `pi` child processes. Two modes: single, chain.
- Agents defined as `.md` files in `agents/` or `~/.pi/agents/`. Frontmatter fields: `name`, `description`, `tools`, `skills`, `model`.
- Model: add `model: <name>` to agent frontmatter to override default. Without it, subagent inherits parent model.
- Prompts: `prompts/*.md` — system prompt templates inserted before agent definition.
- Chain mode: `{chain: [{agent, task}...]}` — `{previous}` placeholder passes prior output.
- Concurrency limiter in `runner.ts`: max 4 parallel agents.
