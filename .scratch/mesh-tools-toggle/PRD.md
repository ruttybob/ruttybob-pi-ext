# /mesh-tools Toggle Command

Status: wontfix (implemented)
Category: enhancement

## Problem Statement

Пользователь (человек-оркестратор или агент) не может динамически отключить mesh-участие в текущей сессии. Если pi-mesh расширение загрузилось с `autoRegister: true`, агент автоматически регистрируется в mesh, получает 5 инструментов (mesh_peers, mesh_send, mesh_reserve, mesh_release, mesh_manage) и начинает получать сообщения от других агентов. Единственный способ выйти из mesh — завершить сессию. Это неудобно, когда нужно временно покинуть mesh для освобождения контекстного окна от описаний инструментов и mesh-сообщений, или когда агент завершил свою координационную работу и больше не нуждается в mesh.

## Solution

Добавить slash-команду `/mesh-tools`, которая переключает (toggle) полное участие агента в mesh. При отключении: агент deregister-ится из реестра, освобождает все reservations, останавливает inbox watcher, инструменты mesh_* деактивируются, в activity feed записывается событие leave. При включении: агент заново регистрируется, watcher запускается, инструменты активируются, в feed записывается событие join. Состояние не персистентно — при каждой новой сессии auto-register отрабатывает как обычно (toggle = ON).

## User Stories

1. Как пользователь pi, я хочу ввести `/mesh-tools`, чтобы мгновенно покинуть mesh и освободить контекстное окно от 5 mesh-инструментов
2. Как пользователь pi, я хочу ввести `/mesh-tools` повторно, чтобы заново присоединиться к mesh
3. Как пользователь pi, я хочу видеть уведомление о текущем состоянии (в mesh / не в mesh) после ввода `/mesh-tools`, чтобы понимать, в каком режиме я работаю
4. Как пользователь pi, я хочу чтобы при покидании mesh освобождались все мои reservations, чтобы другие агенты могли работать с этими файлами
5. Как пользователь pi, я хочу чтобы при покидании mesh мой inbox watcher останавливался, чтобы не тратить ресурсы на обработку сообщений
6. Как пользователь pi, я хочу чтобы при покидании mesh в activity feed записывалось событие leave, чтобы другие агенты видели что я ушёл
7. Как пользователь pi, я хочу чтобы при повторном присоединении мне назначалось новое имя агента (или старое, если свободно), чтобы корректно интегрироваться в mesh
8. Как пользователь pi, я хочу чтобы при повторном присоединении inbox watcher запускался заново, чтобы я мог получать сообщения
9. Как пользователь pi, я хочу чтобы при повторном присоединении в activity feed записывалось событие join, чтобы другие агенты видели что я вернулся
10. Как пользователь pi, я хочу чтобы команда работала без аргументов — просто toggle, без подкоманд on/off
11. Как пользователь pi, я хочу чтобы toggle учитывал только mesh-инструменты, не затрагивая встроенные инструменты (read, bash, edit, write) и инструменты других расширений
12. Как пользователь pi, я хочу чтобы при новой сессии mesh автоматически регистрировался как обычно (toggle = ON по умолчанию), чтобы auto-register поведение не менялось
13. Как пользователь pi, я хочу чтобы мой registration файл удалялся при покидании mesh, чтобы другие агенты не видели «мёртвого» участника
14. Как пользователь pi, я хочу чтобы overlay (/mesh) корректно показывал моё текущее состояние — в mesh или нет
15. Как пользователь pi, я хочу чтобы команда была доступна только в интерактивном режиме (ctx.hasUI), чтобы daemon/worker-сессии не могли случайно покинуть mesh

## Implementation Decisions

- **Slash command** — регистрируется через `pi.registerCommand("mesh-tools", { description, handler })`. Handler вызывает toggle, модифицирует `pi.setActiveTools()`, выполняет register/unregister, показывает результат через `ctx.ui.notify()`.
- **Toggle OFF (leave mesh):**
  1. `reservations.removeAllReservations()` — освободить все reservations
  2. `messaging.stopWatcher()` — остановить inbox watcher
  3. `feed.logEvent(dirs, name, "leave")` — записать событие в feed
  4. `registry.unregister()` — удалить registration файл, установить `state.registered = false`
  5. `pi.setActiveTools(current.filter(name => !MESH_TOOL_NAMES.includes(name)))` — деактивировать 5 mesh-инструментов
  6. Очистить status bar (`ctx.ui.setStatus("mesh", undefined)`)
- **Toggle ON (join mesh):**
  1. `registry.register()` — создать registration файл, установить `state.registered = true`
  2. `messaging.startWatcher()` — запустить inbox watcher
  3. `feed.logEvent(dirs, name, "join")` — записать событие в feed
  4. `pi.setActiveTools([...current, ...MESH_TOOL_NAMES])` — активировать 5 mesh-инструментов
  5. `updateStatusBar()` — обновить status bar
  6. Вызвать `hooks.onRegistered()` если hooks подключены
  7. Инжектировать mesh_context message через `pi.sendMessage()` (аналогично session_start)
- **Имена mesh-инструментов** — константа `MESH_TOOL_NAMES = ["mesh_peers", "mesh_send", "mesh_reserve", "mesh_release", "mesh_manage"]`. Используется для фильтрации в `setActiveTools()`.
- **Без персистентности** — состояние хранится только в `state.registered`. При новой сессии auto-register отрабатывает как обычно, toggle = ON по умолчанию. Никаких session entries или глобальных файлов состояния.
- **Интеграция с overlay** — команда `/mesh` уже проверяет `state.registered` и автоматически регистрирует если не зарегистрирован. Toggle OFF через `/mesh-tools` устанавливает `registered = false`, поэтому следующий вызов `/mesh` сделает re-register + покажет overlay.
- **Интеграция с hooks** — при toggle ON вызывается `hooks.onRegistered()`. При toggle OFF hooks cleanup не требуется (onShutdown не вызывается — это не завершение сессии, а временный выход из mesh).
- **Интеграция с lifecycle events** — tool_call handler уже проверяет `state.registered`, поэтому при toggle OFF резервации и activity tracking автоматически прекращаются. turn_end handler также проверяет `state.registered` перед обработкой inbox.
- **MeshState расширение** — поле `meshToolsEnabled: boolean` не требуется, достаточно `state.registered` как единственного источника истины.

## Testing Decisions

- **Toggle command handler**: тестируем handler через вызов с моками `pi`, `ctx`, `state`, `dirs`. Проверяем: что после toggle OFF вызывается `unregister`, `stopWatcher`, `setActiveTools` без mesh-инструментов, `setStatus("mesh", undefined)`, feed содержит "leave". Что после toggle ON вызывается `register`, `startWatcher`, `setActiveTools` с mesh-инструментами, feed содержит "join".
- **Edge case — double toggle OFF**: если агент уже не в mesh (registered = false), команда должна быть noop или возвращать информативное сообщение.
- **Edge case — toggle OFF без reservations**: освобождение не должно падать, просто 0 reservations.
- **Edge case — toggle ON при занятом имени**: register должен получить уникальное имя (через generateName), не конфликтующее с существующими агентами.
- **Инструментная фильтрация**: проверяем что `setActiveTools` получает корректный набор — все mesh-инструменты удалены при OFF, все добавлены при ON, остальные инструменты не затронуты.
- Приоритет тестов — внешнее поведение (состояние registered, набор активных инструментов, события feed), а не внутреннее устройство (сколько раз вызывался конкретный метод).
- Аналогичный подход к тестированию: `tests/zai-tools/toggle.test.ts`, `extensions/pi-mesh/tests/registry.test.ts`, `extensions/pi-mesh/tests/reservations.test.ts`.

## Out of Scope

- Персистентность состояния toggle между сессиями — каждая сессия начинается с auto-register
- Управление чужими агентами (отключение agent-3 от mesh) — только собственное участие
- Выборочное отключение отдельных mesh-инструментов (только mesh_send, например) — только полный toggle
- Графический UI для toggle — только slash command с notify
- Команда `/mesh-tools status` — статус показывается только через notify после toggle
- Session entry для восстановления при tree navigation — состояние не персистентно

## Further Notes

- Паттерн аналогичен `/zai-tools` toggle, но с важным отличием: zai-tools togg'ит только инструменты, а mesh-tools togg'ит полное участие в mesh (регистрация + reservations + messaging + инструменты).
- При toggle ON агент получает новое имя через `generateName()`. Если старое имя свободно — его можно переиспользовать, но логика `register()` уже это обрабатывает корректно.
- Команда `/mesh` (overlay) и `/mesh-tools` (toggle) не конфликтуют — `/mesh` открывает overlay и ре-регистрирует если нужно, `/mesh-tools` переключает участие.
