Status: ready-for-agent
Category: enhancement

## Problem Statement

В кодовой базе 11 расширений (~15K строк) дублируются базовые утилиты (FS, text, git, async — по 3-4 копии каждой), встречаются синхронные I/O-вызовы в async-контекстах, мелкие расширения (subagent, pi-auto-rename, system-prompt-template) не декомпозированы, а TUI-boilerplate (`custom-ui:shown/hidden`) повторяется вручную. Это замедляет изменения — поправив утилиту в одном месте, забываешь в трёх других.

## Solution

Создать shared-модуль с переиспользуемыми утилитами, декомпозировать монолит subagent, мигрировать синхронный I/O на async, вынести TUI-boilerplate в helper. Публичные API всех расширений не меняются. Все существующие тесты продолжают проходить.

## User Stories

### Shared-утилиты: FS

1. Как мейнтейнер, я хочу чтобы `ensureDir` был в одном месте, чтобы при исправлении (например, добавлении graceful error handling) не искать 4 копии
2. Как мейнтейнер, я хочу чтобы `fileExists` был в одном месте, чтобы избежать расхождения поведения (кто-то использует `fs.stat`, кто-то `fs.access`)
3. Как мейнтейнер, я хочу чтобы `readJsonFile` был в одном месте, чтобы обработка parse-ошибок была единообразной
4. Как мейнтейнер, я хочу чтобы `atomicWrite` был в одном месте, чтобы все расширения атомарно записывали файлы
5. Как мейнтейнер, я хочу чтобы `tryRead` был в одном месте, чтобы возвращал `string | undefined` единообразно

### Shared-утилиты: text

6. Как мейнтейнер, я хочу чтобы `truncateWithEllipsis` был в одном месте, чтобы граничные случаи (maxChars=0, maxChars=1, пустая строка) обрабатывались одинаково
7. Как мейнтейнер, я хочу чтобы `stripTerminalNoise` был в одном месте, чтобы regex для ANSI/control sequences не расходился между расширениями
8. Как мейнтейнер, я хочу чтобы `splitLines` и `tailLines` были в одном месте

### Shared-утилиты: async

9. Как мейнтейнер, я хочу чтобы `sleep` был в одном месте, чтобы убрать inline `new Promise(resolve => setTimeout(resolve, ms))`
10. Как мейнтейнер, я хочу чтобы `stringifyError` был в одном месте, чтобы обработка `unknown`-ошибок была единообразной

### Shared-утилиты: git

11. Как мейнтейнер, я хочу чтобы `run`/`runOrThrow` (spawnSync wrappers) были в одном месте, чтобы `CommandResult`-тип и обработка ошибок были единообразными
12. Как мейнтейнер, я хочу чтобы `resolveGitRoot` и `getCurrentBranch` были в одном месте
13. Как мейнтейнер, я хочу чтобы `shellQuote` был в одном месте

### Subagent: декомпозиция

14. Как мейнтейнер, я хочу чтобы типы subagent (SingleResult, SubagentDetails, UsageStats, DisplayItem) жили в отдельном модуле, чтобы их можно было импортировать без побочных эффектов
15. Как мейнтейнер, я хочу чтобы runner (runSingleAgent, mapWithConcurrencyLimit, getFinalOutput, getDisplayItems) жил в отдельном модуле, чтобы child process lifecycle был изолирован
16. Как мейнтейнер, я хочу чтобы render (formatTokens, formatUsageStats, formatToolCall, renderCall, renderResult) жил в отдельном модуле, чтобы TUI-рендеринг не смешивался с логикой
17. Как мейнтейнер, я хочу чтобы entry point subagent содержал только регистрацию tool

### Миграция sync → async

18. Как мейнтейнер, я хочу чтобы pi-ralph-wiggum использовал async FS API, чтобы не блокировать event loop синхронными вызовами
19. Как мейнтейнер, я хочу чтобы pi-auto-rename использовал async FS API в async handlers
20. Как мейнтейнер, я хочу чтобы system-prompt-template использовал async FS API

### Custom-ui helper

21. Как мейнтейнер, я хочу чтобы boilerplate `pi?.events?.emit("custom-ui:shown/hidden")` с try/finally был в одном helper'е, чтобы не копировать его в каждое расширение с overlay

### Cleanup

22. Как мейнтейнер, я хочу чтобы неиспользуемые импорты были удалены
23. Как мейнтейнер, я хочу чтобы стиль импортов FS был унифицирован (все через shared)
24. Как мейнтейнер, я хочу чтобы `new Date().toISOString()` заменялся на `nowIso()` из shared

### Тестирование shared-утилит

25. Как разработчик, я хочу чтобы shared/fs имел unit-тесты с временной FS (mkdtemp): ensureDir создаёт вложенные директории, fileExists возвращает false для несуществующих, readJsonFile парсит JSON, atomicWrite записывает атомарно
26. Как разработчик, я хочу чтобы shared/text имел unit-тесты на граничные случаи: empty string, maxChars=0, maxChars=1, длинная строка, ANSI-последовательности
27. Как разработчик, я хочу чтобы shared/async имел unit-тесты на stringifyError (Error, string, number, null, undefined) и sleep (resolved after ms)
28. Как разработчик, я хочу чтобы shared/git имел unit-тесты на shellQuote (single quotes, embedded quotes) и run (mock spawnSync)
29. Как разработчик, я хочу чтобы subagent/runner имел unit-тесты на mapWithConcurrencyLimit (concurrency=1, N, empty input), getFinalOutput, getDisplayItems
30. Как разработчик, я хочу чтобы subagent/render имел unit-тесты на formatTokens, formatUsageStats, formatToolCall (каждый tool type)

### Сохранение поведения

31. Как пользователь, я хочу чтобы все расширения работали идентично после рефакторинга
32. Как пользователь, я хочу чтобы все существующие тесты проходили без изменений
33. Как пользователь, я хочу чтобы публичные API всех расширений (tool имена, схемы параметров, форматы ответов, commands) не менялись

## Implementation Decisions

### Shared-модули

Создаётся директория `extensions/shared/` с четырьмя модулями:
- **shared/fs** — named exports: `ensureDir`, `fileExists`, `tryRead`, `readJsonFile`, `atomicWrite`. Все async. Не зависит от pi API.
- **shared/text** — named exports: `truncateWithEllipsis`, `stripTerminalNoise`, `splitLines`, `tailLines`. Чистые функции. Не зависит от pi API.
- **shared/async** — named exports: `sleep`, `stringifyError`. Чистые функции. Не зависит от pi API.
- **shared/git** — named exports: `run`, `runOrThrow`, `resolveGitRoot`, `getCurrentBranch`, `shellQuote`, тип `CommandResult`. Зависит от `node:child_process`.

Shared-модули — TypeScript-модули в `extensions/shared/`, не npm-пакет. Импортируются другими расширениями через relative paths.

### Subagent: архитектура

- **types** — интерфейсы SingleResult, SubagentDetails, UsageStats, DisplayItem, OnUpdateCallback
- **runner** — runSingleAgent, mapWithConcurrencyLimit, writePromptToTempFile, getPiInvocation, getFinalOutput, getDisplayItems
- **render** — formatTokens, formatUsageStats, formatToolCall, renderCall (exported as object method), renderResult (exported as object method)
- **index** — только pi.registerTool() с делегированием к runner и render

### Миграция sync → async

- pi-ralph-wiggum: `fs.existsSync` → `fileExists` (shared), `fs.readFileSync` → `tryRead` (shared), `fs.writeFileSync` → `atomicWrite` (shared), `fs.readdirSync` → `fs.promises.readdir`
- pi-auto-rename: `readFileSync`/`writeFileSync`/`mkdirSync` → async эквиваленты из shared
- system-prompt-template: `existsSync`/`readFileSync` → async из shared

### Custom-ui helper

Создаётся `extensions/shared/tui.ts` с функцией `withCustomUI(pi, fn)`, которая оборачивает вызов в `custom-ui:shown`/`custom-ui:hidden` с try/finally. Расширения pi-quota, pi-auto-rename, pi-mesh заменяют ручной boilerplate на вызов helper.

### Порядок выполнения

1. Создать shared-модули, переместить утилиты из side-agents/pi-mesh/ralph-wiggum
2. Декомпозировать subagent
3. Мигрировать sync→async в ralph-wiggum, auto-rename, system-prompt-template
4. Создать custom-ui helper, заменить boilerplate
5. Финальный cleanup (unused imports, unified style, nowIso)

Шаги 2-4 можно выполнять параллельно после завершения шага 1.

## Testing Decisions

- **Хороший тест**: тестирует внешнее поведение через публичный интерфейс, не завязан на реализацию. Для чистых функций — прямой вызов. Для FS — реальная временная директория.
- **shared/fs**: unit-тесты с `mkdtemp`. ensureDir — nested dirs. fileExists — exists/not exists. readJsonFile — valid JSON, invalid JSON, missing file. atomicWrite — atomic replacement. Prior art: `tests/pi-mesh/tests/registry.test.ts` (temp FS tests).
- **shared/text**: unit-тесты на граничные случаи. truncateWithEllipsis — maxChars=0/1/норма/превышение. stripTerminalNoise — CSI, OSC, control chars, чистый текст. splitLines — \n, \r\n, trailing newline. tailLines — normal, empty, overshoot.
- **shared/async**: stringifyError — Error instance, string, number, null, undefined. sleep — resolves after ~ms (tolerance ±50ms).
- **shared/git**: shellQuote — plain string, embedded single quote, empty string. run — mock spawnSync для success/error/timeout.
- **subagent/runner**: mapWithConcurrencyLimit — concurrency=1 (sequential), N (parallel), empty input, error propagation. getFinalOutput — assistant text, no assistant, tool calls only. getDisplayItems — mixed message types.
- **subagent/render**: formatTokens — 0, 999, 1k, 10k, 1M. formatUsageStats — all fields, partial fields, empty. formatToolCall — bash, read, write, edit, ls, find, grep, unknown tool.
- **Prior art**: `tests/zai-tools/` — лучший пример: отдельные файлы для каждого concern, моки в `tests/stubs/`, helper'ы в `tests/test-helpers/`.

## Out of Scope

- Декомпозиция side-agents монолита (2403 строки) — отдельная задача (PRD `side-agents-decompose`)
- Декомпозиция pi-ralph-wiggum монолита
- Обновление зависимостей (`@modelcontextprotocol/sdk`, `typescript`)
- Миграция на новую версию pi API
- Создание integration-тестов для subagent (live pi spawn)
- Новые functional-тесты (live tmux/git)

## Further Notes

- Shared-модули создаются из утилит, которые уже существуют в side-agents, pi-mesh, pi-ralph-wiggum. Функции переносятся, оригиналы заменяются на re-export или import. После миграции grep должен показывать ровно 1 определение каждой shared-функции.
- Subagent-декомпозиция следует тому же паттерну, что и PRD `side-agents-decompose` — types/runner/render/index. Это делает архитектуру двух крупнейших расширений единообразной.
- Миграция sync→async — поведенчески нейтральна (async handlers уже await'ят), но устраняет блокировки event loop. Для pi-ralph-wiggum это особенно важно — `readdirSync` в `listLoops` может блокировать при большом количестве директорий.
- Custom-ui helper устраняет ~10 строк boilerplate на каждое расширение с overlay. Сейчас используется в 3 расширениях (pi-quota, pi-auto-rename, pi-mesh), но может понадобиться новым расширениям.
