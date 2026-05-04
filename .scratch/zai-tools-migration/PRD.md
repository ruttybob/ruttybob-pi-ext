# Перенос pi-zai-tools в extensions/zai-tools

Status: wontfix (implemented)
Category: enhancement
Priority: normal
Assignee: —

## Контекст

`pi-zai-tools` сейчас живёт как **отдельный git-репозиторий** (форк `ulusoyomer/pi-zai-tools` → `ruttybob/pi-zai-tools`) в поддиректории `pi-zai-tools/` рядом с корнем проекта. Он не входит в `extensions/`, не подключён к тестовой инфраструктуре ruttybob и не является частью единого `package.json`.

Цель — перенести весь исходный код pi-zai-tools в `extensions/zai-tools/` внутри монорепо ruttybob, адаптировать импорты, добавить stub для `@modelcontextprotocol/sdk`, включить тесты в общий vitest-раннер и обновить конфигурацию проекта.

## Что нужно сделать

### 1. Копирование файлов

Скопировать из `pi-zai-tools/` в `extensions/zai-tools/`:

```
pi-zai-tools/extensions/zai-tools.ts  →  extensions/zai-tools/index.ts
pi-zai-tools/src/**                    →  extensions/zai-tools/src/** (сохранить структуру)
```

Структура `extensions/zai-tools/` должна быть:

```
extensions/zai-tools/
├── index.ts                          ← бывший extensions/zai-tools.ts
├── src/
│   ├── client/
│   │   ├── remote-mcp.ts
│   │   └── stdio-mcp.ts
│   ├── config.ts
│   ├── constants.ts
│   ├── services/
│   │   ├── vision.ts
│   │   ├── web-reader.ts
│   │   ├── web-search.ts
│   │   └── zread.ts
│   ├── tools/
│   │   ├── vision-analyze-data-viz-tool.ts
│   │   ├── vision-analyze-image-tool.ts
│   │   ├── vision-analyze-video-tool.ts
│   │   ├── vision-diagnose-error-tool.ts
│   │   ├── vision-extract-text-tool.ts
│   │   ├── vision-ui-diff-check-tool.ts
│   │   ├── vision-ui-to-artifact-tool.ts
│   │   ├── vision-understand-diagram-tool.ts
│   │   ├── web-reader-tool.ts
│   │   ├── web-search-tool.ts
│   │   ├── zread-get-repo-structure-tool.ts
│   │   ├── zread-read-file-tool.ts
│   │   └── zread-search-doc-tool.ts
│   ├── types.ts
│   └── utils/
│       ├── cache.ts
│       ├── errors.ts
│       ├── formatting.ts
│       ├── json-parse.ts
│       ├── logger.ts
│       ├── rate-limit.ts
│       ├── retry.ts
│       ├── truncation.ts
│       └── validation.ts
```

### 2. Обновить импорт в index.ts

Бывший `extensions/zai-tools.ts` становится `index.ts`. Все относительные импорты `'../src/...'` меняются на `'./src/...'`.

### 3. Добавить зависимость в корневой package.json

```json
"dependencies": {
  "@mariozechner/pi-tui": "*",
  "@sinclair/typebox": "^0.34.49",
  "@modelcontextprotocol/sdk": "^1.27.1"
}
```

`zod` не добавлять — в коде pi-zai-tools он не используется (артефакт package.json).

### 4. Добавить stub для @modelcontextprotocol/sdk

Создать `tests/stubs/@modelcontextprotocol/sdk.ts` (и поддиректории `client/index.ts`, `client/streamableHttp.ts`, `client/stdio.js`) с минимальными заглушками, достаточными для прохождения unit-тестов. Основные типы, которые нужно застабить:

- `Client` — класс с методами `connect()` и `callTool()`
- `StreamableHTTPClientTransport` — класс с методом `close()`
- `StdioClientTransport` — класс с методом `close()`

Зарегистрировать алиас в `vitest.config.ts` и `tsconfig.test.json`.

### 5. Перенести тесты

Скопировать тесты из `pi-zai-tools/test/` в `tests/zai-tools/` (следуя конвенции проекта — все тесты в `tests/`). Обновить импорты в тестах:

```
'../extensions/zai-tools.ts'  →  '../../extensions/zai-tools/index.ts'
'../src/...'                  →  '../../extensions/zai-tools/src/...'
```

Исключения:
- `test/live-zai.integration.test.ts` — live-тесты против реального API, перенести как `tests/zai-tools/live-zai.integration.test.ts`, но в vitest.config.ts пометить как `test.only`/ отдельный suite, чтобы не ломать обычный `npm test`. Либо исключить через `exclude`.

### 6. Обновить tsconfig.test.json

Добавить `"extensions/zai-tools/**/*.ts"` в `include`, если нужно.

### 7. Обновить vitest.config.ts

Добавить алиас:
```typescript
"@modelcontextprotocol/sdk": resolve(stubDir, "@modelcontextprotocol/sdk.ts"),
```

### 8. Верификация

- `npm test` — все тесты проходят (включая перенесённые)
- `npx tsc --noEmit` — нет ошибок типов
- Pi подхватывает расширение при запуске (оно уже в `./extensions`)

### 9. Удалить pi-zai-tools/

После успешной верификации — удалить директорию `pi-zai-tools/` (включая `.git`). Она больше не нужна.

## Что НЕ нужно делать

- Не менять интерфейс инструментов — сигнатуры, имена, описения остаются как есть
- Не реэкспортировать отдельный npm-пакет — расширение живёт только в монорепо
- Не удалять README.md из pi-zai-tools — сохранить как `extensions/zai-tools/README.md` для справки

## Риски и подводные камни

1. **Stub для MCP SDK может быть сложным.** Код активно использует `new Client()`, `new StreamableHTTPClientTransport()`, `new StdioClientTransport()`. Нужно внимательно посмотреть тесты — возможно, проще замокать на уровне сервисов (как уже сделано в `extension.test.ts`).

2. **`zod` в зависимостях pi-zai-tools.** Он нигде не импортируется в коде. Не добавлять в ruttybob.

3. **Live-тесты.** `live-zai.integration.test.ts` требует `ZAI_API_KEY`. Нужно решить — перенести с пропуском без ключа, или вообще не переносить (оставить в отдельном репо).

## Ссылки

- Исходный репо: `pi-zai-tools/` (форк `ulusoyomer/pi-zai-tools`)
- Исследование архитектуры: `.explore/pi-zai-tools-architecture.md`

## Comments
