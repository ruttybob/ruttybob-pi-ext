# 01 — Glob-матчинг для toolignore

Status: ready-for-agent

## Parent

`.scratch/toolignore-config/PRD.md`

## What to build

Чистая функция `matchesPattern(name: string, pattern: string): boolean` с поддержкой `*` (любая подстрока) и `?` (один символ). Реализация без внешних зависимостей — `*` → `.*`, `?` → `.`, экранирование спецсимволов regex. Полный набор юнит-тестов.

## Acceptance criteria

- [ ] `matchesPattern("mesh_peers", "mesh_*")` → true
- [ ] `matchesPattern("read", "mesh_*")` → false
- [ ] `matchesPattern("web_search", "web_*")` → true
- [ ] `matchesPattern("bash", "bash")` → true (точное совпадение)
- [ ] `matchesPattern("foo_bar", "foo?bar")` → true
- [ ] `matchesPattern("foobar", "foo?bar")` → false
- [ ] Спецсимволы regex в pattern (`.`, `+`, `(` и т.д.) экранируются корректно
- [ ] Пустой pattern матчит только пустую строку
- [ ] `*` матчит пустую строку (т.е. `matchesPattern("bash", "*")` → true)

## Blocked by

None — можно начать сразу.
