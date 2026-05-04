Status: ready-for-agent
Category: enhancement

## Problem Statement

Расширение `side-agents` — монолит в 2403 строки. В одном файле смешаны: 20+ типов, git-утилиты, tmux-утилиты, file-locking registry, worktree-менеджмент, backlog-санитизация, status-polling с hot-reload coordination, 6 tool/command-регистраций и 4 event handler'а. Файл невозможно ревьюить целиком, нельзя тестировать изолированно. Тесты (`tool-contract.test.ts`, 350 строк) реимплементируют чистые функции вручную — при изменении исходника тесты не замечают регрессию.

## Solution

Разбить монолит на 8 модулей по ответственности. Экспортировать чистые функции для прямого импорта в тестах. Публичный API (6 tools/commands, event handlers) не меняется. Все существующие тесты продолжают проходить.

## User Stories

### Декомпозиция

1. Как мейнтейнер, я хочу чтобы типы (AgentRecord, RegistryFile, CommandResult, AgentStatus, StartAgentParams, StatusTransitionNotice и т.д.) жили в отдельном модуле, чтобы их можно было импортировать в тестах и других модулях без побочных эффектов
2. Как мейнтейнер, я хочу чтобы FS-утилиты (ensureDir, fileExists, readJsonFile, atomicWrite, withFileLock, readJsonFile) жили в отдельном модуле, чтобы не смешивать I/O с бизнес-логикой
3. Как мейнтейнер, я хочу чтобы git-утилиты (run/runOrThrow, resolveGitRoot, getCurrentBranch, shellQuote) жили в отдельном модуле, чтобы изолировать shell-взаимодействие
4. Как мейнтейнер, я хочу чтобы tmux-утилиты (ensureTmuxReady, getCurrentTmuxSession, createTmuxWindow, tmuxWindowExists, tmuxPipePaneToFile, tmuxSendPrompt, tmuxCaptureTail, tmuxCaptureVisible) жили в отдельном модуле, чтобы изолировать terminal-взаимодействие
5. Как мейнтейнер, я хочу чтобы registry (load/save/mutate, lock-координация) жил в отдельном модуле, чтобы конкурентный доступ к файлу был инкапсулирован
6. Как мейнтейнер, я хочу чтобы worktree-менеджмент (allocate, slots, orphan locks, sync pi-files, cleanup) жил в отдельном модуле, чтобы git worktree lifecycle был изолирован
7. Как мейнтейнер, я хочу чтобы backlog-утилиты (strip, sanitize, tail, select, collectRecentBacklogLines) жили в отдельном модуле, чтобы чистые функции были доступны для тестирования
8. Как мейнтейнер, я хочу чтобы status-poll (poller coordination, dedup, transitions, render) жил в отдельном модуле, чтобы hot-reload-safe логика была изолирована
9. Как мейнтейнер, я хочу чтобы entry point содержал только регистрации tools/commands и event handlers, чтобы общая структура расширения была видна сразу
10. Как мейнтейнер, я хочу чтобы каждый модуль экспортировал только публичный интерфейс, чтобы внутренние детали не утекали

### Тестирование без дублирования

11. Как разработчик, я хочу чтобы тесты импортировали `sanitizeSlug` напрямую из модуля, а не реимплементировали его в тесте
12. Как разработчик, я хочу чтобы тесты импортировали `slugFromTask` напрямую из модуля
13. Как разработчик, я хочу чтобы тесты импортировали `deduplicateSlug` напрямую из модуля
14. Как разработчик, я хочу чтобы тесты импортировали `stripTerminalNoise` напрямую из модуля
15. Как разработчик, я хочу чтобы тесты импортировали `truncateWithEllipsis` напрямую из модуля
16. Как разработчик, я хочу чтобы тесты импортировали `collectRecentBacklogLines` напрямую из модуля
17. Как разработчик, я хочу чтобы тесты импортировали `sanitizeBacklogLines` напрямую из модуля
18. Как разработчик, я хочу чтобы тесты импортировали `collectStatusTransitions` напрямую из модуля
19. Как разработчик, я хочу чтобы тесты импортировали `isTerminalStatus` напрямую из модуля
20. Как разработчик, я хочу чтобы тесты импортировали `cleanupWorktreeLockBestEffort` напрямую из модуля
21. Как разработчик, я хочу чтобы при изменении сигнатуры чистой функции в исходнике тесты ломались на этапе компиляции, а не молча устаревали

### Новые unit-тесты для глубоких модулей

22. Как разработчик, я хочу чтобы registry (load/save/mutate) имел unit-тесты с реальной временной FS, чтобы гарантировать атомарность записи и корректность file locking
23. Как разработчик, я хочу чтобы backlog-санитизация имела unit-тесты на граничные случаи (empty input, только разделители, ANSI-шум, превышение лимита символов)
24. Как разработчик, я хочу чтобы status-poll (collectStatusTransitions, dedup) имел unit-тесты, чтобы зафиксировать контракт переходов статусов
25. Как разработчик, я хочу чтобы worktree (slot naming, orphan lock detection) имел unit-тесты, чтобы гарантировать корректность reclaim-логики

### Сохранение поведения

26. Как пользователь, я хочу чтобы все 6 инструментов (agent-start, agent-check, agent-wait-any, agent-send, /agent, /agents) работали идентично после рефакторинга
27. Как пользователь, я хочу чтобы все существующие тесты (`vitest run`) проходили без изменений
28. Как пользователь, я хочу чтобы публичный API (имена tools/commands, схемы параметров, формат ответов) не менялся

## Implementation Decisions

- **Архитектура**: side-agents разделяется на следующие модули:
  - **types** — все типы и интерфейсы (AgentRecord, RegistryFile, CommandResult, AgentStatus, StartAgentParams, StatusTransitionNotice, WorktreeSlot, OrphanWorktreeLock и т.д.)
  - **utils** — общие утилиты (sleep, nowIso, stringifyError, shellQuote, truncateWithEllipsis, summarizeTask, normalizeAgentId)
  - **git** — run/runOrThrow, resolveGitRoot, getCurrentBranch
  - **tmux** — ensureTmuxReady, getCurrentTmuxSession, createTmuxWindow, tmuxWindowExists, tmuxPipePaneToFile, tmuxSendPrompt, tmuxCaptureTail, tmuxCaptureVisible, tmuxInterrupt
  - **registry** — loadRegistry, saveRegistry, mutateRegistry, withFileLock, emptyRegistry
  - **worktree** — allocateWorktree, listWorktreeSlots, listRegisteredWorktrees, scanOrphanWorktreeLocks, reclaimOrphanWorktreeLocks, syncParallelAgentPiFiles, writeWorktreeLock, updateWorktreeLock, cleanupWorktreeLockBestEffort
  - **backlog** — stripTerminalNoise, splitLines, tailLines, selectBacklogTailLines, sanitizeBacklogLines, collectRecentBacklogLines, isBacklogSeparatorLine
  - **status-poll** — collectStatusTransitions, emitStatusTransitions, renderStatusLine, ensureStatusPoller, isLatestGeneration
  - **index** — только export default function с registerTool/registerCommand/pi.on вызовами, делегирующими к модулям
- **Экспорт**: каждый модуль экспортирует свои функции как named exports. Типы — как named type exports. index.ts реэкспортирует только default function.
- **Зависимости**: types → (нет зависимостей). utils → types. git → types, utils. tmux → types, utils. registry → types, utils. worktree → types, utils, git, registry. backlog → utils. status-poll → types, utils, registry, tmux, backlog. index → все вышеперечисленные.
- **Тесты**: реимплементации в `tool-contract.test.ts` заменяются на прямые импорты из модулей. Секция "Minimal JS re-implementations" удаляется целиком.
- **Глобальный state**: module-level `let` переменные (statusPollTimer, statusPollContext и т.д.) переезжают в status-poll как замкнутый state модуля, либо как singleton-объект. Публичный интерфейс status-poll не раскрывает внутренний state.

## Testing Decisions

- **Хороший тест**: тестирует внешнее поведение через публичный интерфейс. Для чистых функций — вызов с проверкой вывода. Для FS — реальная временная директория через `mkdtemp`. Для registry — roundtrip load/save/mutate.
- **backlog**: unit-тесты на `sanitizeBacklogLines` (empty, separators-only, ANSI noise, char limit overflow), `collectRecentBacklogLines` (minimum lines, empty, visible pane scenario). Existing tests from `tool-contract.test.ts` переносятся на импорт из модуля.
- **registry**: unit-тесты с temp dir — load empty, save+load roundtrip, mutate atomic, concurrent write через withFileLock. Prior art: `tests/pi-mesh/tests/registry.test.ts`.
- **status-poll**: unit-тесты на `collectStatusTransitions` — first snapshot (no transitions), changed status, removed agent → synthetic done, removed terminal → no transition. Tests из `tool-contract.test.ts` переносятся на импорт.
- **worktree**: unit-тесты на slot naming regex, orphan lock detection (reclaimable vs blocked), lock cleanup. Prior art: существующие cleanup tests из `tool-contract.test.ts`.
- **utils**: unit-тесты на `sanitizeSlug`, `slugFromTask`, `deduplicateSlug`, `isTerminalStatus`, `truncateWithEllipsis`. Tests из `tool-contract.test.ts` переносятся на импорт.
- **Приоритет**: сначала перенести тесты на импорт (удаить реимплементации), потом добавить новые unit-тесты для registry и worktree.

## Out of Scope

- Создание shared-утилит (`extensions/shared/`) — отдельная задача
- Декомпозиция subagent (987 строк) — отдельная задача
- Декомпозиция pi-ralph-wiggum
- Миграция синхронного I/O на async
- Обновление зависимостей
- Изменение публичного API (имена tools, схемы параметров)
- Новые functional-тесты (live tmux/git)

## Further Notes

- После создания shared-утилит (`extensions/shared/`) модули side-agents смогут импортировать общие FS/text/git-утилиты вместо локальных копий. Это можно сделать отдельным проходом после shared.
- Текущий `tool-contract.test.ts` содержит ~350 строк реимплементаций. После этого PRD они заменяются на ~20 строк импортов. Файл сокращается примерно вдвое.
- Порядок выполнения: сначала декомпозиция (модули), потом перенос тестов на импорт, потом новые unit-тесты.
