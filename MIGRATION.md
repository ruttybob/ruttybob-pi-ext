# MIGRATION: `@mariozechner` → `@earendil-works`

Пакеты pi сменили npm scope. Этот документ — пошаговая инструкция по миграции для любого проекта.

## Маппинг пакетов

| Старый (`@mariozechner`) | Новый (`@earendil-works`) |
|---|---|
| `@mariozechner/pi-coding-agent` | `@earendil-works/pi-coding-agent` |
| `@mariozechner/pi-tui` | `@earendil-works/pi-tui` |
| `@mariozechner/pi-ai` | `@earendil-works/pi-ai` |
| `@mariozechner/pi-agent-core` | `@earendil-works/pi-agent-core` |
| `@mariozechner/pi-ai/oauth` | `@earendil-works/pi-ai/oauth` |

> **Примечание:** Пакеты `@mariozechner/clipboard`, `@mariozechner/jiti` — **внутренние зависимости pi**, не публичный API. Мигрировать их не нужно.

---

## Тип A: Проекты-расширения

Проекты, которые работают как расширения pi (загружаются через extension loader). Зависимости pi — `peerDependencies`, резолвятся глобальным pi runtime.

### Шаг 1. Замена импортов в исходниках

```bash
# Найти-замена во всех .ts и .js файлах (исключая node_modules)
find . -type f \( -name '*.ts' -o -name '*.js' \) \
  -not -path '*/node_modules/*' \
  -exec sed -i '' 's/@mariozechner\/pi-/@earendil-works\/pi-/g' {} +
```

Пример diff:

```diff
- import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
+ import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

- import { truncateToWidth, Text } from "@mariozechner/pi-tui";
+ import { truncateToWidth, Text } from "@earendil-works/pi-tui";

- import { completeSimple, type Model } from "@mariozechner/pi-ai";
+ import { completeSimple, type Model } from "@earendil-works/pi-ai";
```

### Шаг 2. Обновление package.json

Заменить scope в `peerDependencies` / `devDependencies`:

```bash
# macOS (BSD sed)
sed -i '' 's/@mariozechner\//@earendil-works\//g' package.json
```

Если проект — monorepo с вложенными `package.json`:

```bash
find . -name 'package.json' -not -path '*/node_modules/*' \
  -exec sed -i '' 's/@mariozechner\//@earendil-works\//g' {} +
```

### Шаг 3. Обновление тестовой инфраструктуры

#### 3a. Стаб-файлы (если есть)

Переименовать директорию и обновить пути внутри стабов:

```bash
# Переименование директории
mv tests/stubs/@mariozechner tests/stubs/@earendil-works

# Обновить пути внутри стабов (если они импортируют друг друга)
sed -i '' 's/@mariozechner\//@earendil-works\//g' tests/stubs/@earendil-works/*.ts
```

#### 3b. vitest.config.ts — обновить алиасы

```diff
  resolve: {
    alias: {
-     "@mariozechner/pi-coding-agent": resolve(stubDir, "@mariozechner/pi-coding-agent.ts"),
-     "@mariozechner/pi-ai": resolve(stubDir, "@mariozechner/pi-ai.ts"),
-     "@mariozechner/pi-tui": resolve(stubDir, "@mariozechner/pi-tui.ts"),
+     "@earendil-works/pi-coding-agent": resolve(stubDir, "@earendil-works/pi-coding-agent.ts"),
+     "@earendil-works/pi-ai": resolve(stubDir, "@earendil-works/pi-ai.ts"),
+     "@earendil-works/pi-tui": resolve(stubDir, "@earendil-works/pi-tui.ts"),
    },
  },
```

Если стабильные алиасы нужны для **обратной совместимости** (например, в monorepo часть пакетов ещё не мигрирована), можно временно оставить оба:

```ts
alias: {
  "@earendil-works/pi-coding-agent": resolve(stubDir, "@earendil-works/pi-coding-agent.ts"),
  "@mariozechner/pi-coding-agent": resolve(stubDir, "@earendil-works/pi-coding-agent.ts"),
  // ...
},
```

#### 3c. tsconfig.json / tsconfig.test.json — обновить paths

```diff
  "paths": {
-   "@mariozechner/pi-coding-agent": ["./tests/stubs/@mariozechner/pi-coding-agent.ts"],
-   "@mariozechner/pi-ai": ["./tests/stubs/@mariozechner/pi-ai.ts"],
-   "@mariozechner/pi-tui": ["./tests/stubs/@mariozechner/pi-tui.ts"],
+   "@earendil-works/pi-coding-agent": ["./tests/stubs/@earendil-works/pi-coding-agent.ts"],
+   "@earendil-works/pi-ai": ["./tests/stubs/@earendil-works/pi-ai.ts"],
+   "@earendil-works/pi-tui": ["./tests/stubs/@earendil-works/pi-tui.ts"],
  }
```

#### 3d. vi.mock() вызовы в тестах

```diff
- vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
-   const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
+ vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
+   const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
    return { ...actual, completeSimple: vi.fn() };
  });
```

### Шаг 4. Проверка

```bash
# Убедиться что не осталось старых импортов (исключая node_modules и lock-файлы)
grep -r "@mariozechner" --include="*.ts" --include="*.js" --include="*.json" . \
  | grep -v node_modules | grep -v package-lock.json | grep -v .playwright

# Запуск тестов
npm test
```

---

## Тип B: SDK-проекты

Проекты, которые используют pi через npm-зависимости (не расширения). Зависимости pi — `dependencies` / `devDependencies` в `package.json`.

### Шаг 1. Обновление package.json

Заменить все `@mariozechner/pi-*` на `@earendil-works/pi-*` в `dependencies` и `devDependencies`.

```bash
sed -i '' 's/@mariozechner\//@earendil-works\//g' package.json
```

Рекомендуется обновить версию до `^0.74.0` (первая релизная версия под новым scope).

### Шаг 2. Обновление lockfile

```bash
rm package-lock.json   # или: rm pnpm-lock.yaml
npm install            # или: pnpm install
```

> ⚠️ Не обновляйте lockfile без удаления — `npm install` может оставить старые `@mariozechner` записи.

### Шаг 3. Замена импортов в исходниках

Аналогично **Тип A, Шаг 1** — найти-замена `@mariozechner/pi-` → `@earendil-works/pi-`.

### Шаг 4. Проверка

```bash
grep -r "@mariozechner" --include="*.ts" --include="*.js" --include="*.json" . \
  | grep -v node_modules | grep -v package-lock.json

npm test
```

---

## Обратная совместимость

Extension loader pi (начиная с версии, включающей `@earendil-works`) содержит **встроенный алиас** — `VIRTUAL_MODULES` (Bun binary) и `getAliases()` (Node.js/dev) мапят оба scope на одни и те же модули:

```ts
// Из loader.ts — оба scope резолвятся в один и тот же модуль
"@earendil-works/pi-coding-agent": _bundledPiCodingAgent,
"@mariozechner/pi-coding-agent": _bundledPiCodingAgent,  // ← алиас
```

**Что это значит:**

- ✅ Старые расширения с `import ... from "@mariozechner/..."` продолжат работать в pi runtime.
- ⚠️ Пакеты `@mariozechner/*` на npm **заморожены** на версии `0.73.1` и не получают обновлений.
- 📌 Рекомендация: мигрировать при ближайшем удобном случае, чтобы получать обновления и не зависеть от алиаса.

---

## Чеклист

Используйте при миграции каждого проекта:

- [ ] Импорты в `.ts` / `.js` файлах обновлены
- [ ] `package.json` (все уровни в monorepo) обновлён
- [ ] Lockfile пересоздан (`rm` + `install`)
- [ ] Стаб-файлы переименованы и обновлены
- [ ] `vitest.config.ts` алиасы обновлены
- [ ] `tsconfig*.json` paths обновлены
- [ ] `vi.mock()` вызовы в тестах обновлены
- [ ] `grep -r "@mariozechner"` — пустой результат
- [ ] Тесты проходят
