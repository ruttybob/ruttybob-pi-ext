---
name: verbalized-sampling
description: "Improve prompt diversity using Verbalized Sampling technique. Applies when generating creative content, synthetic data, dialogue simulations, or any task where LLM output diversity matters."
disable-model-invocation: true
---

# Verbalized Sampling — Prompt Engineering for Diversity

Based on [Zhang et al. (2025)](https://arxiv.org/abs/2510.01171). Mode collapse (repetitive, stereotypical outputs) is caused by *typicality bias* in preference data — not just algorithmic limitations. Verbalized Sampling (VS) is a training-free prompting strategy that recovers pretraining diversity by asking the model to output a **distribution of responses with probabilities**.

## When to Apply

Use VS when the task has **multiple equally valid answers** (flat true utility):
- Creative writing (stories, poems, jokes, ideas, brainstorming)
- Synthetic data generation
- Dialogue / persona simulation
- Open-ended QA / survey simulation
- Hypothesis generation / exploration tasks
- Any prompt where you notice repetitive, samey outputs

**Do NOT use** when there is one correct answer (factual QA, math, code with strict spec) — standard prompting is fine there.

## Core Technique

### Standard VS Prompt

Transform a single-response prompt into a distribution request:

```
❌ "Write a short story about a bear"

✅ "Generate 5 short stories about a bear. For each story, provide:
   <response>
     <text>[story text]</text>
     <probability>[a number reflecting how likely this response is]</probability>
   </response>"
```

The model verbalizes a probability distribution over responses, which bypasses mode collapse and recovers the diversity the model learned during pretraining.

### VS Variants (choose based on needs)

| Variant | When to Use | Pattern |
|---|---|---|
| **VS-Standard** | Default choice. Best quality/diversity balance. | Ask for k responses + probabilities in one call |
| **VS-CoT** | Complex creative tasks. Best quality on capable models. | "Think step-by-step, then generate k responses with probabilities" |
| **VS-Multi** | Maximum diversity. Multiple rounds. | First call: VS-Standard. Follow-up: "Generate k more with probabilities" |

**Rule of thumb:** k=5 candidates per call. If you need N total responses, make ⌈N/k⌉ calls rather than one giant call (quality degrades with very large k).

## Diversity Tuning

Control output diversity via probability threshold — no need to change temperature:

```
"Generate 5 responses with probabilities less than 0.10 each"
```

- Lower threshold → higher diversity (tail of distribution)
- Higher threshold → more typical/mainstream responses
- Can combine with temperature adjustments (they are orthogonal)

## Prompt Transformation Examples

### Brainstorming
```
❌ "Suggest startup ideas in fintech"
✅ "Generate 5 startup ideas in fintech with their estimated 
    probability of being suggested. Use <response> tags with 
    <text> and <probability> for each."
```

### Synthetic Data
```
❌ "Generate 10 math problems about algebra"
✅ "Generate 5 competition-level algebra problems with varying 
    difficulty. For each, provide the problem and its probability 
    in a <response> block. Make the distribution diverse."
```

### Dialogue Simulation
```
❌ "How would a user react to this sales pitch?"
✅ "Simulate 5 different user reactions to this sales pitch. 
    For each reaction, estimate how probable it is among real 
    users. Use <response> with <text> and <probability>."
```

### Creative Exploration
```
❌ "Write a tagline for our product"
✅ "Generate 5 taglines for our product. Assign each a probability 
    representing how commonly this style of tagline appears. 
    Prioritize diverse angles — emotional, practical, provocative, 
    minimalist, humorous."
```

## Key Principles

1. **Flat utility = VS territory.** If many answers are equally "correct," VS helps. If one answer is right, don't bother.

2. **More capable model = more VS benefit.** Emergent scaling: GPT-4-class models benefit 1.5-2x more than smaller ones from the same VS prompt.

3. **Don't fear quality loss.** Experiments show VS maintains quality (precision ≈1.0) while boosting diversity 1.6-2.1x. VS-CoT even *improves* quality on large models.

4. **Sample from the distribution.** Once you get responses with probabilities, sample according to those probs for downstream use (e.g., synthetic data). Don't just pick the highest-probability one — that re-introduces mode collapse.

5. **Combine with temperature.** VS and temperature are orthogonal. Use both for maximum diversity-coverage.

## Anti-Patterns to Avoid

- Don't ask for distributions on factual questions — it adds noise without benefit
- Don't set k too high in one call (>20 degrades quality; prefer multiple k=5 calls)
- Don't ignore the probabilities — they encode the model's uncertainty and diversity signal
- Don't only pick high-probability responses — that's the same as direct prompting

## Quick Reference: Prompt Template

```
System: For each query, generate a set of {k} possible responses, 
each within a separate <response> tag. Each response should include 
<text> and a numeric <probability>. {optional: "Keep all 
probabilities below {threshold}"}

User: {your task here}
```
