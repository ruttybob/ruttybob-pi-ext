# 03 — Фильтрация SettingsList и защита restore

Status: ready-for-agent

## Parent

`.scratch/toolignore-config/PRD.md`

## What to build

Интеграция ignore-списка в расширение `/tools`: игнорируемые инструменты не появляются в SettingsList UI. Обновление `restoreFromBranch()` — игнорируемые инструменты принудительно добавляются в enabled set при любом restore. Интеграционные тесты.

## Acceptance criteria

- [ ] Игнорируемые инструменты не появляются в SettingsList items
- [ ] Неигнорируемые инструменты отображаются и переключаются как раньше
- [ ] `restoreFromBranch()` всегда включает игнорируемые инструменты в enabled set
- [ ] `restoreFromBranch()` с пустым сохранённым состоянием + ignore-список → игнорируемые инструменты активны
- [ ] `restoreFromBranch()` с сохранённым состоянием (игнорируемый инструмент выключен) → всё равно активен
- [ ] `setActiveTools()` вызывается с union сохранённых + игнорируемых инструментов
- [ ] Существующие тесты `restoreFromBranch` продолжают проходить

## Blocked by

- `.scratch/toolignore-config/issues/02-load-ignore-config.md`
