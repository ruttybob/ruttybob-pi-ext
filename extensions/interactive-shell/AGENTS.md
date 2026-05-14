# AGENTS.md — interactive-shell

- Intercepts user `!` commands; suspends TUI, spawns interactive process, resumes.
- `!i prefix` forces interactive mode; default list is auto-detected (vim, htop, etc.).
- Env vars: `INTERACTIVE_COMMANDS` (add), `INTERACTIVE_EXCLUDE` (remove).
- Agent `bash` tool calls are never intercepted — only user `!` commands.
