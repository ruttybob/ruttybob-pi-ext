---
name: system-prompt-injection
description: Add system prompt injection reporting to pi extensions. Use when creating or modifying an extension that modifies systemPrompt via before_agent_start, so that look-system-prompt and similar viewers can discover and display the injection.
disable-model-invocation: true
---

# System Prompt Injection Reporting

Позволяет расширениям pi сообщать о своих инъекциях в системный промпт, чтобы вьюеры (look-system-prompt) автоматически их обнаруживали и показывали.

## Протокол

Расширение, модифицирующее `systemPrompt` в `before_agent_start`, должно эмитить событие `system-prompt:injection`:

```ts
pi.on("before_agent_start", async (event, _ctx) => {
  const myContent = "..."; // ваш текст инъекции

  if (myContent) {
    // 1. Эмитим отчёт о инъекции
    pi.events?.emit("system-prompt:injection", {
      source: "my-extension-name",   // уникальный идентификатор расширения
      label: "My Feature",           // человекочитаемое название
      charCount: myContent.length,   // размер инъекции в символах
      preview: myContent.slice(0, 300), // превью (до 300 символов)
      fullContent: myContent,        // полное содержимое (опционально)
    });

    // 2. Модифицируем промпт как обычно
    return {
      systemPrompt: event.systemPrompt + "\n\n" + myContent,
    };
  }
});
```

## Поля InjectionInfo

| Поле | Тип | Обязательное | Описание |
|---|---|---|---|
| `source` | `string` | Да | Уникальный идентификатор (имя пакета/расширения) |
| `label` | `string` | Да | Человекочитаемое название для UI |
| `charCount` | `number` | Да | Размер инъекции в символах |
| `preview` | `string` | Да | Краткое превью (до 300 символов) |
| `fullContent` | `string` | Нет | Полный текст инъекции для отладки |

## Чеклист

- [ ] `source` уникален среди всех установленных расширений (обычно имя npm-пакета)
- [ ] `emit` вызывается **до** `return { systemPrompt: ... }`
- [ ] `charCount` совпадает с реальной длиной инъекции
- [ ] `preview` содержит начало инъекции, а не произвольный текст
