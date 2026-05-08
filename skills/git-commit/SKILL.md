---
name: git-commit
description: >
  Mandatory read before creating git commits. Stages only intended files, groups changes into logical commits, and writes concise Conventional Commits-style subjects.
---

## Format

`<type>(<scope>): <summary>`

- `type` REQUIRED. Use `feat` for new features, `fix` for bug fixes. Other common types: `docs`, `refactor`, `chore`, `test`, `perf`.
- `scope` OPTIONAL. Short noun in parentheses for the affected area (e.g., `api`, `parser`, `ui`).
- `summary` REQUIRED. Short, imperative, <= 72 chars, no trailing period.

## Notes

- One commit = one cohesive, reviewable change.
- Split unrelated changes into multiple commits with selective staging.
- "commit all" means stage all relevant files, not "force one commit".
- If multiple logical groups exist and user did not request a squash, create multiple commits.
- Body is OPTIONAL. If needed, add a blank line after the subject and write short paragraphs.
- Do NOT include breaking-change markers or footers.
- Do NOT add sign-offs (no `Signed-off-by`).
- Only commit; do NOT push (unless explicitly asked).
- If caller provides file paths or globs, limit staging to those files unless explicitly told otherwise.
- By default, do NOT run linters, formatters, tests, builds, or similar pre-commit checks unless the user explicitly asks for them or an `AGENTS.md` requires them.
- If it is unclear whether a file belongs in the commit, ask.

## Changelog

Before every commit, update `CHANGELOG.md`:

1. If `CHANGELOG.md` does not exist — create it.
2. Ensure `[Unreleased]` section exists at the top (create if missing).
3. Add an entry under the appropriate sub-heading:
   - `Added` — new features
   - `Changed` — changes to existing functionality
   - `Fixed` — bug fixes
   - `Removed` — removed features
4. Keep the description brief and in the same language as existing entries.
5. Stage `CHANGELOG.md` together with the rest of the changes — **same commit**.

## Version Tagging

After each commit:

1. Determine the bump level based on the change type:
   - `fix:` → patch
   - `feat:` → minor
   - Breaking changes → major
2. Get existing tags: `git tag --sort=-v:refname | head -5`
3. Calculate the new version from the latest tag.
4. Ask the user for confirmation via `questionnaire`:
   - Show the proposed version (e.g. `v1.2.3`) and bump level.
   - Options: confirm / skip.
5. If confirmed — create an annotated tag: `git tag -a v<version> -m "v<version>"`
6. If skipped — do nothing.

## Steps

1. Parse the prompt for file paths/globs and extra instructions; treat them as commit constraints.
2. Review `git status` and `git diff` to understand the current changes, limited to specified files when provided.
3. Partition changes into the smallest logical commit groups by intent and cohesion.
4. If grouping or file inclusion is ambiguous, ask before committing.
5. Stage only the files for the current logical commit.
6. **Update `CHANGELOG.md** (see Changelog section above) and stage it.
7. Run `git diff --cached --name-only` to verify the staged set matches one cohesive change.
8. Run `git commit -m "<subject>"` (and `-m "<body>"` if needed).
9. **Offer version tag** (see Version Tagging section above).
10. Repeat for remaining logical groups, if any.
