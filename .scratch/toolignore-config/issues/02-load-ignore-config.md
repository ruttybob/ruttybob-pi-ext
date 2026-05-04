# 02 — Чтение и объединение toolignore-конфигов

Status: ready-for-agent

## Parent

`.scratch/toolignore-config/PRD.md`

## What to build

Функция `loadIgnoreConfig(cwd: string): Set<string>` — читает глобальный `~/.pi/agent/toolignore.json` и проектный `<cwd>/.pi/toolignore.json`, объединяет паттерны (union), матчит их против реально доступных инструментов и возвращает множество имён игнорируемых инструментов. Обработка ошибок: невалидный JSON → warning + пустой результат, отсутствие файла → норма.

## Acceptance criteria

- [ ] Оба файла существуют → паттерны объединяются (union)
- [ ] Только глобальный → используются глобальные паттерны
- [ ] Только проектный → используются проектные паттерны
- [ ] Ни одного файла → пустой Set
- [ ] Невалидный JSON → `console.warn` + пустой результат для этого файла
- [ ] Паттерны из конфига матчатся через `matchesPattern` против имён инструментов
- [ ] Функция экспортируется для тестирования

## Blocked by

- `.scratch/toolignore-config/issues/01-glob-matching.md`
