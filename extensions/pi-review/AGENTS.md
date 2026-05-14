# AGENTS.md — pi-review

- Forks current work into a new git branch, runs review with conversation context.
- Model/thinking configurable in `.pi/settings.json` → `review.model`, `review.thinkingLevel`.
- `/review-back` restores model + thinking from metadata saved before review.
- Prompts: `prompt.ts` → reads custom prompt file, settings override, or built-in fallback.
- Git diff included optionally (limit via `review.gitDiffMaxLines`).
