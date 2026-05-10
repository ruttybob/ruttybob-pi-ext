---
description: Setup .plans directory structure and gitignore for plan workflows
---

Инициализация структуры директорий для планов.

## Workflow

1. Добавь в `.gitignore` строки `.plans/*` и `.issues/` (если ещё нет)
2. Создай директории:
   - `.plans/`
   - `.plans/.detailed/`
   - `.plans/_done/`
   - `.issues/`
3. Убедись, что структура создана — проверь `ls -R .plans/` и `ls .issues/`

## Правила

- Не перезаписывать существующий `.gitignore` — добавить строку, если её нет
- `mkdir -p` для создания директорий
- Если `.plans/*` или `.issues/` уже есть в `.gitignore` — пропустить соответствующий шаг
