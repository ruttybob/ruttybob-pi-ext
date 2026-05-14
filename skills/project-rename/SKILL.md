---
name: project-rename
description: >
  Use when the user wants to rename a project across the entire codebase —
  project name, module name, package name, repo slug, URLs, class names, etc.
  Covers discovery, categorization, execution, and verification.
---

# Project Rename

## Overview

Systematically rename a project identifier everywhere in the codebase while
avoiding common pitfalls (hand-editing lock files, rewriting changelog
history, missing case variants).

**Core principle:** Discover broadly → Categorize → Replace per-category → Regenerate derived files → Verify.

**Announce at start:** "I'm using the project-rename skill to handle this rename."

## Inputs

Before starting, confirm with the user:

| Field | Example |
|-------|---------|
| Old name (kebab-case) | `old-project` |
| New name (kebab-case) | `new-project` |
| Old PascalCase (if any) | `OldProject` |
| New PascalCase (if any) | `NewProject` |
| Old GitHub repo slug | `user/old-project` |
| New GitHub repo slug | `user/new-project` |

Derive other variants as needed: `camelCase`, `snake_case`, `SCREAMING_SNAKE`, `UPPER`, etc.

## Phase 1: Discovery

Search **broadly** — code, config, docs, tests, changelogs, hidden dirs.

```bash
# Adjust patterns for the actual name variants
rg -l 'old-project|OldProject' --hidden --glob '!.git/*'
rg -l 'user/old-project'
rg -l 'github\.com/user/old-project'
```

Also check binary/generated file references:
```bash
rg -l 'old-project' package-lock.json pnpm-lock.yaml yarn.lock 2>/dev/null
```

Collect every file path. Do not skip any.

## Phase 2: Categorization

Group every hit into one of these buckets:

| Bucket | Examples | Strategy |
|--------|----------|----------|
| **Code** | `src/`, `lib/`, `*.ts`, `*.py` | Mechanical replacement |
| **Package config** | `package.json`, `tsconfig.json`, `pyproject.toml` | Update name, description, URLs |
| **Docs** | `README.md`, `docs/`, `AGENTS.md` | Update prose, examples, links |
| **Changelog/history** | `CHANGELOG.md` | Preserve old entries; only update unreleased/active heading |
| **Lock/generated** | `package-lock.json`, `pnpm-lock.yaml`, `node_modules/` | **Do not hand-edit** — regenerate |
| **Git/CI** | `.github/`, `.git/config` | Update repo URLs, workflow refs |
| **Test snapshots/fixtures** | `__snapshots__/`, `fixtures/`, `*.snap` | Update expected values |

## Phase 3: Execution

Replace per bucket. Key rules:

1. **Code & Config** — Replace all variants (`kebab-case`, `PascalCase`, URLs). Use exact-match replacement to avoid partial hits.
2. **Docs** — Update prose, examples, and links. Check for inline code blocks and Markdown links.
3. **Changelog** — Only rename the project heading/URL for the **unreleased** section. Keep historical entries as-is.
4. **Lock/generated files** — Do NOT hand-edit. After all other edits:
   ```bash
   rm -rf node_modules package-lock.json   # or pnpm-lock.yaml, yarn.lock
   npm install                              # regenerate lock file
   ```
5. **Git/CI** — Update `.github/workflows/*.yml` refs, `repository` fields. Do NOT rewrite `.git/` history.
6. **Test snapshots** — Update expected values. If snapshots are auto-generated, delete and regenerate:
   ```bash
   npm test -- --updateSnapshot   # Jest
   ```

**Check for both `kebab-case` and `PascalCase`** variants in every file. A single file may contain multiple variants.

**GitHub URLs** — Look for all patterns:
- `github.com/user/old-project`
- `github:user/old-project`
- `git+https://github.com/user/old-project.git`

## Phase 4: Verification

Run project checks to confirm nothing is broken:

```bash
npm run check     # type-check, lint, etc.
npm test          # full test suite
git diff --stat   # review scope of changes
```

Inspect `git diff --stat` output:
- Verify file count looks reasonable.
- Spot-check a few files to confirm correct replacements.
- Ensure no lock files were partially hand-edited.

**If checks fail:** Fix issues before declaring done. Common breakage:
- Missed variant in an import path
- Snapshot mismatch after rename
- Broken URL in package.json `repository` field

## Common Mistakes

- **Hand-editing lock files** — Always regenerate. Hand-edits corrupt integrity hashes.
- **Rewriting changelog history** — Old releases happened under the old name. Preserve them.
- **Missing PascalCase variant** — Class names, type names, and namespaces often use PascalCase while the package name uses kebab-case.
- **Forgetting hidden dirs** — `.github/`, `.ralph/`, `.vscode/` can contain references.
- **Partial URL updates** — Update both the slug and any raw GitHub URLs (e.g., in badge images).

## Red Flags

**Never:**
- Hand-edit lock files or `node_modules/`
- Rewrite historical changelog entries
- Run `git filter-branch` or `git filter-repo` unless explicitly asked
- Delete `.git/` contents
- Skip the verification step

**Always:**
- Search with `--hidden` to catch dotfiles
- Check all case variants of the name
- Regenerate lock files after edits
- Run type-check and tests before declaring done
- Review `git diff --stat` for scope sanity
