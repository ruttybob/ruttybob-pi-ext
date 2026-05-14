# ruttybob

pi package: extensions, skills, and prompts for the pi coding agent.

## Directory map

- `extensions/` — self-contained pi extensions (`index.ts` entry, optional `package.json`)
- `skills/` — pi skills (`SKILL.md` with YAML frontmatter)
- `prompts/` — reusable prompt templates
- `tests/` — Vitest unit tests; `tests/stubs/` mocks pi SDK packages
- `toolgroups.json` — global tool group definitions (used by `tools` extension)

## Test

```sh
npm test              # unit tests (stubs mock all pi SDK + external deps)
npm run test:live     # live integration tests (hits real APIs)
```

- All pi SDK imports (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`) are resolved via `vitest.config.ts` aliases to `tests/stubs/`. When adding a new external dependency used in extensions, add a stub and alias.
- `tsconfig.test.json` path aliases must stay in sync with `vitest.config.ts` aliases.

## Conventions

- Language: Russian for comments, commit messages, user-facing text. English for identifiers and file names.
- Use `@earendil-works/*` package scope (not `@mariozechner` — see `MIGRATION.md`).
- TUI components follow pi-tui `Component` interface: `render(width)`, `invalidate()`, `handleInput(data)`.
- Pi runtime provides SDK packages — never add them to `dependencies` as real npm installs.

## If touching…

- **`toolgroups.json`** — changes affect the `tools` extension's tool group toggle UI.
- **`tests/stubs/`** — stubs represent the pi SDK surface; keep them minimal. Extend only when the extension under test actually uses the API.
- **`package.json` → `pi`** — this is how pi discovers extensions, skills, and prompts. Paths must stay valid.
