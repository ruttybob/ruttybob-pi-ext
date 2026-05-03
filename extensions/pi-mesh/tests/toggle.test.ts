/**
 * Tests for /mesh-tools toggle command.
 *
 * Tests verify behavior through the toggleOn/toggleOff functions:
 * - state.registered is updated correctly
 * - tools are activated/deactivated via setActiveTools
 * - feed events are logged
 * - reservations are released on OFF
 * - watcher is stopped/started
 * - mesh_context is injected on ON
 */

import { describe, it, expect } from "bun:test";
import { toggleOff, toggleOn, MESH_TOOL_NAMES } from "../toggle.js";
import type { MeshState } from "../types.js";
import type { ToggleDeps, ToggleResult } from "../toggle.js";

// =============================================================================
// Helpers
// =============================================================================

function makeState(registered: boolean = true): MeshState {
  return {
    agentName: registered ? "agent-2" : "",
    agentType: "agent",
    registered,
    watcher: null,
    watcherRetries: 0,
    watcherRetryTimer: null,
    watcherDebounceTimer: null,
    reservations: [],
    chatHistory: new Map(),
    unreadCounts: new Map(),
    broadcastHistory: [],
    model: "",
    gitBranch: undefined,
    isHuman: true,
    session: { toolCalls: 0, tokens: 0, filesModified: [] },
    activity: { lastActivityAt: new Date().toISOString() },
    statusMessage: undefined,
    customStatus: false,
    registryFlushTimer: null,
    sessionStartedAt: new Date().toISOString(),
    hookState: {},
  };
}

function makeDeps(state: MeshState, overrides?: Partial<ToggleDeps>): ToggleDeps {
  return {
    pi: {
      getActiveTools: () => [
        "read", "bash", "edit", "write",
        ...MESH_TOOL_NAMES,
      ],
      setActiveTools: () => {},
      sendMessage: () => {},
    } as any,

    state,
    dirs: { base: "/tmp/mesh", registry: "/tmp/mesh/registry", inbox: "/tmp/mesh/inbox" },

    ctx: {
      ui: {
        setStatus: () => {},
      },
    } as any,

    deliverMessage: () => {},
    updateStatusBar: () => {},
    onRegistered: undefined,
    startHooksPollTimer: undefined,

    // Side-effect functions — no-ops by default
    unregister: () => {},
    stopWatcher: () => {},
    startWatcher: () => {},
    register: () => true,
    removeAllReservations: () => [],
    logEvent: () => {},
    pruneFeed: () => {},
    getActiveAgents: () => [],
    extractFolder: () => "test-project",

    ...overrides,
  };
}

// =============================================================================
// Tests: Toggle OFF
// =============================================================================

describe("toggleOff", () => {
  it("returns null when already unregistered", () => {
    const state = makeState(false);
    const deps = makeDeps(state);
    const result = toggleOff(deps);
    expect(result).toBeNull();
  });

  it("deregisters from mesh, stops watcher, deactivates tools", () => {
    const state = makeState(true);
    const activeToolsCalls: string[][] = [];
    const setStatusCalls: Array<[string, string | undefined]> = [];
    const logEventCalls: Array<{ dirs: any; name: string; type: string }> = [];

    const deps = makeDeps(state, {
      unregister(s) { s.registered = false; },
      stopWatcher() {},
      removeAllReservations: () => ["src/auth/"],
      logEvent: (dirs: any, name: string, type: string) => { logEventCalls.push({ dirs, name, type }); },
    });

    // Override pi methods that are called
    deps.pi.setActiveTools = (tools: string[]) => { activeToolsCalls.push(tools as string[]); };
    (deps.ctx.ui as any).setStatus = (key: string, val: string | undefined) => { setStatusCalls.push([key, val]); };

    const result = toggleOff(deps);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(false);
    expect(result!.message).toContain("Left mesh");
    expect(result!.message).toContain("Released 1 reservation(s)");

    // Tools should have mesh tools removed
    expect(activeToolsCalls).toHaveLength(1);
    expect(activeToolsCalls[0]).not.toContain("mesh_peers");
    expect(activeToolsCalls[0]).not.toContain("mesh_send");
    expect(activeToolsCalls[0]).not.toContain("mesh_reserve");
    expect(activeToolsCalls[0]).not.toContain("mesh_release");
    expect(activeToolsCalls[0]).not.toContain("mesh_manage");
    // Non-mesh tools preserved
    expect(activeToolsCalls[0]).toContain("read");
    expect(activeToolsCalls[0]).toContain("bash");

    // Status bar cleared
    expect(setStatusCalls).toHaveLength(1);
    expect(setStatusCalls[0]).toEqual(["mesh", undefined]);

    // Feed logged leave event
    expect(logEventCalls).toHaveLength(1);
    expect(logEventCalls[0].name).toBe("agent-2");
    expect(logEventCalls[0].type).toBe("leave");
  });

  it("works with no reservations", () => {
    const state = makeState(true);
    const deps = makeDeps(state, {
      unregister(s) { s.registered = false; },
      removeAllReservations: () => [],
    });
    deps.pi.setActiveTools = () => {};
    (deps.ctx.ui as any).setStatus = () => {};

    const result = toggleOff(deps);

    expect(result).not.toBeNull();
    expect(result!.message).not.toContain("reservation");
  });
});

// =============================================================================
// Tests: Toggle ON
// =============================================================================

describe("toggleOn", () => {
  it("returns null when already registered", () => {
    const state = makeState(true);
    const deps = makeDeps(state);
    const result = toggleOn(deps);
    expect(result).toBeNull();
  });

  it("registers, starts watcher, activates tools, injects context", () => {
    const state = makeState(false);
    const activeToolsCalls: string[][] = [];
    const sendMessageCalls: any[] = [];
    let startWatcherCalled = false;
    let updateStatusBarCalled = false;
    const logEventCalls: Array<{ dirs: any; name: string; type: string }> = [];

    const deps = makeDeps(state, {
      register(s) {
        s.registered = true;
        s.agentName = "agent-3";
        return true;
      },
      startWatcher: () => { startWatcherCalled = true; },
      logEvent: (dirs: any, name: string, type: string) => { logEventCalls.push({ dirs, name, type }); },
      setActiveTools: (tools: string[]) => { activeToolsCalls.push(tools); },
      sendMessage: (msg: any, opts: any) => { sendMessageCalls.push({ msg, opts }); },
      updateStatusBar: () => { updateStatusBarCalled = true; },
    });

    deps.pi.setActiveTools = (tools: string[]) => { activeToolsCalls.push(tools as string[]); };
    deps.pi.sendMessage = (msg: any, opts: any) => { sendMessageCalls.push({ msg, opts }); };

    const result = toggleOn(deps);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
    expect(result!.message).toContain("Joined mesh as agent-3");

    // Watcher started
    expect(startWatcherCalled).toBe(true);

    // Status bar updated
    expect(updateStatusBarCalled).toBe(true);

    // Feed logged join event
    expect(logEventCalls).toHaveLength(1);
    expect(logEventCalls[0].name).toBe("agent-3");
    expect(logEventCalls[0].type).toBe("join");

    // Tools should include all mesh tools
    expect(activeToolsCalls).toHaveLength(1);
    for (const name of MESH_TOOL_NAMES) {
      expect(activeToolsCalls[0]).toContain(name);
    }
    // Existing tools preserved
    expect(activeToolsCalls[0]).toContain("read");
    expect(activeToolsCalls[0]).toContain("bash");

    // Context message injected
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].msg.customType).toBe("mesh_context");
    expect(sendMessageCalls[0].msg.content).toContain("agent-3");
    expect(sendMessageCalls[0].msg.display).toBe(false);
  });

  it("returns failure when register fails", () => {
    const state = makeState(false);
    const deps = makeDeps(state, {
      register: () => false,
    });

    const result = toggleOn(deps);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(false);
    expect(result!.message).toContain("Failed to rejoin");
  });
});

// =============================================================================
// Tests: Edge cases
// =============================================================================

describe("toggle edge cases", () => {
  it("double toggle OFF is noop (second returns null)", () => {
    const state = makeState(true);
    const deps = makeDeps(state, {
      unregister(s) { s.registered = false; },
    });
    deps.pi.setActiveTools = () => {};
    (deps.ctx.ui as any).setStatus = () => {};

    const first = toggleOff(deps);
    expect(first).not.toBeNull();
    expect(first!.enabled).toBe(false);

    // Second toggle OFF — state.registered is already false
    const second = toggleOff(deps);
    expect(second).toBeNull();
  });

  it("double toggle ON is noop (second returns null)", () => {
    const state = makeState(false);
    const deps = makeDeps(state, {
      register(s) { s.registered = true; s.agentName = "agent-1"; return true; },
    });
    deps.pi.setActiveTools = () => {};
    deps.pi.sendMessage = () => {};

    const first = toggleOn(deps);
    expect(first).not.toBeNull();
    expect(first!.enabled).toBe(true);

    // Second toggle ON — state.registered is already true
    const second = toggleOn(deps);
    expect(second).toBeNull();
  });

  it("toggle ON includes peers in context message", () => {
    const state = makeState(false);
    const sendMessageCalls: any[] = [];

    const deps = makeDeps(state, {
      register(s) { s.registered = true; s.agentName = "agent-1"; return true; },
      getActiveAgents: () => [{ name: "agent-2" }, { name: "agent-3" }],
    });
    deps.pi.setActiveTools = () => {};
    deps.pi.sendMessage = (msg: any, opts: any) => { sendMessageCalls.push({ msg, opts }); };

    toggleOn(deps);

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].msg.content).toContain("agent-2");
    expect(sendMessageCalls[0].msg.content).toContain("agent-3");
    expect(sendMessageCalls[0].msg.content).toContain("Peers:");
  });

  it("toggle ON with no peers does not mention peers", () => {
    const state = makeState(false);
    const sendMessageCalls: any[] = [];

    const deps = makeDeps(state, {
      register(s) { s.registered = true; s.agentName = "agent-1"; return true; },
      getActiveAgents: () => [],
    });
    deps.pi.setActiveTools = () => {};
    deps.pi.sendMessage = (msg: any, opts: any) => { sendMessageCalls.push({ msg, opts }); };

    toggleOn(deps);

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].msg.content).not.toContain("Peers:");
  });
});
