# pi-review

Расширение для [pi coding agent](https://github.com/earendilworks/pi-coding-agent) — ревью текущей работы в новой ветке с контекстом разговора и git diff.

## Возможности

- 🔄 **Ревью в новой ветке** — `/review` создаёт ветку с контекстом текущей сессии
- 📝 **Git diff** — автоматически прикрепляет незакоммиченные изменения к контексту ревью
- 🎯 **Кастомизируемый промпт** — шаблон через файл, settings.json или fallback
- 🔙 **Возврат** — `/review-back` возвращает к ревьюемой ветке с результатами ревью
- ⚙️ **Настройка модели** — отдельная модель и thinking level для ревью

## Установка

Добавьте расширение в `settings.json` (пакеты):

```json
{
  "packages": [{
    "source": "../../path/to/ruttybob",
    "extensions": ["+extensions/pi-review/index.ts"]
  }]
}
```

## Команды

### `/review [focus text]`

Создаёт новую ветку с контекстом текущей сессии (разговор + git diff) и отправляет инструкцию ревью модели.

- Опциональный `focus text` — дополнительный контекст для ревью
- Автоматически переключает модель и thinking level на сконфигурированные
- После завершения ревью — автоматически восстанавливает исходную модель

### `/review-back`

Возвращает к ревьюемой ветке и помещает результат ревью в редактор в формате:

```xml
<review_findings>
  ... содержимое ревью ...
</review_findings>
```

## Конфигурация

Добавьте секцию `review` в `~/.pi/agent/settings.json` (глобально) или `.pi/settings.json` (проектно):

```json
{
  "review": {
    "model": "openrouter/deepseek/deepseek-v4-pro",
    "thinkingLevel": "high",
    "includeDiff": true,
    "diffMaxLines": 2000,
    "instruction": "Проверь код на ошибки и предложи улучшения..."
  }
}
```

### Поля

| Поле | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `model` | `string` | текущая модель | Составной ID: `"provider/model"` (например, `"openrouter/deepseek/deepseek-v4-pro"`) |
| `thinkingLevel` | `string` | `"high"` | `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `includeDiff` | `boolean` | `true` | Включать git diff в контекст ревью |
| `diffMaxLines` | `number` | `2000` | Максимальное количество строк diff (обрезка с warning) |
| `promptFile` | `string` | — | Путь к файлу шаблона промпта |
| `instruction` | `string` | — | Inline шаблон промпта |

## Кастомизация промпта

Приоритет загрузки шаблона:

1. **`.pi/prompts/review.md`** — проектный файл (максимальный приоритет)
2. **`review.promptFile`** — путь к файлу из settings.json
3. **`review.instruction`** — inline строка из settings.json
4. **Fallback** — захардкоженная инструкция ревью

### Переменные шаблона

В шаблоне поддерживается простая подстановка:

- `{{focus}}` — дополнительный контекст из аргументов `/review`
- `{{project}}` — имя проекта (basename рабочей директории)

Пример `.pi/prompts/review.md`:

```markdown
Проверь код проекта {{project}} на следующие аспекты:
- Корректность логики
- Безопасность
- Производительность

{{focus}}
```

## Архитектура

```
extensions/pi-review/
├── index.ts                      # Основной модуль — команды /review, /review-back, обработчик agent_end
├── lib/
│   ├── child-session.ts          # sendMessageInNewBranch() — создание ветки
│   ├── conversation-context.ts   # Извлечение и форматирование контекста разговора
│   ├── git-diff.ts               # Сбор git diff с лимитом строк
│   ├── prompt.ts                 # Загрузка шаблона промпта, подстановка переменных
│   └── settings.ts               # loadReviewConfig(), parseModelId(), типы
├── package.json
├── tsconfig.json
└── README.md
```

## Лицензия

MIT
