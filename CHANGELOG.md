# Changelog

## [Unreleased]

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

### Changed

- **side-agents**: убрана LLM-зависимость — slug генерируется эвристикой, kickoff prompt ссылается на session_query вместо LLM-саммари, убраны «Press any key» из launch-скрипта, добавлена file-based координация poller/dedup для hot-reload
- **pi-ralph-wiggum**: обновлён `updateUI` — поддержка live-прогресса через `ProgressState`, виджет теперь рендерит `formatStatusText` / `renderWidget` при наличии прогресса
- **prompts**: убраны дублирующие языковые инструкции из файлов промптов (commit, discuss, explore, plan-detailed, plan) — язык теперь задаётся через AGENTS.md
- **package.json**: добавлена зависимость `@sinclair/typebox`, добавлен скрипт `test:integration:side-agents`, подключены навыки `side-agents`
