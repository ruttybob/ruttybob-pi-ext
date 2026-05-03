---
description: git commit prompt with changelog and tagging
---
**Дополнение:** `$@`
**Язык:** Все пояснения, комментарии, changelog-записи и текст на выходе — **обязательно на русском языке**. Код, технические идентификаторы и commit-префиксы (`feat:`, `fix:` и т.д.) остаются на английском.

Before every git commit:

1. Update `CHANGELOG.md` — add an entry under `[Unreleased]` (create it if missing):
   - Change type: `Added`, `Changed`, `Fixed`, `Removed`
   - Brief description matching the language of existing entries
2. Stage the `CHANGELOG.md` change along with the rest of the changes
3. Commit with a conventional commit message (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
4. Always include the `CHANGELOG.md` update in the same commit
5. **После коммита** — предложить пользователю версию для тега:
   - Определить подходящую версию (patch/minor/major) на основе характера изменений и существующих тегов (`git tag --sort=-v:refname | head -5`)
   - Показать предполагаемую версию и **запросить подтверждение** через questionnaire
   - После подтверждения пользователя — создать аннотированный тег: `git tag -a v<version> -m "v<version>"`
   - Если пользователь отклонил — не создавать тег