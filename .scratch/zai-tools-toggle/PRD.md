# /zai-tools Toggle Command

Status: wontfix (implemented)
Category: enhancement

## Problem Statement

Пользователь не может быстро отключить все инструменты zai-tools (web search, web reader, zread, vision) во время сессии. Сейчас единственный способ — прописать `ZAI_ENABLED_MODULES=` и перезапустить pi, либо использовать `/tools` и вручную отключать каждый инструмент по отдельности. Это неудобно, когда нужно временно освободить контекстное окно от описаний инструментов или исключить случайные вызовы zai-tools.

## Solution

Добавить slash-команду `/zai-tools`, которая переключает (toggle) состояние всех инструментов расширения zai-tools: если они активны — деактивирует, если неактивны — активирует. Состояние персистентно сохраняется в сессии и восстанавливается при навигации по session tree.

## User Stories

1. Как пользователь pi, я хочу ввести `/zai-tools`, чтобы мгновенно отключить все инструменты zai-tools и освободить контекстное окно
2. Как пользователь pi, я хочу ввести `/zai-tools` повторно, чтобы вернуть все инструменты zai-tools обратно
3. Как пользователь pi, я хочу видеть уведомление о текущем состоянии (включено/выключено) после ввода `/zai-tools`, чтобы понимать, в каком режиме я работаю
4. Как пользователь pi, я хочу чтобы состояние zai-tools сохранялось при перезагрузке сессии, чтобы не приходилось вводить команду заново
5. Как пользователь pi, я хочу чтобы состояние zai-tools восстанавливалось корректно при навигации по session tree (fork/back), чтобы каждая ветка сессии имела своё состояние
6. Как пользователь pi, я хочу чтобы toggle учитывал только инструменты zai-tools, не затрагивая другие встроенные или сторонние инструменты
7. Как пользователь pi, я хочу чтобы при включении zai-tools возвращались ровно те инструменты, которые были ранее зарегистрированы расширением, даже если количество инструментов изменится между версиями
8. Как пользователь pi, я хочу чтобы команда работала без аргументов — просто toggle, без подкоманд

## Implementation Decisions

- **Toggle state manager** — отдельный модуль, инкапсулирующий состояние вкл/выкл. Хранит состояние через `pi.appendEntry()` с custom entry type `zai-tools-state`. Предоставляет методы `isEnabled()`, `toggle()`, `restore(ctx)`.
- **Slash command** — регистрируется через `pi.registerCommand("zai-tools", { description: "Toggle zai-tools on/off", handler })`. Handler вызывает toggle state manager, затем модифицирует `pi.setActiveTools()`, показывает результат через `ctx.ui.notify()`.
- **Session lifecycle hooks** — подписки на `session_start` и `session_tree`, вызывающие `restore()` из toggle state manager для восстановления состояния из текущей ветки сессии.
- **Идентификация инструментов zai-tools** — расширение запоминает имена всех зарегистрированных инструментов при старте. Toggle добавляет/удаляет эти имена из активного набора, оставляя остальные инструменты без изменений.
- **Формат персистентного состояния** — `{ enabled: boolean }` в custom entry type `zai-tools-state`.
- **Принцип toggle** — команда не принимает аргументов. Каждый вызов инвертирует текущее состояние. При деактивации инструменты zai-tools удаляются из активного набора. При активации — добавляются обратно.
- **Обработка edge case** — если zai-tools были выключены, а пользователь через `/tools` включил некоторые из них вручную, toggle всё равно переключит всё состояние целиком (off → on добавит все, on → off уберёт все).

## Testing Decisions

- **Toggle state manager**: тестируем `isEnabled()`, `toggle()`, `restore()` как чистую логику с моками `pi.appendEntry` и `sessionManager.getBranch()`. Проверяем: начальное состояние = enabled, toggle переключает, restore из branch entries восстанавливает корректное состояние, restore при отсутствии записей = enabled по умолчанию.
- **Slash command handler**: тестируем handler через вызов с моками `pi` и `ctx`. Проверяем: что после вызова handler'а `setActiveTools` вызывается с ожидаемым набором, что `ui.notify` показывает правильный статус, что повторный вызов инвертирует состояние.
- **Session lifecycle hooks**: тестируем что `session_start` и `session_tree` обработчики корректно вызывают restore с нужным контекстом.
- Приоритет тестов — внешнее поведение (какой набор инструментов активен после операций), а не внутреннее устройство (сколько раз вызывался appendEntry и т.д.).
- Аналогичный подход к тестированию: `tests/zai-tools/extension.test.ts`, `tests/zai-tools/config.test.ts`.

## Out of Scope

- Выборочное включение/выключение отдельных модулей zai-tools (search, reader, zread, vision) через аргументы команды — только полный toggle
- Графический UI для toggle (SettingsList) — только slash command с notify
- Глобальная персистентность между разными сессиями — состояние живёт только внутри текущей сессии
- Команда `/zai-tools status` — статус показывается только через notify после toggle

## Further Notes

- Аналогичный паттерн уже реализован в примере `tools.ts` из pi examples — используем его как референс, но упрощаем до чистого toggle без SettingsList UI.
- Команда `/zai-tools` не конфликтует с существующими командами — пространство имён расширения уникально.

## Agent Brief

> *This was generated by AI during triage.*

**Category:** enhancement
**Summary:** Добавить slash-команду `/zai-tools` для мгновенного toggle всех инструментов расширения zai-tools.

**Current behavior:**
Инструменты zai-tools (web search, web reader, zread, vision — 12 штук) регистрируются при загрузке расширения и остаются активными всю сессию. Единственный способ их отключить — env-переменная `ZAI_ENABLED_MODULES` с перезапуском pi, или `/tools` с ручным отключением каждого инструмента.

**Desired behavior:**
Команда `/zai-tools` переключает все инструменты расширения разом — активны → неактивны, неактивны → активны. Состояние персистентно в рамках сессии через `pi.appendEntry()` и восстанавливается при навигации по session tree. После toggle показывается `ui.notify()` с текущим статусом. Остальные (built-in и сторонние) инструменты не затрагиваются.

**Key interfaces:**
- `pi.registerCommand(name, options)` — регистрация `/zai-tools` команды. Handler принимает `args` и `ctx` (ExtensionContext).
- `pi.setActiveTools(names: string[])` — устанавливает полный набор активных инструментов. Toggle должен вычислить новый набор: текущий активный набор минус/плюс имена zai-tools.
- `pi.getActiveTools()` — возвращает массив `ToolInfo` с полем `name`. Нужен для вычисления текущего набора.
- `pi.appendEntry(customType, data)` — персистенция состояния. Custom type `zai-tools-state`, data `{ enabled: boolean }`.
- `ctx.sessionManager.getBranch()` — возвращает entries текущей ветки для восстановления состояния.
- `ctx.ui.notify(message, level)` — показать уведомление пользователю.
- `pi.on("session_start", handler)` и `pi.on("session_tree", handler)` — lifecycle hooks для восстановления.
- Расширение должно запоминать имена зарегистрированных zai-tools инструментов (множество `Set<string>`) при старте, чтобы знать что именно togg'ить.

**Референс:** пример `tools.ts` из pi SDK examples демонстрирует аналогичный паттерн: `appendEntry` для персистенции, `setActiveTools` для применения, `session_start`/`session_tree` для восстановления. Наша реализация проще — чистый toggle без SettingsList UI.

**Acceptance criteria:**
- [ ] Команда `/zai-tools` регистрируется и появляется в списке команд pi
- [ ] Первый вызов `/zai-tools` деактивирует все инструменты zai-tools, оставляя остальные активными
- [ ] Повторный вызов `/zai-tools` активирует все инструменты zai-tools обратно
- [ ] После toggle показывается `ui.notify()` с текстом о текущем состоянии (enabled/disabled)
- [ ] Состояние сохраняется в session entry и восстанавливается при `session_start`
- [ ] Состояние восстанавливается корректно при навигации по session tree (fork/back)
- [ ] При отсутствии сохранённого состояния — инструменты активны (default = enabled)
- [ ] Toggle не затрагивает built-in инструменты (read, bash, edit, write и т.д.) и инструменты других расширений
- [ ] Юнит-тесты покрывают: toggle state manager (toggle/restore), slash command handler (setActiveTools вызывается с правильным набором), session lifecycle hooks

**Out of scope:**
- Выборочный toggle отдельных модулей zai-tools (search, reader, zread, vision)
- Графический UI (SettingsList)
- Глобальная персистентность между сессиями
- Команда `/zai-tools status` или аргументы on/off — только toggle без аргументов
