---
name: wiggummy
description: Long-running iterative development loops with pacing control and verifiable progress. Use when tasks require multiple iterations, many discrete steps, or periodic reflection with clear checkpoints; avoid for simple one-shot tasks or quick fixes.
---

# Ralph Wiggum - Long-Running Development Loops

Use the `ralph_start` tool to begin a loop:

```
ralph_start({
  name: "loop-name",
  taskContent: "# Task\n\n## Goals\n- Goal 1\n\n## Checklist\n- [ ] Item 1\n- [ ] Item 2",
  maxIterations: 50,        // Default: 50
  itemsPerIteration: 3,     // Optional: suggest N items per turn
  reflectEvery: 10,         // Optional: reflect every N iterations
})
```

## Loop Behavior

1. **Start**: Creates task, progress, and reflection files in `.ralph/`.
2. **Each iteration**: Spawns an isolated `pi --mode json` child process with:
   - System prompt: built-in + task content + progress + reflection
   - Tools: read, bash, edit, write, grep, find, ls (no extensions)
   - No session persistence
3. The child process updates task and progress files during its work.
4. On reflection checkpoints, the child writes to the reflection file.
5. When the child outputs `<promise>COMPLETE</promise>`, the loop ends.
6. Otherwise, the parent spawns the next iteration automatically.

## User Commands

- `/ralph start <name|path>` - Start a new loop.
- `/ralph resume <name>` - Resume loop.
- `/ralph stop` - Pause loop (when agent idle).
- `/ralph-stop` - Stop active loop (idle only).
- `/ralph status` - Show loops.
- `/ralph list --archived` - Show archived loops.
- `/ralph archive <name>` - Move loop to archive.
- `/ralph clean [--all]` - Clean completed loops.
- `/ralph cancel <name>` - Delete loop.
- `/ralph nuke [--yes]` - Delete all .ralph data.

Press ESC to interrupt streaming, send a normal message to resume, and run `/ralph-stop` when idle to end the loop.

## Task File Format

```markdown
# Task Title

Brief description.

## Goals
- Goal 1
- Goal 2

## Checklist
- [ ] Item 1
- [ ] Item 2
- [x] Completed item

## Verification
- Evidence, commands run, or file paths

## Notes
(Update with progress, decisions, blockers)
```

## Best Practices

1. Write a clear checklist with discrete items.
2. Update checklist and notes as you go.
3. Capture verification evidence for completed items.
4. Reflect when stuck to reassess approach.
5. Output the completion marker only when truly done.
