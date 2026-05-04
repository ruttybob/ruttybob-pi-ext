Status: ready-for-agent
Category: enhancement

## Problem Statement

Текущий `/mesh` overlay — это единая панель с тремя вкладками (Agents, Feed, Chat), которая:
1. **Плохо рендерится** — при resize overlay ломается и мешает работе
2. **Смешивает разные UX-паттерны** — Agents (просмотр), Feed (просмотр), Chat (интерактив) в одном компоненте
3. **Дублирует mesh_peers** — вкладка Agents не даёт ничего сверх tool-вызова
4. **Не координируется с другими расширениями** — overlay может конфликтовать с другими custom UI

## Solution

Разделить монолитный overlay на три независимых интерфейса:

1. **`/mesh-agents`** — разовый `ctx.ui.notify()` со списком агентов (по аналогии с `/todos` из rpiv-todo)
2. **`/mesh-feed`** — overlay 50% высоты для activity feed, без вкладок
3. **`/mesh-chat`** — overlay 50% высоты для интерактивного чата с полем ввода

Убрать команду `/mesh` и весь `MeshOverlay` (overlay.ts). Добавить координацию через eventbus (`custom-ui:shown`/`custom-ui:hidden`) — только один overlay открыт за раз, расширения могут suspend/resume свои виджеты.

## User Stories

### /mesh-agents (notify)

1. Как пользователь mesh, я хочу выполнить `/mesh-agents` и увидеть список всех агентов в уведомлении, чтобы быстро узнать кто онлайн
2. Как пользователь mesh, я хочу видеть в уведомлении имя, модель, branch и статус каждого агента
3. Как пользователь mesh, я хочу видеть reservations каждого агента в уведомлении
4. Как пользователь mesh, я хочу видеть свой собственный агент в списке с пометкой (you)

### /mesh-feed (overlay)

5. Как пользователь mesh, я хочу выполнить `/mesh-feed` и увидеть overlay с activity feed, чтобы следить за действиями агентов
6. Как пользователь mesh, я хочу чтобы feed overlay занимал 50% высоты терминала, чтобы видеть контекст сессии
7. Как пользователь mesh, я хочу скроллить feed стрелками Up/Down
8. Как пользователь mesh, я хочу использовать PageUp/PageDown для быстрой навигации по feed
9. Как пользователь mesh, я хочу видеть hint-строку с доступными клавишами внизу overlay
10. Как пользователь mesh, я хочу закрыть feed по Escape
11. Как пользователь mesh, я хочу чтобы overlay имел рамку (box-drawing chars) для визуального отделения от контента

### /mesh-chat (overlay)

12. Как пользователь mesh, я хочу выполнить `/mesh-chat` и увидеть overlay с историей чата и полем ввода
13. Как пользователь mesh, я хочу чтобы chat overlay занимал 50% высоты терминала
14. Как пользователь mesh, я хочу печатать сообщения в поле ввода внутри overlay
15. Как пользователь mesh, я хочу отправлять сообщения по Enter
16. Как пользователь mesh, я хочу отправлять DM через @agent-name в начале сообщения
17. Как пользователь mesh, я хочу использовать Tab для автодополнения @mention
18. Как пользователь mesh, я хочу отправлять broadcast через @all (по умолчанию)
19. Как пользователь mesh, я хочу скроллить историю чата Up/Down
20. Как пользователь mesh, я хочу видеть hint-строку с доступными клавишами
21. Как пользователь mesh, я хочу закрыть чат по Escape
22. Как пользователь mesh, я хочу чтобы overlay имел рамку

### Координация overlay

23. Как пользователь mesh, я хочу чтобы при открытии feed overlay закрывался chat overlay (и наоборот) — только один overlay за раз
24. Как пользователь, я хочу чтобы при открытии mesh overlay другие расширения (todo и т.п.) suspend-или свои виджеты
25. Как пользователь, я хочу чтобы при закрытии mesh overlay другие расширения восстанавливали свои виджеты

### Очистка

26. Как пользователь, я хочу чтобы команда `/mesh` была удалена (заменена на `/mesh-feed`, `/mesh-chat`, `/mesh-agents`)
27. Как пользователь, я хочу чтобы `/mesh-tools` продолжал работать как toggle регистрации
28. Как пользователь, я хочу чтобы `/mesh-clear` продолжал работать
29. Как пользователь mesh, я хочу чтобы `setStatus` в футере продолжал показывать статус (agent-name, peers count, unread)

### Guard

30. Как пользователь mesh, я хочу видеть подсказку «Not registered — use /mesh-tools to join» в чате, если я не зарегистрирован
31. Как пользователь mesh, я хочу видеть уведомление «Not registered in mesh» при попытке `/mesh-agents` без регистрации
32. Как пользователь mesh, я хочу видеть уведомление «Not registered in mesh» при попытке `/mesh-feed` без регистрации

## Implementation Decisions

### Архитектура: три модуля вместо одного

Текущий `overlay.ts` (478 строк, класс `MeshOverlay`) — монолит с тремя рендерерами, общим состоянием и handleInput. Заменяется на:

- **`feed-overlay.ts`** — компонент FeedOverlay (Component): render() + handleInput(), только feed
- **`chat-overlay.ts`** — компонент ChatOverlay (Component): render() + handleInput(), чат с полем ввода
- **Команда `/mesh-agents`** — inline handler в index.ts, вызывает `ctx.ui.notify()`

Рендеринг рамки (box-drawing chars, hints-строка) вынести в общий helper `overlay-border.ts` — оба overlay используют одну логику отрисовки верхней/нижней рамки.

### EventBus координация

Паттерн из `look-system-prompt` и `rpiv-todo`:

- При открытии overlay: `pi.events.emit("custom-ui:shown", { timestamp })`
- При закрытии overlay: `pi.events.emit("custom-ui:hidden", { timestamp })`
- Pi-mesh слушает свои же события чтобы не открыть второй overlay поверх первого
- Другие расширения слушают эти события для suspend/resume

### Overlay options

```
{
  overlay: true,
  overlayOptions: {
    anchor: "center",
    width: "100%",
    maxHeight: "50%",
    margin: 0,
  }
}
```

Центрирование (anchor: "center") вместо текущего "bottom-center" — avoids resize issues.

### Удаляемые модули

- `overlay.ts` — полностью удаляется, заменяется на `feed-overlay.ts` и `chat-overlay.ts`
- `overlay-border-scroll.test.ts` — удаляется (тесты удалённого overlay)
- `overlay-no-register.test.ts` — удаляется

### Новые модули

- `feed-overlay.ts` — FeedOverlay component (render + handleInput)
- `chat-overlay.ts` — ChatOverlay component (render + handleInput)
- `overlay-helpers.ts` — общая логика рамки (topBorder, bottomBorder, contentLine)
- `tests/feed-overlay.test.ts` — тесты feed overlay
- `tests/chat-overlay.test.ts` — тесты chat overlay

### Изменяемые модули

- `index.ts` — убрать регистрацию `/mesh`, добавить `/mesh-feed`, `/mesh-chat`, `/mesh-agents`, добавить eventbus listeners для custom-ui:shown/hidden

### Сохраняемые модули без изменений

- `feed.ts` — источник данных для feed overlay
- `messaging.ts` — источник данных для chat overlay
- `registry.ts` — данные агентов для /mesh-agents notify
- `toggle.ts` — не меняется
- `reservations.ts` — не меняется
- `tracking.ts` — не меняется
- `types.ts` — не меняется
- `config.ts` — не меняется

## Testing Decisions

### Что тестируем

1. **`feed-overlay.test.ts`** — рендер feed content, scroll (up/down/pageUp/pageDown), escape closes, border rendering, width constraints
2. **`chat-overlay.test.ts`** — рендер chat history, input field, отправка сообщений, @mention completion, escape closes, unregistered guard, border rendering

### Что НЕ тестируем

- `overlay-helpers.ts` — тривиальные функции отрисовки рамки, покрываются интеграционно через feed/chat тесты
- Команды в `index.ts` — тонкий слой маршрутизации, логика в компонентах

### Prior art

- Текущий `overlay-border-scroll.test.ts` — паттерн `makeState()`, `makeTui()`, `makeTheme()`, `makeOverlay()` + `invalidateAgentsCache()` в beforeEach
- `overlay-no-register.test.ts` — проверка guard на `state.registered`

### Принцип

Тестируем внешнее поведение (render возвращает ожидаемые строки, handleInput меняет состояние) без проверки внутренней реализации. Helper'ы для тестов (makeState, makeTui, makeTheme) вынести в `tests/test-helpers.ts` для переиспользования.

## Out of Scope

- Изменение `setStatus` в футере — оставляем как есть
- Изменение формата feed events — оставляем как есть
- Widget над редактором для агентов — оставляем текущий status bar
- Команда `/mesh-clear` — без изменений
- Изменения в registry, messaging, feed, toggle, reservations, tracking модулях

## Further Notes

- Референс для eventbus паттерна: `~/work/yapi/extensions/look-system-prompt/index.ts` (emit custom-ui:shown/hidden)
- Референс для widget suspend/resume: `~/work/yapi/extensions/todo/todo-overlay.ts` (suspend/resumeDepth)
- Референс для overlay компонента: `~/work/yapi/extensions/look-system-prompt/index.ts` (SystemPromptViewer — рамка, табы, скролл)
- Предыдущий PRD mesh-overlay-v2 (border + block scroll + page nav) — **суперседится** данным PRD

---

## Agent Brief

> *This was generated by AI during triage.*

**Category:** enhancement
**Summary:** Разделить монолитный 3-tab mesh overlay на три независимых интерфейса: notify (agents), overlay (feed), overlay (chat)

**Current behavior:**
Команда `/mesh` открывает единый overlay (`MeshOverlay`) с тремя вкладками — Agents, Feed, Chat. Overlay рендерится как floating panel с `anchor: "bottom-center"`, что ломается при resize. Вкладка Agents дублирует `mesh_peers` tool. Нет координации с другими расширениями — overlay может конфликтовать.

**Desired behavior:**
Три независимых команды:
- `/mesh-agents` — разовый `ctx.ui.notify()` со списком агентов (по аналогии с `/todos` из rpiv-todo)
- `/mesh-feed` — overlay 50% высоты, anchor: "center", показывает activity feed, scrollable, border
- `/mesh-chat` — overlay 50% высоты, anchor: "center", чат с полем ввода, @mention completion, border

Команда `/mesh` удаляется. `ctx.ui.setStatus()` в футере сохраняется. Координация через eventbus: `pi.events.emit("custom-ui:shown"/"custom-ui:hidden")` — только один overlay за раз, другие расширения могут suspend/resume.

**Key interfaces:**
- `MeshOverlay` class (текущий монолит) — удаляется целиком, заменяется на два отдельных Component-класса
- `Component` interface from `@mariozechner/pi-tui` — `render(width): string[]` + `handleInput(data: string): void`
- `ctx.ui.custom()` с `{ overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "50%" } }`
- `ctx.ui.notify(message, "info")` — для /mesh-agents
- `pi.events.emit("custom-ui:shown"/"custom-ui:hidden")` — eventbus координация
- `feed.readEvents(dirs, feedRetention)` — источник данных для feed overlay
- `messaging.broadcastMessage()` / `messaging.sendMessage()` — отправка в чате
- `registry.getAllAgents(state, dirs)` — список агентов для /mesh-agents
- `invalidateAgentsCache()` — должен вызываться в beforeEach тестов

**Acceptance criteria:**
- [ ] `/mesh-agents` показывает notify со списком всех агентов (имя, модель, branch, статус, reservations)
- [ ] `/mesh-feed` открывает overlay 50% высоты с activity feed, scrollable (up/down/pgup/pgdn), escape закрывает
- [ ] `/mesh-chat` открывает overlay 50% высоты с чатом, поле ввода, Enter отправляет, Tab @mention completion, escape закрывает
- [ ] `/mesh` команда удалена, `/mesh-tools` и `/mesh-clear` работают без изменений
- [ ] `setStatus` в футере продолжает работать без изменений
- [ ] Только один overlay (feed или chat) открыт одновременно
- [ ] При открытии overlay emit `custom-ui:shown`, при закрытии `custom-ui:hidden`
- [ ] Guard: `/mesh-agents`, `/mesh-feed` показывают "Not registered" при отсутствии регистрации
- [ ] Chat overlay показывает hint "Not registered — use /mesh-tools to join" когда `state.registered === false`
- [ ] Overlay имеет рамку из box-drawing chars (общий helper)
- [ ] Feed и chat overlay hint-строки показывают доступные клавиши
- [ ] Все новые тесты проходят, существующие тесты не сломаны (кроме удалённых overlay-тестов)
- [ ] Удалены: `overlay.ts`, `overlay-border-scroll.test.ts`, `overlay-no-register.test.ts`
- [ ] Новые модули: `feed-overlay.ts`, `chat-overlay.ts`, `overlay-helpers.ts`, тесты для feed и chat

**Out of scope:**
- Изменение формата feed events
- Widget над редактором для агентов (текущий status bar достаточен)
- Изменения в registry, messaging, feed, toggle, reservations, tracking модулях
- Изменение `/mesh-clear`
- Изменение `setStatus` в футере
