# Changelog

## [Unreleased]

### Added

- **pi-mesh**: расширение для mesh-сети агентов (overlay, registry, feed, messaging, tracking, reservations)
- **session-recap**: расширение для recap-сессий
- **side-agents**: расширение для управления побочными агентами (spawn, check, wait, send)
- **tests/side-agents**: интеграционные тесты (integration.test.mjs) и контрактные тесты инструментов (tool-contract.test.ts)

### Changed

- **pi-ralph-wiggum**: обновлён `updateUI` — поддержка live-прогресса через `ProgressState`, виджет теперь рендерит `formatStatusText` / `renderWidget` при наличии прогресса
- **package.json**: добавлена зависимость `@sinclair/typebox`, добавлен скрипт `test:integration:side-agents`, подключены навыки `side-agents`
