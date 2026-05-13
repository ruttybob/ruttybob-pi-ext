---
description: Research a question — clarify scope, then search with 1–3 agents in parallel
argument-hint: "<research question>"
---

**1. Clarify.** Use `questionnaire` before any search:

- **Scope**: narrow (specific fact/API), moderate (comparison/overview), broad (deep research)
- **Sources**: official docs, community, academic, all
- **Angle**: practical usage, theory/architecture, comparison, troubleshooting

**2. Scale agents to scope:**

| Scope | Agents |
|---|---|
| narrow | 1 — **zai** |
| moderate | 2 — zai + brave or tavily |
| broad | 3 — zai + brave + tavily |

**3. Launch.** `subagent` single mode for each agent, same function_calls block (concurrent). Each task: original question `$@` + clarified scope/sources/angle. Self-contained — no {previous}.

**4. Synthesize.** Combine findings into:

```
## Research: $@
## Scope & approach
## Agent findings (per agent — key points, sources)
## Synthesis (convergence, divergence, gaps)
## Sources (all, with URLs)
```

Failed agents — note, do not retry.
