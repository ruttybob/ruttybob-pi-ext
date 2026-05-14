# AGENTS.md — pi-quota

- API usage monitoring: three tabs (ZAI, OR, DS).
- Each tab: `fetchXxx` → `loadXxx` → `renderXxx`. Key `r` refreshes current tab.
- API keys: `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`.
- Non-interactive fallback: `fetchUsageSummary` for `!quota` in non-UI mode.
