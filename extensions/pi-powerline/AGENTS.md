# AGENTS.md — pi-powerline

- TUI decorations: footer, editor top border, breadcrumb widget.
- Two renderers: `style: classic` (default) and `style: modern` (segment-based, from yapi-line).
- Modern style preset in `presets.ts` → `DEFAULT_PRESET`; segments defined in `segments.ts`.
- Settings live in `.pi/settings.json` under `powerline` key. Use `readPowerlineSettings` / `writePowerlineSetting`.
- Always call `visibleWidth()` + `truncateToWidth()` before rendering — terminal width overflow crashes TUI.
