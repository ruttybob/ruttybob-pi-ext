---
description: Structured multi-perspective discussion with Verbalized Sampling
argument-hint: "<discussion topic>"
---

$@

Run a multi-perspective discussion on the topic.

**Before writing** — if context is unclear, use `questionnaire`. Do not guess.

## Verbalized Sampling

Generate 5 distinct perspectives to avoid mode collapse. Vary angles: mainstream, contrarian, practical, strategic, unconventional. Keep probabilities below 0.30.

```
<response>
  <text>[viewpoint summary]</text>
  <probability>[0.0–1.0]</probability>
</response>
```

For each perspective — evidence, blind spots, interactions with others.

## Output

```markdown
# Discussion: <topic>

## Perspectives
### 1. <title> (p=<probability>)
<summary + analysis>

### 2. <title> (p=<probability>)
...

## Synthesis
- **Decisions:** ...
- **Open questions:** ...
- **Next steps:** ...
```

Respond directly — do not save to jot.
