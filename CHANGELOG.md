# Changelog

## [Unreleased]

### Added

- **subagent**: динамическая сборка JSON-схемы tool — при `parallelEnabled: false` поле `tasks` отсутствует в схеме; конфигурация через `settings.json` (defaults → global → project)
- **evolver/tests**: placeholder-тесты (`markdown.test.ts`, `memory-graph.test.ts`, `utils.test.ts`) заменены на полноценные unit-тесты с temp-директориями и реальными вызовами
- **package.json**: добавлен путь `./skills` в секцию `skills`

### Changed

- **subagent**: `agentScope` и `confirmProjectAgents` перенесены из tool schema в `SubagentConfig` — LLM больше не видит и не передаёт эти параметры; scope настраивается в `settings.json` (defaults → global → project); boot-time discovery использует `config.agentScope` вместо хардкода `"user"`
- **prompts/plan-detailed**: убрана устаревшая секция Input

### Changed

- **subagent**: монолит index.ts (987 строк) декомпозирован на модули types, runner, render, utils — entry point содержит только tool-регистрацию
- **side-agents**: монолит index.ts (2403 строки) декомпозирован на модули types, utils, git, tmux, registry, worktree, backlog, status-poll — entry point содержит только tool/command/event-регистрации
- **shared**: созданы переиспользуемые модули (fs, text, async, git) в `extensions/shared/` — устранено дублирование утилит между 4+ расширениями
- **pi-ralph-wiggum**: миграция FS-утилит на импорты из shared (ensureDir, fileExists, tryRead, atomicWrite)
- **pi-auto-rename**: миграция FS-утилит на импорты из shared (tryRead, atomicWrite, readJsonFile)
- **system-prompt-template**: миграция FS-утилит на импорты из shared (tryRead, fileExists)
- **pi-mesh**: добавлены TODO-комментарии для миграции sync→async утилит в registry, messaging, config

### Added

- **tests/shared**: unit-тесты для shared-модулей — fs (12), text (13), async (6), git (10)
- **tests/subagent**: unit-тесты для subagent-модулей — runner, render

### Added

- **zai-tools**: slash-команда `/zai-tools` для мгновенного toggle всех инструментов расширения (on/off). Состояние персистентно в рамках сессии и восстанавливается при навигации по session tree
- **zai-tools**: глобальное состояние toggle (файл `zai-tools-state.json`) — при старте сессии без session entry восстанавливается из глобального файла
- **zai-tools**: MCP-клиент (remote + stdio), сервисы (vision, web-search, web-reader, zread), инструменты, утилиты (cache, rate-limit, retry, json-parse, truncation)
- **zai-tools**: полный набор тестов — cache, config, extension, global-state, json-parse, rate-limit, retry, toggle, truncation, vision-service, web-search-service, zread-service, tool-onUpdate
- **pi-mesh**: расширение для mesh-сети агентов (overlay, registry, feed, messaging, tracking, reservations)
- **session-recap**: расширение для recap-сессий
- **side-agents**: расширение для управления побочными агентами (spawn, check, wait, send)
- **tests/side-agents**: интеграционные тесты (integration.test.mjs) и контрактные тесты инструментов (tool-contract.test.ts)
- **package.json**: добавлена секция `prompts` — папка `./prompts` теперь входит в пакет расширений
- **prompts**: добавлены файлы промптов — commit, discuss, explore, plan-detailed, plan

### Added

- **subagent**: расширение для делегирования задач вложенным агентам (agents, prompts, delegation chain)
- **pi-mesh**: chat-overlay, feed-overlay, overlay-helpers, toggle — разбиение монолитного overlay на модули
- **pi-mesh**: тесты для chat-overlay, feed-overlay, overlay-helpers, toggle
- **prompts**: добавлены промпты explain-codebase и modernize-and-refactor

### Changed

- **pi-mesh**: монолитный overlay.ts разбит на chat-overlay, feed-overlay, overlay-helpers и toggle
- **prompts**: заменена ссылка на Ghostty → mods в plan и plan-detailed
- **side-agents**: убрана LLM-зависимость — slug генерируется эвристикой, kickoff prompt ссылается на session_query вместо LLM-саммари, убраны «Press any key» из launch-скрипта, добавлена file-based координация poller/dedup для hot-reload
- **pi-ralph-wiggum**: добавлен `disable-model-invocation: true` в SKILL.md wiggummy
- **prompts**: убраны дублирующие языковые инструкции из файлов промптов (commit, discuss, explore, plan-detailed, plan) — язык теперь задаётся через AGENTS.md
- **package.json**: добавлена зависимость `@sinclair/typebox`, добавлен скрипт `test:integration:side-agents`, подключены навыки `side-agents`
