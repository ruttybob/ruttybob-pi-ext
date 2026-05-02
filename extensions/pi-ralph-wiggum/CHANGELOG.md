# Changelog

## [Unreleased]

### Added
- Прогресс-трекинг дочерней сессии в реальном времени: виджет и статус-строка в TUI показывают текущие tool calls, повороты и время выполнения (`progress-display.ts`).
- Навык `wiggummy` (SKILL.md) — триггер для запуска долгих итеративных циклов разработки.
- Stub `withFileMutationQueue` в тестовых заглушках `@mariozechner/pi-coding-agent`.

### Изменено
- `ralph_start` теперь возвращает `terminate: false` — агент выполняет follow-up LLM call с результатом loop вместо немедленного завершения.

## 0.4.0 - 2026-05-01

### Changed
- **BREAKING:** Removed flat mode entirely. Spawn is now the only mode. The `mode` field has been removed from `LoopState`.
- Removed `ralph_done` tool (iterations advance automatically in spawn mode).
- Removed `before_agent_start` and `agent_end` event handlers (only needed for flat mode).
- Removed `buildPrompt()` from `prompt-builder.ts` (only used in flat mode).
- Removed `--flat` and `--spawn` flags from `/ralph start` and `ralph_start` tool.
- `migrateState()` now strips the `mode` field from old state files for forward compatibility.
- Updated HELP text and documentation to remove flat mode references.

### Migration
- Old state files with `mode: "flat"` or without `mode` will be automatically migrated. Resuming such loops will run in spawn mode.

## 0.3.0 - 2026-04-30

### Added
- **Spawn mode**: Each iteration runs as an isolated `pi --mode json` child process without extensions. This is now the default mode. Flat mode (current session) is available via `--flat`.
- **Progress file** (`.ralph/<name>.progress.md`): Auto-generated and injected into the child session's system prompt via `--append-system-prompt`.
- **Reflection file** (`.ralph/<name>.reflection.md`): Separate file for reflection thoughts. Child sessions write reflections here, and the content is injected into the next iteration.
- Modular architecture: `files.ts` (file operations), `prompt-builder.ts` (prompt generation), `child-session.ts` (spawn child processes).
- Tests for all modules: `files.test.ts`, `prompt-builder.test.ts`, `child-session.test.ts`, `index.test.ts`.

### Changed
- **BREAKING:** `mode` field added to `LoopState`. Old loops without this field default to `"flat"` for backward compatibility.
- `--flat` and `--spawn` flags added to `/ralph start` and `ralph_start` tool.
- `ralph_done` tool is now a no-op in spawn mode (iterations advance automatically).
- `before_agent_start` and `agent_end` handlers now only apply in flat mode.
- `session_shutdown` now aborts any running child process.

### Fixed
- AbortController properly terminates child processes on stop/cancel/shutdown.

## 0.2.0 - 2026-04-19

### Changed
- **BREAKING:** SKILL.md `name` renamed `ralph-wiggum` → `pi-ralph-wiggum` to match the parent directory (both in the repo and after `pi install npm:@tmustier/pi-ralph-wiggum`). This removes the `[Skill conflicts]` warning pi emitted on every startup, but it also changes the skill's public identifier — explicit invocations must now use `/skill:pi-ralph-wiggum` instead of `/skill:ralph-wiggum`. Thanks to @ishanmalik for reporting ([#12](https://github.com/tmustier/pi-extensions/issues/12)).
- Repo directory renamed `ralph-wiggum/` → `pi-ralph-wiggum/` as part of the same fix. Git-source users referencing `~/pi-extensions/ralph-wiggum/…` in their pi config should update the path to `~/pi-extensions/pi-ralph-wiggum/…`. The npm package name (`@tmustier/pi-ralph-wiggum`) is unchanged.
- Renamed the README's `Install` section to `Installation` so it matches the skill validator's expectations.

## 0.1.7 - 2026-04-19

### Fixed
- Ralph loops no longer silently stop after auto-compaction or `/compact`. On session reload, `currentLoop` is now rehydrated from the on-disk state (most-recently-updated active loop wins on ties), so `ralph_done`, `agent_end`, and `before_agent_start` continue to function. Thanks to @elecnix for the detailed report and proposed fix ([#11](https://github.com/tmustier/pi-extensions/issues/11)).

## 0.1.5 - 2026-02-03

### Added
- Add preview image metadata for the extension listing.

## 0.1.4 - 2026-02-02

### Changed
- **BREAKING:** Updated tool execute signatures for Pi v0.51.0 compatibility (`signal` parameter now comes before `onUpdate`)
- **BREAKING:** Changed `before_agent_start` handler to use `systemPrompt` instead of deprecated `systemPromptAppend` (Pi v0.39.0+)

## 0.1.3 - 2026-01-26
- Added note clarifying this is a flat version without subagents.

## 0.1.1 - 2026-01-25
- Clarified that agents must write the task file themselves (tool does not auto-create it).

## 0.1.0 - 2026-01-13
- Initial release.
