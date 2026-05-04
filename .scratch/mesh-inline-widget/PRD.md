Status: wontfix (implemented)
Category: bug

## Problem Statement

Feed и Chat overlay'и в pi-mesh рендерятся посреди экрана (anchor: "center"), а не внизу, где пользователь ожидает увидеть интерактивный UI. Использование режима `overlay: true` в `ctx.ui.custom()` приводит к непредсказуемому позиционированию. Пользователь видит рамку в середине чата, что ломает визуальный поток и противоречит поведению других расширений (например, permissions prompt).

## Solution

Переключить FeedWidget и ChatWidget с режима overlay (`overlay: true`) на inline widget — вызывать `ctx.ui.custom()` **без** второго аргумента `overlayOptions`. Pi-tui автоматически разместит inline widget внизу экрана, как это делает permissions prompt. Рамка и стилизация остаются за widget'ом (как сейчас), но позиционирование делегируется pi-tui.

Параллельно обновить стилистику рамки: перейти с одинарных box-drawing chars (`┌┐└┘│─`) на скруглённые (`╭╮╰╯│─`), соответствующие стилю permissions prompt.

## User Stories

1. Как пользователь pi, я хочу чтобы `/mesh-feed` открывал activity feed внизу экрана, а не посередине, чтобы не терять контекст текущего чата
2. Как пользователь pi, я хочу чтобы `/mesh-chat` открывал чат внизу экрана, чтобы визуально это выглядело как естественное продолжение диалога
3. Как пользователь pi, я хочу чтобы рамка feed/chat выглядела одинаково с permissions prompt (скруглённые углы), чтобы визуальный стиль расширений был консистентным
4. Как пользователь pi, я хочу чтобы скролл (↑↓, PgUp/PgDn) работал в feed widget как раньше, чтобы не терять функциональность
5. Как пользователь pi, я хочу чтобы ввод текста, отправка, @mention completion работали в chat widget как раньше, чтобы не терять функциональность
6. Как пользователь pi, я хочу чтобы Escape закрывал feed/chat widget как раньше
7. Как пользователь pi, я хочу чтобы unregistered guard в chat widget продолжал работать — показывал hint "Not registered" вместо поля ввода
8. Как разработчик, я хочу чтобы feed и chat widgets не зависели от overlay-специфичных опций (anchor, maxHeight, margin), чтобы не бороться с позиционированием
9. Как разработчик, я хочу чтобы `overlay-helpers.ts` использовал скруглённые box-drawing chars, чтобы рамка была визуально консистентна с permissions prompt
10. Как разработчик, я хочу чтобы EventBus сигналы (`custom-ui:shown`/`custom-ui:hidden`) продолжали эмититься при открытии/закрытии widget'ов
11. Как разработчик, я хочу чтобы widget сам контролировал высоту контента через обрезку в `render()`, а не через `maxHeight` overlayOptions
12. Как разработчик, я хочу чтобы тесты не ломались — публичный интерфейс `render(width)` и `handleInput(data)` остаётся тем же

## Implementation Decisions

### Модули

1. **`overlay-helpers.ts`** (модификация) — заменить одинарные box-drawing chars (`┌┐└┘`) на скруглённые (`╭╮╰╯`). Интерфейс функций не меняется: `topBorder()`, `bottomBorder()`, `contentLine()`.

2. **`feed-overlay.ts`** → переименовать в **`feed-widget.ts`** (или оставить имя) — убрать из комментариев упоминания overlay/anchor. Добавить `MAX_VISIBLE_LINES` константу для ограничения высоты контента в `render()` — widget сам обрезает контент до разумного лимита (≈10–12 строк), чтобы не занимать весь экран. Скролл по-прежнему работает через `scrollOffset`.

3. **`chat-overlay.ts`** → переименовать в **`chat-widget.ts`** (или оставить имя) — аналогично, добавить `MAX_VISIBLE_LINES`. Поле ввода и разделитель всегда видимы (не скроллятся). Скролл применяется только к истории сообщений.

4. **`index.ts`** (модификация) — в хендлерах `/mesh-feed` и `/mesh-chat`:
   - Убрать второй аргумент `ctx.ui.custom()` (объект с `overlay: true` и `overlayOptions`)
   - Вызывать `ctx.ui.custom()` без options — pi-tui разместит widget inline внизу
   - EventBus сигналы (`custom-ui:shown`/`hidden`) оставить — они не связаны с overlay mode

### Технические уточнения

- Inline widget в pi-tui рендерится **внизу экрана**, над status bar. Это подтверждено поведением permissions prompt в yapi.
- Widget `render(width)` возвращает массив строк. Pi-tui измеряет высоту по количеству строк и выделяет место. Поэтому widget должен ограничивать высоту через `MAX_VISIBLE_LINES` — иначе при 30+ сообщениях он займёт весь экран.
- `Component` интерфейс (`render(width)`, `handleInput(data)`) остаётся без изменений — тесты не ломаются.
- Функция `invalidate()` (метод `Component`) — не нужна, но если pi-tui её вызывает, добавим пустую реализацию.

### Стилистика рамки

Permissions prompt использует:
- Верхняя граница: `╭${"─".repeat(innerW)}╮`
- Нижняя граница: `╰${"─".repeat(innerW)}╯`
- Строки: `│ content padded │` (прямой `│`, не скруглённый)
- Цвет рамки: `theme.fg("error", ...)` (красный)

Feed/Chat widget будут использовать:
- Верхняя граница: `╭─ Title ───╮` (с заголовком, как сейчас, но скруглённая)
- Нижняя граница: `╰─ hints ──╯` (с hints, но скруглённая)
- Строки: `│ content │` (без изменений)
- Цвет рамки: `theme.fg("warning", ...)` (жёлтый — отличается от permissions)

### Переименование файлов

Переименование `feed-overlay.ts` → `feed-widget.ts` и `chat-overlay.ts` → `chat-widget.ts` опционально. Если переименовываем, нужно обновить:
- `index.ts` (dynamic imports)
- Тестовые файлы (imports)

Если не переименовываем — просто обновить комментарии. Решение за разработчиком.

## Testing Decisions

### Что constitutes хороший тест

Тесты проверяют **внешнее поведение** через публичный интерфейс: `render(width)` возвращает строки, `handleInput(data)` обрабатывает клавиши. Тесты НЕ проверяют внутреннее состояние (scrollOffset, chatInput). Проверяем observable эффекты: содержимое строк, вызов done(), мутации state.

### Модули для тестирования

1. **`overlay-helpers.ts`** — тесты рамки (скруглённые chars, padding, заголовок, hints). Существующие тесты нужно обновить: они проверяют `┌┐└┘`, а должно быть `╭╮╰╯`.

2. **`feed-widget`** — существующие тесты в `feed-overlay.test.ts` должны проходить почти без изменений (рендер рамки, скролл, escape). Единственное изменение: `┌` → `╭` в проверках border chars.

3. **`chat-widget`** — существующие тесты в `chat-overlay.test.ts` должны проходить почти без изменений. Аналогично, обновить проверки border chars.

### Prior art

- `tests/feed-overlay.test.ts` — паттерн: `makeState()`, `makeDirs()`, `makeTui()`, `makeTheme()`, `invalidateAgentsCache()` в `beforeEach`
- `tests/chat-overlay.test.ts` — тот же паттерн + `registerAgent()` для настройки registry

### Стратегия

1. Обновить `overlay-helpers.ts` (chars)
2. Запустить существующие тесты — увидеть RED ( chars не совпадают)
3. Обновить test assertions на новые chars — увидеть GREEN
4. Добавить тест на `MAX_VISIBLE_LINES` (контент обрезается при превышении лимита)
5. Модифицировать `index.ts` (убрать overlay options)
6. Запустить все тесты — увидеть GREEN

## Out of Scope

- Изменение поведения `/mesh-agents` (notify) — он не использует overlay
- Изменение `overlay-helpers.ts` API — только внутренние chars
- Переименование файлов (опционально, не блокирует)
- Добавление `invalidate()` если pi-tui не требует
- Изменение цветов рамки (warning vs error)
- Изменение scroll/input логики — только обрезка контента для высоты

## Further Notes

### Почему не оставить overlay с другим anchor?

Overlay-режим в pi-tui использует абсолютное позиционирование поверх контента. Это создаёт проблемы:
- `center` — рендерит посреди экрана
- `bottom-center` — работал в старом `/mesh`, но widget "плавает" поверх чата
- Inline widget — встроен в layout, pi-tui сам решает где разместить, опыт permissions prompt подтверждает что это работает надёжно

### MAX_VISIBLE_LINES

Рекомендуемое значение: **12 строк** для feed, **10 строк истории + 3 строки UI** для chat (разделитель + target + input). Widget сам режет контент в `render()`, скролл обеспечивает доступ к остальному.

---

## Agent Brief

> *This was generated by AI during triage.*

**Category:** bug
**Summary:** Feed и Chat widget'ы рендерятся посреди экрана вместо нижней части

**Current behavior:**
`/mesh-feed` и `/mesh-chat` вызывают `ctx.ui.custom()` с `{ overlay: true, overlayOptions: { anchor: "center", ... } }`. Это заставляет pi-tui рендерить overlay в центре экрана. Пользователь видит рамку посреди чата, что ломает визуальный поток.

**Desired behavior:**
Widget'ы вызывают `ctx.ui.custom()` **без** второго аргумента (без overlay options). Pi-tui размещает inline widget внизу экрана — точно так же как permissions prompt. Рамка обновляется на скруглённые box-drawing chars (`╭╮╰╯`) для визуальной консистентности. Widget сам ограничивает высоту контента через константу `MAX_VISIBLE_LINES`, чтобы не занять весь экран.

**Key interfaces:**
- `Component` interface (`render(width) → string[]`, `handleInput(data)`) — не меняется
- `overlay-helpers.ts` — функции `topBorder()`, `bottomBorder()`, `contentLine()` — сигнатуры те же, box-drawing chars обновляются
- `ctx.ui.custom(factory)` — вызывается без второго аргумента (было: с `{ overlay: true, overlayOptions: {...} }`)
- `MAX_VISIBLE_LINES` — новая константа в feed/chat widget'ах, ограничивает количество строк контента в `render()`

**Prior art:**
- Permissions prompt в yapi (`extensions/permissions/prompt.ts`) — вызывает `ctx.ui.custom()` без overlay options, рендерит inline внизу экрана с рамкой `╭─╮`/`╰─╯`/`│`

**Acceptance criteria:**
- [ ] `ctx.ui.custom()` для `/mesh-feed` и `/mesh-chat` вызывается без второго аргумента
- [ ] Widget рендерится внизу экрана (не в центре) при открытии через команды `/mesh-feed` и `/mesh-chat`
- [ ] Рамка использует скруглённые chars: `╭` `╮` `╰` `╯` (не `┌` `┐` `└` `┘`)
- [ ] Feed widget обрезает контент до `MAX_VISIBLE_LINES` (≈12), скролл обеспечивает доступ к остальному
- [ ] Chat widget обрезает историю сообщений до `MAX_VISIBLE_LINES` (≈10), поле ввода и разделитель всегда видимы
- [ ] Скролл (↑↓, PgUp/PgDn) работает в обоих widget'ах
- [ ] Chat: ввод текста, Backspace, Enter, @mention completion, Escape — работают
- [ ] Unregistered guard в chat: показывает "Not registered" вместо поля ввода
- [ ] EventBus сигналы `custom-ui:shown` / `custom-ui:hidden` эмитятся при открытии/закрытии
- [ ] Все существующие тесты проходят после обновления assertions на новые border chars
- [ ] Добавлен тест на обрезку контента при превышении `MAX_VISIBLE_LINES` для feed
- [ ] Добавлен тест на обрезку истории при превышении `MAX_VISIBLE_LINES` для chat

**Out of scope:**
- `/mesh-agents` (notify) — не использует overlay
- Переименование файлов (feed-overlay → feed-widget и т.д.) — опционально, не блокирует
- Изменение цветов рамки (warning жёлтый — остаётся)
- Добавление `invalidate()` метода если pi-tui не вызывает его
