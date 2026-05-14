# AGENTS.md — llm-rename

- Renames pi session files via LLM (single-turn `completeSimple`).
- Prompt enforces **2–3 words Title Case** (see `DEFAULT_INSTRUCTION_AUTO` / `DEFAULT_INSTRUCTION_MANUAL`).
- JSON mode for structured output; retry on parse failure.
- Keys: `Enter` = accept, `Ctrl+R` = regenerate, `r` = manual edit mode.
