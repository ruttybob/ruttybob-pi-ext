---
name: prompt-craft
description: >
  Concise, high-signal prompt writing for AI agents. Use when writing, editing, or reviewing agent system prompts, subagent task descriptions, tool-use instructions, or chain/workflow prompts. Covers structure, anti-patterns, and the "right altitude" principle from Anthropic.
---

# Prompt Craft

Write prompts as the **smallest set of high-signal tokens** that produce the desired outcome. Every word must earn its place.

## Principles

- **Right altitude** — specific enough to guide, flexible enough to let the model reason. Not brittle if-else, not vague platitudes.
- **Structure > prose** — sections with `##` headers, bullet lists, tables. Never a wall of text.
- **Specific > vague** — every rule must be true/false testable. "Use single quotes" ✓, "be professional" ✗.
- **Not a flowchart** — tell **what** to do, not the order. The model plans its own execution.
- **Recency effect** — critical constraints at the end. The model remembers what it read last.
- **Zero flattery** — no "expert", "world-class", "extremely talented". Role is enough.

## Structure

```
1. Identity (1-3 sentences)         ← primacy
2. Core workflow / task              ← what to do
3. Tool guidance                     ← when to use which tool
4. Output format                     ← expected structure
5. Constraints / safety rules        ← recency — NEVER/MUST at the end
```

## Anti-patterns

| Pattern | Fix |
|---|---|
| Praise inflation ("world-class expert") | State the role: "You are a TypeScript backend engineer" |
| Flowchart steps (Step 1, Step 2, ...) | Bullet list of requirements — model decides order |
| Redundant rules (same thing in 3 phrasings) | One clear statement per rule |
| Wall of text without headers | `## Sections` and bullet points |
| Critical rules buried in the middle | Move to end (recency) |
| Vague constraints ("be helpful") | Specific: "Use GitHub-flavored Markdown" |

## Task descriptions

For subagent tasks in chain/single mode:

- **Self-contained** — agent has zero prior context. Include paths, commands, expected output.
- **No {previous} glue** — each task stands alone (except explicit chain placeholders).
- **One concern per task** — split multi-domain work into separate agents.

## Frontmatter

```yaml
---
description: What it does + when to trigger. Max 1-2 sentences.
argument-hint: "<placeholders for user input>"
---
```

## Checklist

Before finalizing a prompt:

- [ ] Every sentence carries signal — cut fluff
- [ ] Structured with headers, not prose
- [ ] No flowchart instructions
- [ ] Critical rules at the end
- [ ] No praise or flattery
- [ ] Task descriptions are self-contained
- [ ] Output format is explicit (code block, table, or list)
