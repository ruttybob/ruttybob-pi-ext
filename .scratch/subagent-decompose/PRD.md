Status: ready-for-agent
Category: enhancement

## Problem Statement

Расширение `subagent` — монолит в 987 строк, где типы, запуск child-процессов, форматирование результата и рендеринг TUI смешаны в одном файле. Это затрудняет ревью, тестирование и развитие. Чистые функции (форматирование, парсинг вывода) утоплены в императивном коде и не покрыты unit-тестами. Параллельно утилиты, которые могли бы быть переиспользованы другими расширениями (`formatTokens`, `stringifyError`, `sleep`, `truncateWithEllipsis`), дублируются или реализуются inline.

## Solution

Разделить монолит `subagent` на глубокие модули с простыми интерфейсами, а общие утилиты извлечь в shared-модули. Сохранить публичный API (`subagent` tool — параметры, поведение, рендеринг) без изменений. Все существующие тесты должны продолжать проходить.

## User Stories

### Декомпозиция subagent

1. Как мейнтейнер, я хочу чтобы код subagent был разбит на модули по ответственности, чтобы проще было ревьюить изменения в runner'е отдельно от рендеринга
2. Как мейнтейнер, я хочу чтобы типы (SingleResult, SubagentDetails, UsageStats, DisplayItem) жили в отдельном модуле, чтобы их можно было импортировать в тестах без побочных эффектов
3. Как мейнтейнер, я хочу чтобы функция запуска child-процесса (`runSingleAgent`) жила в отдельном модуле, чтобы её можно было тестировать мокая `spawn`
4. Как мейнтейнер, я хочу чтобы concurrency-limiter (`mapWithConcurrencyLimit`) был отдельной функцией в runner-модуле, чтобы его можно было тестировать изолированно
5. Как мейнтейнер, я хочу чтобы TUI-рендеринг (`renderCall`, `renderResult`, `formatToolCall`, `formatUsageStats`) жил в отдельном render-модуле, чтобы изменения в UI не затрагивали логику запуска
6. Как мейнтейнер, я хочу чтобы entry point (`index.ts`) содержал только регистрацию tool и делегировал вызовы модулям, чтобы была видна общая структура расширения

### Shared-утилиты

7. Как мейнтейнер, я хочу чтобы `formatTokens` был в shared-модуле, чтобы его могли использовать другие расширения (pi-mesh, session-recap)
8. Как мейнтейнер, я хочу чтобы `stringifyError` был в shared-модуле, чтобы убрать дублирование между side-agents и subagent
9. Как мейнтейнер, я хочу чтобы `sleep` был в shared-модуле, чтобы убрать inline-реализацию из side-agents
10. Как мейнтейнер, я хочу чтобы `truncateWithEllipsis` был в shared-модуле, чтобы убрать дублирование между side-agents, subagent и другими расширениями
11. Как мейнтейнер, я хочу чтобы `ensureDir`, `fileExists`, `tryRead`, `readJsonFile`, `atomicWrite` были в shared/fs-модуле, чтобы убрать дублирование между 4+ расширениями
12. Как мейнтейнер, я хочу чтобы `stripTerminalNoise`, `splitLines`, `tailLines` были в shared/text-модуле, чтобы убрать дублирование между side-agents и другими расширениями
13. Как мейнтейнер, я хочу чтобы `run`/`runOrThrow` (spawnSync wrappers), `resolveGitRoot`, `getCurrentBranch`, `shellQuote` были в shared/git-модуле, чтобы убрать дублирование между side-agents и потенциально другими расширениями

### Тестирование

14. Как разработчик, я хочу чтобы `formatTokens` имел unit-тесты, чтобы при изменении форматирования (например, порога для "k"/"M") не было регрессий
15. Как разработчик, я хочу чтобы `formatUsageStats` имел unit-тесты, чтобы контролировать формат строки usage
16. Как разработчик, я хочу чтобы `formatToolCall` имел unit-тесты на каждый тип инструмента (bash, read, write, edit, ls, find, grep, default), чтобы рендеринг не ломался при рефакторинге
17. Как разработчик, я хочу чтобы `mapWithConcurrencyLimit` имел unit-тесты, чтобы гарантировать корректность при concurrency=1, concurrency=N, empty input
18. Как разработчик, я хочу чтобы `getFinalOutput` и `getDisplayItems` имели unit-тесты, чтобы контракт извлечения результата из messages был зафиксирован
19. Как разработчик, я хочу чтобы shared/fs утилиты (`ensureDir`, `fileExists`, `readJsonFile`, `atomicWrite`) имели unit-тесты с реальной FS во временной директории
20. Как разработчик, я хочу чтобы shared/text утилиты (`truncateWithEllipsis`, `stripTerminalNoise`, `splitLines`, `tailLines`) имели unit-тесты
21. Как разработчик, я хочу чтобы shared/git (`run`/`runOrThrow`, `shellQuote`) имел unit-тесты
22. Как разработчик, я хочу чтобы side-agents/backlog (`sanitizeBacklogLines`, `collectRecentBacklogLines`) имел unit-тесты без реимплементации в тесте
23. Как разработчик, я хочу чтобы side-agents/registry (load/save/mutate с file locking) имел unit-тесты с временной FS
24. Как разработчик, я хочу чтобы side-agents/worktree (allocate slots, orphan locks) имел unit-тесты
25. Как разработчик, я хочу чтобы side-agents/status-poll (transitions, dedup) имел unit-тесты
26. Как разработчик, я хочу чтобы subagent/runner (spawn + parse JSON mode) имел unit-тесты с моками child_process
27. Как разработчик, я хочу чтобы тесты side-agents (`tool-contract.test.ts`) импортировали чистые функции напрямую из исходных модулей вместо реимплементации, чтобы при изменении исходника тесты ломались (а не молча устаревали)

### Сохранение поведения

28. Как пользователь, я хочу чтобы tool `subagent` работал идентично после рефакторинга — те же параметры, тот же результат, тот же рендеринг в TUI
29. Как пользователь, я хочу чтобы все существующие тесты (`vitest run`) продолжали проходить без изменений
30. Как пользователь, я хочу чтобы публичный API (имя tool, schema параметров, формат ответа) не менялся

## Implementation Decisions

- **Архитектура**: subagent разделяется на три модуля:
  - **types** — интерфейсы `SingleResult`, `SubagentDetails`, `UsageStats`, `DisplayItem`, `OnUpdateCallback`, параметры chain/parallel/single
  - **runner** — `runSingleAgent`, `mapWithConcurrencyLimit`, `writePromptToTempFile`, `getPiInvocation`, `getFinalOutput`, `getDisplayItems` — инкапсулирует child process lifecycle
  - **render** — `formatTokens`, `formatUsageStats`, `formatToolCall`, `renderCall`, `renderResult` — инкапсулирует TUI-рендеринг
  - **index** — только `pi.registerTool()` с вызовами runner и render
- **Shared-утилиты**: создаются в `extensions/shared/` с тремя модулями:
  - **shared/fs** — `ensureDir`, `fileExists`, `tryRead`, `readJsonFile`, `atomicWrite`
  - **shared/text** — `truncateWithEllipsis`, `stripTerminalNoise`, `splitLines`, `tailLines`
  - **shared/async** — `sleep`, `stringifyError`
  - **shared/git** — `run`/`runOrThrow`, `resolveGitRoot`, `getCurrentBranch`, `shellQuote`
- **side-agents**: остаётся в текущем состоянии (монолит), но чистые функции, которые дублируются в тестах, экспортируются для прямого импорта в тестах. Декомпозиция side-agents — отдельная задача.
- **Интерфейсы**: публичный API tool `subagent` (имя, schema, renderCall/renderResult) не меняется. Изменяется только внутренняя организация кода.
- **shared-утилиты**: каждый модуль экспортирует только чистые функции (no side effects, no global state). Интерфейс — named exports из barrel file.
- **shared/git**: `run`/`runOrThrow` — тонкие wrappers над `spawnSync` с единым форматом результата (`CommandResult`). Интерфейс не меняется.
- **Зависимости**: shared-модули не зависят от pi API. runner зависит от pi API (spawn pi process). render зависит от pi-tui. types не зависит ни от чего.

## Testing Decisions

- **Хороший тест**: тестирует внешнее поведение модуля через его публичный интерфейс, не завязан на внутреннюю реализацию. Для чистых функций — прямой вызов с проверкой вывода. Для FS-утилит — реальная временная директория. Для runner — мок `child_process.spawn`.
- **subagent/types**: не тестируется отдельно (POSO, нет логики)
- **subagent/runner**: unit-тесты на `mapWithConcurrencyLimit` (concurrency edge cases), `getFinalOutput` (message extraction), `getDisplayItems` (message parsing). `runSingleAgent` тестируется через mock spawn.
- **subagent/render**: unit-тесты на `formatTokens`, `formatUsageStats`, `formatToolCall` (каждый tool type), collapsed/expanded rendering
- **shared/fs**: unit-тесты с `mkdtemp` — ensureDir создаёт вложенные директории, fileExists возвращает false для несуществующих, readJsonFile парсит JSON, atomicWrite атомарно записывает
- **shared/text**: unit-тесты на граничные случаи (empty string, maxChars=0, maxChars=1, очень длинная строка, ANSI-последовательности)
- **shared/async**: unit-тесты на `stringifyError` (Error, string, number, null, undefined), `sleep` (resolved after ms)
- **shared/git**: unit-тесты на `shellQuote` (single quotes, embedded quotes), `run` (mock spawnSync)
- **side-agents/backlog**: unit-тесты через прямой импорт из модуля (не реимплементацию) — `sanitizeBacklogLines`, `collectRecentBacklogLines`, `stripTerminalNoise`
- **side-agents/registry**: unit-тесты с temp directory — load/save roundtrip, mutate с lock contention, concurrent writes
- **side-agents/worktree**: unit-тесты на slot naming, orphan lock detection
- **side-agents/status-poll**: unit-тесты на `collectStatusTransitions`, dedup logic
- **Prior art**: `tests/zai-tools/` — хороший пример: отдельные файлы для каждого concern (cache, rate-limit, retry, json-parse, toggle), моки в `tests/stubs/`, helper в `tests/test-helpers/`

## Out of Scope

- Декомпозиция side-agents монолита (2403 строки) — отдельная задача
- Декомпозиция pi-ralph-wiggum монолита
- Миграция синхронного I/O на async в pi-ralph-wiggum, pi-auto-rename, system-prompt-template
- Обновление зависимостей (`@modelcontextprotocol/sdk`, `typescript`)
- Миграция на новую версию pi API
- Изменение публичного API tool `subagent` (параметры, формат ответа)
- Изменение поведения `subagent` (как он запускает процессы, как рендерит результат)
- Создание integration-тестов для `subagent` (live pi spawn)

## Comments

> *This was generated by AI during triage.*

## Agent Brief

**Category:** enhancement
**Summary:** Декомпозиция монолита subagent (987 строк) на types/runner/render/index + создание shared-утилит (fs/text/async/git) с unit-тестами

**Current behavior:**
Расширение `subagent` — единый 987-строчный файл, где смешаны типы, child process lifecycle, TUI-рендеринг и tool-регистрация. Утилиты (`ensureDir`, `fileExists`, `tryRead`, `atomicWrite`, `truncateWithEllipsis`, `stripTerminalNoise`, `splitLines`, `tailLines`, `sleep`, `stringifyError`, `run`/`runOrThrow`, `resolveGitRoot`, `getCurrentBranch`, `shellQuote`) дублируются в 3-4 расширениях.

**Desired behavior:**
1. subagent разделён на 4 модуля: `types` (POSO), `runner` (child process lifecycle), `render` (TUI formatting), `index` (registration only).
2. Создана директория `extensions/shared/` с 4 модулями: `fs`, `text`, `async`, `git` — каждый с named exports чистых функций.
3. Все дубликаты shared-утилит в других расширениях заменены на импорты из shared.
4. Unit-тесты покрывают все 8 модулей.
5. `vitest run` — все тесты проходят, публичный API subagent не изменился.

**Key interfaces:**
- `types`: `SingleResult` (agent result с exitCode, messages, usage, model, step), `SubagentDetails` (mode, agentScope, results), `UsageStats` (input/output/cache cost), `DisplayItem` (text | toolCall union)
- `runner`: `runSingleAgent(defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails) → Promise<SingleResult>`, `mapWithConcurrencyLimit<TIn, TOut>(items, concurrency, fn) → Promise<TOut[]>`, `getFinalOutput(messages) → string`, `getDisplayItems(messages) → DisplayItem[]`
- `render`: `formatTokens(count) → string`, `formatUsageStats(usage, model?) → string`, `formatToolCall(toolName, args, themeFg) → string` — все существующие рендеринг-функции переносятся без изменений сигнатур
- `shared/fs`: `ensureDir(path) → Promise<void>`, `fileExists(path) → Promise<boolean>`, `tryRead(path) → string | undefined`, `readJsonFile<T>(path) → Promise<T | undefined>`, `atomicWrite(path, content) → Promise<void>` — все async
- `shared/text`: `truncateWithEllipsis(text, maxChars) → string`, `stripTerminalNoise(text) → string`, `splitLines(text) → string[]`, `tailLines(text, count) → string[]` — все чистые
- `shared/async`: `sleep(ms) → Promise<void>`, `stringifyError(err: unknown) → string` — все чистые
- `shared/git`: `run(command, args, options?) → CommandResult`, `runOrThrow(command, args, options?) → CommandResult`, `shellQuote(value) → string`, `resolveGitRoot(cwd) → string`, `getCurrentBranch(cwd) → string`

**Acceptance criteria:**
- [ ] subagent entry point содержит только `pi.registerTool()` — все функции делегированы к runner/render
- [ ] `types` модуль экспортирует все интерфейсы без побочных эффектов
- [ ] `runner` модуль экспортирует `runSingleAgent`, `mapWithConcurrencyLimit`, `getFinalOutput`, `getDisplayItems`
- [ ] `render` модуль экспортирует `formatTokens`, `formatUsageStats`, `formatToolCall`
- [ ] `extensions/shared/fs` существует и экспортирует `ensureDir`, `fileExists`, `tryRead`, `readJsonFile`, `atomicWrite`
- [ ] `extensions/shared/text` существует и экспортирует `truncateWithEllipsis`, `stripTerminalNoise`, `splitLines`, `tailLines`
- [ ] `extensions/shared/async` существует и экспортирует `sleep`, `stringifyError`
- [ ] `extensions/shared/git` существует и экспортирует `run`, `runOrThrow`, `shellQuote`, `resolveGitRoot`, `getCurrentBranch`, тип `CommandResult`
- [ ] grep показывает ровно 1 определение каждой shared-функции во всей кодовой базе
- [ ] `vitest run` — все существующие тесты проходят
- [ ] Новый тестовый файл для shared/fs покрывает: ensureDir (nested dirs), fileExists (exists/not exists), readJsonFile (valid/invalid JSON, missing file), atomicWrite (atomic replacement)
- [ ] Новый тестовый файл для shared/text покрывает: truncateWithEllipsis (maxChars 0/1/normal/overflow), stripTerminalNoise (CSI, OSC, control, clean), splitLines (\n, \r\n, trailing newline), tailLines (normal, empty, overshoot)
- [ ] Новый тестовый файл для shared/async покрывает: stringifyError (Error/string/number/null/undefined), sleep (resolved after ms)
- [ ] Новый тестовый файл для shared/git покрывает: shellQuote (plain, embedded quotes, empty)
- [ ] Новый тестовый файл для subagent/runner покрывает: mapWithConcurrencyLimit (concurrency 1/N/empty, error propagation), getFinalOutput (assistant text, no assistant, tools only), getDisplayItems (mixed messages)
- [ ] Новый тестовый файл для subagent/render покрывает: formatTokens (0/999/1k/10k/1M), formatUsageStats (all/partial/empty fields), formatToolCall (bash/read/write/edit/ls/find/grep/unknown)
- [ ] Публичный API tool `subagent` не изменился: имя, schema параметров, renderCall, renderResult, format ответа

**Out of scope:**
- Декомпозиция side-agents монолита (2403 строки) — отдельная задача (PRD `side-agents-decompose`)
- Декомпозиция pi-ralph-wiggum
- Миграция sync→async I/O
- Обновление зависимостей
- Изменение публичного API subagent
- Integration-тесты (live pi spawn)
- side-agents: перенос тестов tool-contract.test.ts на прямые импорты (отдельная задача)

## Further Notes

- После завершения этой задачи side-agents можно будет декомпозировать по аналогичному паттерну, переиспользуя shared-утилиты.
- Shared-модули не являются npm-пакетом — это просто директория `extensions/shared/` с TypeScript-модулями, которые импортируются другими расширениями. Пакет `ruttybob` уже собирает все расширения.
- При извлечении shared-утилит из side-agents важно не ломать экспорты — текущие тесты side-agents (`tool-contract.test.ts`) продолжают реимплементировать функции до прохода декомпозиции side-agents, но могут быть переведены на импорт из shared/text и shared/async уже сейчас.
