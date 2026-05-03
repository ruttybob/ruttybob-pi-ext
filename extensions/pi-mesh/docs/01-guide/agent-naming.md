# Agent naming

## Default pattern

Agent names follow the pattern **`{type}-{N}`** where:

- **`type`** comes from the `PI_AGENT` environment variable (defaults to `"agent"`)
- **`N`** is an auto-incrementing number to avoid collisions

So if `PI_AGENT=zero`, your agents will be named `zero-1`, `zero-2`, etc. If `PI_AGENT=lite`, you get `lite-1`, `lite-2`.

## Persistent name via config

Set `agentName` in your pi-mesh config to give an agent a fixed name that persists across sessions:

```json
{
  "autoRegister": true,
  "agentName": "auth-worker"
}
```

Priority order (highest wins):

1. `PI_AGENT_NAME` environment variable
2. `agentName` in config (project or user level)
3. Auto-generated `{type}-{N}`

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PI_AGENT` | Sets the agent type prefix. Determines the base name before the numeric suffix. |
| `PI_AGENT_NAME` | Overrides the full name entirely. Skips the `{type}-{N}` pattern. Highest priority. |

Setting `PI_AGENT_NAME=auth-worker` means the agent registers as exactly `auth-worker` — no suffix appended.

## Renaming at runtime

Agents can rename themselves during a session:

**Via slash command** (in TUI):
```
/mesh-rename auth-worker
```

**Via tool call** (for LLM agents):
```typescript
mesh_manage({ action: "rename", name: "auth-worker" })
```

Both update the registry entry, rename the inbox directory, and post a rename event to the feed. Other agents see the new name on their next `mesh_peers` call.

> **Note:** Runtime renames are session-scoped. The name resets on session restart unless you also set `agentName` in config.
