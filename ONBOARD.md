# ruttybob

## Overview
A pi package bundling extensions, skills, and prompts for the pi coding agent. Extends pi with interactive TUI tools (tool management, skill toggling, quota dashboards), subagent orchestration, and a curated set of reusable skills.

## Directory Structure

### Extensions (`extensions/`)
- **`tools/`** — TUI for enabling/disabling pi tools, tool groups with glob patterns, ignore config
- **`pi-goal/`** — persisting multi-turn goals with token budget tracking and completion audit
- **`pi-review/`** — review current work in a child session with conversation context and git diff
- **`pi-quota/`** — unified quota dashboard with provider tab switching (OpenRouter, ZAI)
- **`subagent/`** — delegates tasks to subagents (scout, planner, worker, reviewer, zai, brave, tavily)
- **`search-tools/`** — web search tools integration (Tavily)
- **`pi-worktree/`** — isolated git-worktree environments with tmux integration
- **`advisor/`** — consult a stronger reviewer model before acting
- **`pi-powerline/`** — TUI breadcrumbs, editor component, footer widget for pi
- **`soft-red-header/`** — custom pi header showing available skills, prompts, extensions
- **`session-recap/`** — session summary on exit

### Skills (`skills/`)
- **`git-commit/`** — Conventional Commits workflow, stages only intended files
- **`code-cleanup/`** — behavior-preserving refactoring, dead code removal, module simplification
- **`cli-creator/`** — build composable CLI tools from API docs, OpenAPI specs, or existing scripts
- **`grill-me/`** — stress-test a plan or design through exhaustive questioning
- **`first-principles-decomposer/`** — decompose problems to first principles with integrated frameworks
- **`agents-md/`** — AGENTS.md convention for project context
- **`playwright/`** — browser automation and testing
- **`playwright-interactive/`** — interactive browser sessions
- **`write-skill/`** — create new pi skills with proper structure and progressive disclosure

### Prompts (`prompts/`)
- **`doc-scout.md`** — explore and document codebases
- **`doc-write.md`** — write technical documentation
- **`explain-codebase.md`** — explain project architecture
- **`modernize-and-refactor.md`** — systematic modernization and refactoring plan
- **`zoom-out.md`** — high-level architectural overview

### Tests (`tests/`)
Unit tests for all extensions using Vitest. Stubs in `tests/stubs/` mock pi SDK packages (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, etc.) for isolated testing without a running pi instance.

### Legacy (`old/`)
Archived prompts, skills, and discussions from earlier iterations.

## Key Files
- **`package.json`** — declares pi package metadata: included extensions, skills, and prompts
- **`skills-lock.json`** — locks skill versions and origins
- **`toolgroups.json`** — global tool group definitions (used by `tools` extension)
- **`tsconfig.test.json`** — TypeScript config for test files with path aliases pointing to stubs
- **`vitest.config.ts`** — Vitest config with stub alias resolution
- **`CHANGELOG.md`** — release history
- **`MIGRATION.md`** — migration guide from `@mariozechner` to `@earendil-works` package scope

## Conventions
- **Language**: Russian for comments, commit messages, user-facing text; English for code identifiers and file names
- **Tests**: Vitest, mock pi SDK via stubs in `tests/stubs/`, set `PI_CODING_AGENT_DIR` for temp directories
- **Extensions**: each extension is a self-contained directory under `extensions/` with `index.ts` as entry point and optional `package.json`
- **Skills**: each skill is a directory under `skills/` with a `SKILL.md` containing YAML frontmatter
- **Imports**: use `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` (provided by pi at runtime, stubbed in tests)
- **TUI components**: follow pi-tui `Component` interface (`render(width)`, `invalidate()`, `handleInput(data)`)
