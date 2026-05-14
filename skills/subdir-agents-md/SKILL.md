---
name: subdir-agents-md
description: >
  Create and maintain subtree AGENTS.md files in project subdirectories.
  Use when the user asks to add AGENTS.md to subdirectories, split a root
  AGENTS.md into nested files, or organise agent guidance by code area.
  Covers sizing, scope, hierarchy rules, import-gotcha tables, and
  cross-tool compatibility (Codex, Claude Code, Cursor).
disable-model-invocation: true
---

# Subtree AGENTS.md

## When to split

- Root `AGENTS.md` exceeds 80 lines or covers unrelated domains.
- Multiple teams own different subtrees (merge-conflict prevention).
- A subtree has non-obvious import chains, circular deps, or gotchas that agents frequently get wrong.
- Monorepo with distinct packages/languages per directory.

Do NOT split just because you can. A focused repo (single team, <30K LOC) usually needs only root.

## Sizing

| Scope | Target | Hard limit |
|-------|--------|------------|
| Root `AGENTS.md` | 40–80 lines | 100 lines |
| Subtree `AGENTS.md` | 5–25 lines | 30 lines |
| **Combined total** | <20 KiB | 32 KiB (Codex default) |

Every byte loads on every agent turn. Prune before adding.

## What belongs in a subtree file

Only three categories survive the "principal engineer test":

1. **Import chains & dependency gotchas** — where X imports Y from, which module owns which type, circular-import traps.
2. **Workflow rules** — "if you change this, run that", "this file is auto-generated, edit the template instead".
3. **Non-obvious constraints** — singleton patterns, env-var side effects, files that must stay in sync.

Everything else is inferable from the code.

## Template

```markdown
# {subdir}/

{One sentence: what this subtree is for, only if the directory name is ambiguous.}

## Module roles

- `file-a.ts` — {role, only if non-obvious from name}
- `file-b.ts` — {role}

## Import rules

{Bullet list of where things import from and why.}
{Common mistakes agents make with imports here.}

## Gotchas

- {Non-obvious constraint.}
- {File that must stay in sync with another.}
```

If a section has nothing to add, omit it entirely. Do not pad.

## Hierarchy & precedence

- Subtree files **complement** the root — they do not replace it.
- Closest `AGENTS.md` to the edited file wins on conflicts.
- Root should reference subtrees via a short "Subtree guides" section with one-line descriptions.
- Do not duplicate root-level rules in subtree files.

## Anti-patterns

- ❌ Module descriptions ("This module handles authentication...") — agent reads the code.
- ❌ File inventory with one-liner per file — `ls` does this.
- ❌ Architecture overviews with data-flow diagrams — belongs in `docs/`.
- ❌ Import tables that duplicate what `grep '^import'` shows — only list non-obvious chains and traps.
- ❌ Rules that will rot fast (version numbers, exact line counts, temporary TODOs).

## Cross-tool compatibility

| Tool | Subtree support | Loading |
|------|----------------|---------|
| Codex | `subdir/AGENTS.md` | All loaded at session start, root→CWD |
| Claude Code | `subdir/CLAUDE.md` | On-demand when agent reads files in subtree |
| Cursor | `.cursor/rules/*.mdc` with `Globs:` | Glob-matched |
| GitHub Copilot | `.github/instructions/*.instructions.md` | `applyTo` frontmatter |

For multi-tool repos, keep `AGENTS.md` as source of truth and symlink:
```bash
ln -s AGENTS.md CLAUDE.md
```

## Verification

After creating/editing subtree files:

1. Check combined size: `find . -name AGENTS.md -not -path '*/node_modules/*' | xargs cat | wc -c` — must be <32 KiB.
2. Check no duplicate rules between root and subtree.
3. Run `npm run lint` / `npm test` to confirm nothing broke.
4. Re-read each file: would a principal engineer already know this from reading the code? If yes, cut it.
