---
description: Detailed plan with copy-paste code and commands
argument-hint: "<path-to-summary-plan.md>"
---

# Writing Implementation Plans

Write comprehensive implementation plans assuming the implementer has zero context for the codebase. Document everything: which files to touch, complete code, testing commands, verification steps.

**Core principle:** A good plan makes implementation obvious. If someone has to guess, the plan is incomplete.


1. Прочитай оригинальный план целиком — он контекст и структура
2. Погрузись в код — читай файлы, которые план затрагивает
3. Распиши каждый таск до уровня copy-paste кода и точных команд

<goal>
$@
</goal>

## When to Use

- Multi-step features
- Complex refactoring
- Anything with 3+ files or 3+ tasks
- Before delegating to subagents

## Bite-Sized Tasks

**Each task = 2-5 minutes of focused work.**

Every step is ONE action:
- "Write the failing test" — step
- "Run it to verify failure" — step
- "Implement minimal code to pass" — step
- "Run tests to verify pass" — step
- "Commit" — step

**Too big:** "Build authentication system" (50 lines, 5 files)
**Right size:** "Create User model with email field" (10 lines, 1 file)

## Plan Structure

````markdown
# [Feature] Implementation Plan

**Goal:** [One sentence]
**Architecture:** [2-3 sentences about approach]
**Tech Stack:** [Key technologies]
**Source plan:** [path to the original `/plan` file this expands on]

---

### Task 1: [Descriptive Name]

**Objective:** What this accomplishes

**Files:**
- Create: `exact/path/to/new_file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/path/to/test_file.py`

**Step 1: Write failing test**

```python
def test_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Verify failure**

Run: `pytest tests/path/test.py::test_behavior -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Verify pass**

Run: `pytest tests/path/test.py::test_behavior -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific behavior"
```

---
[next tasks...]
````

## Writing Process

1. **Understand requirements** — read the user's request, design docs, constraints
2. **Explore codebase** — use `bash` or `read` to understand patterns
3. **Design approach** — architecture, file organization, dependencies, testing strategy
4. **Write tasks** in order: setup → core (TDD each) → edge cases → integration → cleanup
5. **Add complete details** — exact paths, complete code, exact commands, expected output
6. **Review checklist:**
   - [ ] Tasks sequential and logical
   - [ ] Each task bite-sized (2-5 min)
   - [ ] File paths exact
   - [ ] Code complete (copy-pasteable)
   - [ ] Commands exact with expected output
   - [ ] No missing context

## Principles

- **DRY** — extract shared logic, don't copy-paste
- **YAGNI** — implement only what's needed now
- **TDD** — every code task: write test → verify fail → implement → verify pass
- **Frequent commits** — commit after every task

## Save Location

```
.plans/<slug>/.detailed/YYYY-MM-DD_HHMMSS-<slug>.md
```


After saving:
1. Use bash tool and Open the file in a mods app for reading:
   ```
   open -a mods <plan>

   ```
2. Tell the user:
   > "Detailed plan saved to `.plans/.detailed/...`. Ready to execute task-by-task. Use /handoff command to implement"
