---
name: pi-extension-tester
description: Test pi extensions with vitest by mocking ExtensionAPI, ExtensionContext, pi-ai, and pi-coding-agent. Use when writing unit tests for pi extension modules that depend on the pi SDK.
---

# Pi Extension Tester

## When to Use

When writing unit tests for pi extension code that imports from:
- `@earendil-works/pi-coding-agent` (ExtensionAPI, ExtensionContext, BorderedLoader, etc.)
- `@earendil-works/pi-ai` (complete, Message types)
- `@earendil-works/pi-tui` (Container, Markdown, Text, etc.)

## Procedure

### 1. Create mock helpers in `tests/test-helpers/`

Two reusable mock factories:

**`mock-api.ts`** — `createMockExtensionAPI()`:
- Records all `on()`, `registerTool()`, `registerCommand()`, `registerShortcut()` calls in `_calls` object
- Supports event handler lookup via `_getHandler(event)` and `_getHandlers(event)`
- Supports programmatic event firing via `_fire(event, ...args)` — awaits all handlers, returns last result
- Includes `events` bus mock with `_busEmit()`, `_busEmits(channel)`, `_busEmitCalls`
- Tool management: `_setAllTools(tools)` to set available tools and activate all

**`mock-context.ts`** — `createMockContext(overrides?)` and `createMockCommandContext(overrides?)`:
- Safe defaults: `cwd: "/tmp/test-project"`, `model: { provider: "anthropic", id: "claude-sonnet-4-5" }`
- `ui.custom()` mock: creates a mock theme/tui, calls the factory synchronously with `done()`, resolves the promise
- `modelRegistry.getApiKeyAndHeaders()` returns `{ ok: true, apiKey: "test-key" }`
- `createMockCommandContext` adds `newSession`, `fork`, `switchSession`, `reload`, `sendUserMessage`
- All methods overridable via `overrides` partial

### 2. Mock pi SDK modules with `vi.mock()`

At the top of each test file:

```typescript
// Avoid real LLM calls
vi.mock("@earendil-works/pi-ai", () => ({
  complete: vi.fn().mockResolvedValue({
    stopReason: "end_turn",
    content: [{ type: "text", text: "Mocked response" }],
  }),
}));

// Partial mock — keep utilities, mock UI classes
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    BorderedLoader: class MockBorderedLoader {
      onAbort: (() => void) | null = null;
      signal = { abort: vi.fn() };
    },
  };
});
```

### 3. Mock extension sub-modules for integration tests

For testing `index.ts` (the entry point), mock all sibling modules to isolate the wiring logic:

```typescript
vi.mock("../../extensions/handoff/config.js", () => ({
  loadHandoffConfig: vi.fn().mockReturnValue({}),
  resolveHandoffModel: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../extensions/handoff/args.js", () => ({
  parseHandoffArgs: vi.fn((raw: string, _cwd: string) => {
    const quick = raw.includes("--quick");
    const goal = raw.replace(/--quick/g, "").trim() || "Default goal";
    return { goal, files: [], quick };
  }),
  embedFileReferences: vi.fn((prompt, _files, _cwd) => ({ prompt, embedded: [] })),
}));
```

### 4. Test structure: setup → register → fire

```typescript
async function setup() {
  const pi = createMockExtensionAPI();
  const mod = await import("../../extensions/my-ext/index.js");
  mod.default(pi);  // Call the extension's entry point
  return { pi };
}

describe("registration", () => {
  it("registers /mycommand", async () => {
    const { pi } = await setup();
    expect(pi._calls.registerCommand.some(c => c.name === "mycommand")).toBe(true);
  });
});

describe("event handlers", () => {
  it("handles session_start for reason=new", async () => {
    const { pi } = await setup();
    const ctx = createMockContext({ hasUI: true });
    await pi._fire("session_start", { reason: "new" }, ctx);
    // assert side effects on ctx overrides
  });
});

describe("/mycommand handler", () => {
  it("does X", async () => {
    const { pi } = await setup();
    const notify = vi.fn();
    const ctx = createMockCommandContext({
      ui: { ...createMockContext().ui, notify },
    } as any);
    const cmd = pi._calls.registerCommand.find(c => c.name === "mycommand");
    await cmd.options.handler("arg text", ctx);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("expected"), "info");
  });
});
```

### 5. For pure function tests (no pi SDK deps)

Test directly without mocks. Extract pure functions into separate files (e.g., `session-utils.ts`, `args.ts`) so they can be tested independently:

```typescript
import { describe, it, expect } from "vitest";
import { parseMyArgs } from "../../extensions/my-ext/args.js";

describe("parseMyArgs", () => {
  it("parses --quick flag", () => {
    expect(parseMyArgs("--quick do stuff", "/cwd")).toEqual({
      goal: "do stuff", files: [], quick: true,
    });
  });
});
```

For `node:fs` mocking in pure function tests:

```typescript
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(), existsSync: vi.fn() };
});
```

### 6. Capturing newSession setup calls

When testing that commands correctly persist data via `ctx.newSession({ setup })`:

```typescript
function createCaptureContext() {
  const appendCustomEntry = vi.fn();
  const base = createMockContext();
  const ctx = createMockCommandContext({
    ...base,
    ui: { ...base.ui, custom: async () => ({ type: "prompt", text: "Test prompt" }) },
  } as any);

  // Override newSession to capture setup callback
  (ctx as any).newSession = async (opts: any) => {
    if (opts?.setup) {
      await opts.setup({ appendCustomEntry });
    }
    return { cancelled: false };
  };

  return { ctx, appendCustomEntry };
}
```

## Pitfalls

- **Import with `.js` extension in vi.mock paths**: Use `"../../extensions/my-ext/config.js"` not `.ts` — jiti resolves them.
- **Mock before import**: `vi.mock()` calls are hoisted, but the mock factory must exist at module level. Don't put `vi.mock()` inside `describe` or `it` blocks.
- **createMockContext().ui spread**: When overriding specific ui methods, spread `createMockContext().ui` first to keep defaults: `{ ...createMockContext().ui, notify: vi.fn() }`.
- **`_fire` returns last handler result**: If a handler returns `undefined` (no `return` statement), `_fire` returns `undefined` — don't assert on the return value for void handlers.
- **Mock reset between tests**: Use `vi.fn().mockReturnValueOnce()` for one-off overrides, or reset in `beforeEach`. Module-level `vi.mock()` with `.mockReturnValue()` persists across tests in the same file.
- **`as any` for overrides**: TypeScript won't allow partial overrides on the full context type — use `as any` on the overrides object.
- **Don't mock `node:fs` globally**: Only mock it in test files that test file-reading functions. For integration tests, let the real fs operate on temp directories instead.

## Verification

1. Tests run: `npx vitest run tests/my-ext/` passes
2. Mock API captures calls: `pi._calls.registerCommand` contains expected registrations
3. Event handlers fire correctly: `pi._fire("session_start", event, ctx)` produces expected side effects
4. Command handlers work with mock context: overridden methods (notify, setEditorText) called with expected args
5. Pure function tests work without any pi SDK mocks
