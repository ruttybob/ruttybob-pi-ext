# Changelog

## [Unreleased]

### Added
- **pi-powerline**: modern-режим футера на базе сегментов (presets, segments, separators, git-status, theme, colors, types)
- **extensions**: AGENTS.md для всех 12 расширений (advisor, interactive-shell, llm-rename, pi-goal, pi-powerline, pi-quota, pi-review, pi-worktree, search-tools, session-recap, subagent, tools)
- **old/skills**: verbalized-sampling skill
- **pi-quota**: вкладка DeepSeek для мониторинга баланса через API `/user/balance`
- **subagent**: worktree-агент переведён на английский
- **subagent**: авто-коммит untracked файлов в worktree перед merge
- **subagent**: промпт `wt-merge` — добавлен шаг авто-коммита перед слиянием
- **pi-powerline**: отображение имени сессии в breadcrumb
- **interactive-shell**: новое расширение
- **llm-rename**: новое расширение
- **pi-worktree**: новое расширение
- **prompts**: добавлен `discuss.md`
- **skills**: `finishing-a-development-branch`, `prompt-craft`, `using-git-worktrees`

### Changed
- **pi-powerline**: рефакторинг — вынос hexFg в theme.ts, общие типы/цвета, новая breadcrumb-раскладка с session name
- **subagent**: указание model в frontmatter для planner (zai/glm-5.1:high), reviewer (zai/glm-5.1:high), worker (zai/glm-5.1)
- **llm-rename**: лимит слов в названии сессии уменьшен с 2-6 до 2-3
- **pi-powerline**: имя сессии перенесено в конец breadcrumb (после папки)
- **prompts**: старые промпты (`diff-review`, `fact-check`, `generate-slides`) перенесены в `old/`
- **subagent**: агент `worktree` для управления git worktrees
- **subagent**: новые промпты — `chain_pwr`, `do-parallel`, `do-review`, `research`, `review-agent`, `scout-plan`, `wt-feat`, `wt-fix`, `wt-merge`, `wt-mgr`
- **pi-worktree-agent**: расширение для управления git worktrees
  - Команда `/worktree <task>` — спавнит специализированного агента с изолированным контекстом
  - Инструмент `worktree` — аналогичный функционал для LLM
  - Ограниченный bash: только git, package managers, базовые утилиты
  - Встроенные навыки: `using-git-worktrees`, `finishing-a-development-branch`
  - Полный жизненный цикл: создание worktree → работа → тесты → merge/PR/cleanup
- **skill-creator**: новый навык для создания agent-скиллов (структура, шаблон, правила описания)
- **pi-review v2**: полный апгрейд расширения (v1.1.1 → v2.0.0)
  - git diff в контексте ревью (опционально, лимит 2000 строк)
  - кастомизируемый промпт: `.pi/prompts/review.md` → `promptFile` → `instruction` → fallback
  - подстановка `{{focus}}` и `{{project}}` в шаблонах промпта
  - составной model ID (`"openrouter/deepseek/deepseek-v4-pro"`) вместо provider+model
  - runtime-валидация thinkingLevel
  - package.json, tsconfig.json, vitest.config.ts
  - 35 unit-тестов (settings, prompt, conversation-context)
  - README.md с документацией

### Fixed
- **pi-review**: agent_end restore привязан к review-ветке (проверка ReviewMetadata)
- **pi-review**: guard от повторного `/review` при активном ревью
- **pi-review**: async `restoreOriginalState()` с `await setModel()` и try/catch
- **pi-review**: `/review-back` не молчит в headless-режиме
- **pi-review**: try/catch вокруг `navigateTree` с гарантированным restore модели

### Changed
- **migration**: `@mariozechner` → `@earendil-works` — обновлены все импорты в расширениях, стабы, алиасы в vitest/tsconfig, `package.json`
- **subagent**: команды `/subagents:list|spawn` переименованы в `/agents:list|spawn`
- **subagent**: поддержка `skills` во frontmatter агентов — авторезолв путей и передача через `--skill`
- **subagent**: `planner` агент — добавлен `bash` в tools
- **tools**: tool groups — только глобальный конфиг (`~/.pi/agent/toolgroups.json`), убрана поддержка проектного `.pi/toolgroups.json`
- **tools**: автокомплит имён групп для `/tools <group>`
- **first-principles-decomposer**: добавлен `disable-model-invocation: true`
- **pi-review**: ReviewConfig — единый формат model ID, убран двухполевой provider+model
- **pi-review**: ReviewMetadata хранит `originalModelComposite` вместо provider+model

### Changed
- **cli-creator**: миграция с Codex на pi — заменены все ссылки, добавлены правила YAML frontmatter для companion skill
- **cli-creator**: обновлён справочник agent-cli-patterns.md (Codex → agent/pi)

### Removed
- **subagent**: старые промпты (`subagents_implement`, `subagents_implement-and-review`, `subagents_parallel-implement`, `subagents_scout-and-plan`)
- **pi-skill-toggle**: расширение перенесено в rutty-pi
- **cli-creator/agents/openai.yaml**: удалён неиспользуемый файл агента

### Added
- **skills**: новые навыки — cli-creator, grill-me, playwright, playwright-interactive
- **prompts**: новые промпты — zoom-out, doc-scout, doc-write, explain-codebase, modernize-and-refactor
- **old/**: архив старых промптов (discuss, explore, old-planmode)

### Removed
- Удалены расширения: answer, ask-user-question, fork-to-back, pi-auto-rename, pi-mesh, pi-ralph-wiggum, presets, profiles, shared, side-agents, system-prompt-template
- Удалены соответствующие тесты и старые промпты (commit, decompose-plans, discuss, explore, plan-detailed, plan-triage, plan, setup-flow)
- Удалён skill `prompt-craft`

### Changed
- **package.json**: убраны ссылки на удалённые расширения и skills
- **pi-goal**: синхронный режим записи логов (`pino.destination({ sync: true })`)

### Fixed

- **tools**: курсор в /tools и /tools-group больше не прыгает на первый пункт после toggle инструмента/группы

### Added

- **git-commit**: обязательное обновление CHANGELOG.md перед каждым коммитом + предложение version tag (patch/minor/major)

### Changed

- Удалён `AGENTS.md` — больше не используется
- **scout**: добавлены инструменты `zai_web_search`, `zai_web_reader`
- **worker**: добавлены инструменты `bash, read, write, edit` в конфигурацию
- **subagent**: добавлен путь `./extensions/subagent/prompts` в `package.json`
- **.gitignore**: добавлена директория `.issues/`

### Added

- **advisor**: расширение для стратегии «спросить старшую модель» — tool, команда `/advisor`, lifecycle hooks (session_start restore, before_agent_start strip); конфиг через `~/.config/rpiv-advisor/advisor.json`

### Changed

- **prompts** (plan, plan-detailed, decompose-plans): перевод на английский, обязательный `questionnaire` при неоднозначностях

- **subagent**: промпты переименованы с `implement.md` → `subagents_implement.md` (и аналогично для scout-and-plan, parallel-implement, implement-and-review)
- **pi-powerline**: новые модули — breadcrumb (git-путь), editor (vim-режим), footer (TUI-оверлей), settings (конфиг), widget (виджеты); 5 файлов + тесты
- **ask-user-question**: новый extension — полный UI-фреймворк для question tool с fuzzy search, multi-select, inline custom input, bracketed paste, Kitty CSI-u; 66 файлов
- **search-tools**: новый extension — web search (Brave, Tavily), web reader, vision, zread; конфигурация через settings.json, кэширование, rate limiting
- **web-tools**: тесты для web-tools extension (extension в rpiv-mono)
- **pi-quota**: tab-навигация через ←/→ + Tab; TabId тип, TABS-массив для циклического переключения
- **prompts**: обновлены commit, discuss, explain-codebase, explore, modernize-and-refactor, plan-detailed, plan; добавлены doc-scout, doc-write
- Обновлены stubs: `pi-tui` (backspace, requestRender, Component), `typebox/value`, `rpiv-test-utils`, `rpiv-i18n`; алиасы в vitest.config.ts

### Removed

- **tavily-tools**: расширение удалено — функционал перенесён в `search-tools`
- **zai-tools**: расширение удалено — функционал перенесён в `search-tools`

### Removed

- **pi-powerline**: CLI-флаги `--powerline`, `--breadcrumb`, `--footer` — настройки управляются через `/powerline` команду и `.pi/settings.json`
- **evolver**: расширение полностью удалено — extensions/evolver/, tests/evolver/, memory/evolution/

### Added

- **pi-goal**: расширение перенесено из отдельного репозитория `@ramarivera/pi-goal` в `extensions/pi-goal/` — persisted goals с hidden continuation pressure, token budget tracking, completion audit; 26 тестов, skill `goal`, stub для `pino`
- **subagent**: промпт-шаблон `parallel-implement` для параллельной имплементации через worker-ов

### Removed

- Удалены устаревшие `.scratch/` PRD (codebase-modernize, mesh-inline-widget, mesh-overlay-v2/v3, mesh-tools-toggle, side-agents-decompose, subagent-decompose, toolignore-config, zai-tools-migration, zai-tools-toggle)
- Удалены `docs/agents/` (domain.md, issue-tracker.md, triage-labels.md) — больше не используются
- **subagent**: команды `/subagents:list` и `/subagents:spawn` — 15 тестов
- **subagent**: имена доступных агентов в tool description для предотвращения галлюцинаций LLM
- **subagent**: тест на Optional agent в TaskItem-схеме
- `@types/node` добавлен в devDependencies
- **answer**: расширение перенесено в `extensions/answer/` с конфигурируемой моделью extraction через settings.json
- **answer**: `config.ts` — двухслойный конфиг (`~/.pi/agent/settings.json` → `<project>/.pi/settings.json`, ключ `"answer"`)
- **answer**: 30 тестов (15 config + 15 handler)
- `createMockContext()` хелпер в `tests/test-helpers/mock-api.ts`
- **tools**: система групп инструментов — `groups.ts` (конфиг, glob-матчинг), `group-manager.ts` (TUI), команда `/tools <group>` для toggle, `/tools-group` для CRUD; 37 тестов

### Changed

- **subagent**: parallel summary показывает `stderr` при пустом `messages` (раньше показывал `(no output)` для несуществующих агентов)
- **subagent**: `buildDescription()` принимает список агентов для перечисления в tool description
- **subagent**: `config.ts` — убран двойной type cast `agentScope`
- **zai-tools**: импорты переведены с `.ts` на `.js` суффиксы (107 TS-ошибок)
- **все расширения**: типизированы параметры `execute`, `renderCall`, `renderResult` (~120 TS-ошибок)
- **stubs**: обновлены `pi-coding-agent` (ExtensionAPI, ExtensionCommandContext.ui, AgentToolResult<T>, Message), `pi-tui` (requestRender, backspace, Component.render), `pi-ai` (StringEnum, Message)
- `tsconfig.test.json`: добавлено `"types": ["node"]`

### Fixed

- **subagent**: parallel mode не показывал диагностику при вызове несуществующего агента

### Added

- **subagent**: динамическая сборка JSON-схемы tool — при `parallelEnabled: false` поле `tasks` отсутствует в схеме; конфигурация через `settings.json` (defaults → global → project)
- **evolver/tests**: placeholder-тесты (`markdown.test.ts`, `memory-graph.test.ts`, `utils.test.ts`) заменены на полноценные unit-тесты с temp-директориями и реальными вызовами
- **package.json**: добавлен путь `./skills` в секцию `skills`

### Changed

- **subagent**: `agentScope` и `confirmProjectAgents` перенесены из tool schema в `SubagentConfig` — LLM больше не видит и не передаёт эти параметры; scope настраивается в `settings.json` (defaults → global → project); boot-time discovery использует `config.agentScope` вместо хардкода `"user"`
- **prompts/plan-detailed**: убрана устаревшая секция Input

### Changed

- **subagent**: монолит index.ts (987 строк) декомпозирован на модули types, runner, render, utils — entry point содержит только tool-регистрацию
- **side-agents**: монолит index.ts (2403 строки) декомпозирован на модули types, utils, git, tmux, registry, worktree, backlog, status-poll — entry point содержит только tool/command/event-регистрации
- **shared**: созданы переиспользуемые модули (fs, text, async, git) в `extensions/shared/` — устранено дублирование утилит между 4+ расширениями
- **pi-ralph-wiggum**: миграция FS-утилит на импорты из shared (ensureDir, fileExists, tryRead, atomicWrite)
- **pi-auto-rename**: миграция FS-утилит на импорты из shared (tryRead, atomicWrite, readJsonFile)
- **system-prompt-template**: миграция FS-утилит на импорты из shared (tryRead, fileExists)
- **pi-mesh**: добавлены TODO-комментарии для миграции sync→async утилит в registry, messaging, config

### Added

- **tests/shared**: unit-тесты для shared-модулей — fs (12), text (13), async (6), git (10)
- **tests/subagent**: unit-тесты для subagent-модулей — runner, render

### Added

- **zai-tools**: slash-команда `/zai-tools` для мгновенного toggle всех инструментов расширения (on/off). Состояние персистентно в рамках сессии и восстанавливается при навигации по session tree
- **zai-tools**: глобальное состояние toggle (файл `zai-tools-state.json`) — при старте сессии без session entry восстанавливается из глобального файла
- **zai-tools**: MCP-клиент (remote + stdio), сервисы (vision, web-search, web-reader, zread), инструменты, утилиты (cache, rate-limit, retry, json-parse, truncation)
- **zai-tools**: полный набор тестов — cache, config, extension, global-state, json-parse, rate-limit, retry, toggle, truncation, vision-service, web-search-service, zread-service, tool-onUpdate
- **pi-mesh**: расширение для mesh-сети агентов (overlay, registry, feed, messaging, tracking, reservations)
- **session-recap**: расширение для recap-сессий
- **side-agents**: расширение для управления побочными агентами (spawn, check, wait, send)
- **tests/side-agents**: интеграционные тесты (integration.test.mjs) и контрактные тесты инструментов (tool-contract.test.ts)
- **package.json**: добавлена секция `prompts` — папка `./prompts` теперь входит в пакет расширений
- **prompts**: добавлены файлы промптов — commit, discuss, explore, plan-detailed, plan

### Added

- **subagent**: расширение для делегирования задач вложенным агентам (agents, prompts, delegation chain)
- **pi-mesh**: chat-overlay, feed-overlay, overlay-helpers, toggle — разбиение монолитного overlay на модули
- **pi-mesh**: тесты для chat-overlay, feed-overlay, overlay-helpers, toggle
- **prompts**: добавлены промпты explain-codebase и modernize-and-refactor

### Changed

- **pi-mesh**: монолитный overlay.ts разбит на chat-overlay, feed-overlay, overlay-helpers и toggle
- **prompts**: заменена ссылка на Ghostty → mods в plan и plan-detailed
- **side-agents**: убрана LLM-зависимость — slug генерируется эвристикой, kickoff prompt ссылается на session_query вместо LLM-саммари, убраны «Press any key» из launch-скрипта, добавлена file-based координация poller/dedup для hot-reload
- **pi-ralph-wiggum**: добавлен `disable-model-invocation: true` в SKILL.md wiggummy
- **prompts**: убраны дублирующие языковые инструкции из файлов промптов (commit, discuss, explore, plan-detailed, plan) — язык теперь задаётся через AGENTS.md
- **package.json**: добавлена зависимость `@sinclair/typebox`, добавлен скрипт `test:integration:side-agents`, подключены навыки `side-agents`
