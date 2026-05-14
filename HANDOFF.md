# HANDOFF: Перенос look-system-prompt из yapi в ruttybob

## Контекст

Расширение `look-system-prompt` живёт в `~/work/yapi/extensions/look-system-prompt/index.ts` (один файл, 1048 строк). Нужно перенести его в `ruttybob/extensions/look-system-prompt/` с адаптацией под тестовую инфраструктуру проекта.

Исходный файл: `~/work/yapi/extensions/look-system-prompt/index.ts`

## Что уже сделано

Расширение недавно обновлено — добавлены:
- Таб **Injections** — обнаруживает инъекции от других расширений в системный промпт
- Слушатель `system-prompt:injection` — кооперативные расширения (pi-self-memory) эмитят отчёт
- Diff-based fallback — сравнение `ctx.getSystemPrompt()` с `before_agent_start` базой
- Функция `computeDiffInjections()` — детектирует unattributed injections

## План

### 1. Копирование

```
~/work/yapi/extensions/look-system-prompt/index.ts
→ ~/pets/ruttybob/extensions/look-system-prompt/index.ts
```

Один файл, без изменений в импортах — они уже используют `@earendil-works/pi-coding-agent` и `@earendil-works/pi-tui`, которые резолвятся через `vitest.config.ts` алиасы.

### 2. Обновить stubs

Расширение использует API, которых ещё нет в stub'ах:

**`tests/stubs/@earendil-works/pi-tui.ts`** — добавить:
- `MarkdownTheme` (type — объект с методами: heading, bold, italic, code, codeBlock, link, quote, etc.)
- Проверить что `Markdown.render(width: number): string[]` уже есть ✓
- Проверить что `visibleWidth`, `truncateToWidth`, `matchesKey`, `Key` уже есть ✓

**`tests/stubs/@earendil-works/pi-coding-agent.ts`** — проверить:
- `ExtensionAPI.events` — уже есть тип `{ on, emit }` ✓
- `ExtensionCommandContext.getSystemPrompt()` — уже есть опциональный ✓
- `ExtensionCommandContext.getContextUsage()` — НЕТ, нужно добавить в `ExtensionContext`

### 3. Синхронизировать `tsconfig.test.json`

Алиасы уже покрывают нужные пакеты:
```json
"@earendil-works/pi-coding-agent": ["./tests/stubs/@earendil-works/pi-coding-agent.ts"],
"@earendil-works/pi-tui": ["./tests/stubs/@earendil-works/pi-tui.ts"]
```

Проверить что `extensions/**/*.ts` в `include` — уже есть ✓

### 4. Написать тесты

`tests/look-system-prompt/index.test.ts` — покрыть чистые функции:

- [ ] `getTabs()` — табы фильтруются по флагам modes/compass/injections
- [ ] `estimateTotalTokens()` — разбивка по компонентам (sys, mode, codemap, tools)
- [ ] `computeDiffInjections()` — diff между base и cached, исключение reported
- [ ] `buildModeInjection()` — генерация текста инъекции для mode

Не покрывать (TUI-рендеринг, component):
- `SystemPromptViewer` class — требует полный TUI mock
- `render()`, `handleInput()` — интеграционные тесты

### 5. Проверить

```bash
npm test                    # все тесты проходят
npx tsc --noEmit -p tsconfig.test.json  # типы OK
```

## Зависимости от других расширений

Расширение подписывается на события от:
- `modes:active` — от расширения modes (в yapi, не в ruttybob)
- `compass:injection-state`, `compass:codemap-ready` — от pi-compass (в yapi, не в ruttybob)
- `system-prompt:injection` — от pi-self-memory (в pets, нужно адаптировать)

При отсутствии этих расширений — табы Mode Preview и Codemap скрываются, Injections показывает только diff-based. Это корректное поведение.

## Структура после переноса

```
extensions/look-system-prompt/
└── index.ts              # 1048 строк — весь код расширения

tests/look-system-prompt/
└── index.test.ts         # тесты чистых функций

tests/stubs/
├── @earendil-works/
│   ├── pi-coding-agent.ts   # +getContextUsage в ExtensionContext
│   └── pi-tui.ts            # +MarkdownTheme type
```
