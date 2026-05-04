/**
 * Pi Mesh - Toggle Command Logic
 *
 * Encapsulates ON/OFF toggle for mesh participation.
 * All side-effecting operations are injected via ToggleDeps for testability.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MeshState, Dirs, FeedEventType } from "./types.js";

/**
 * Names of all mesh tools — used for setActiveTools() filtering.
 */
export const MESH_TOOL_NAMES = [
  "mesh_peers",
  "mesh_send",
  "mesh_reserve",
  "mesh_release",
  "mesh_manage",
];

export interface ToggleDeps {
  pi: ExtensionAPI;
  state: MeshState;
  dirs: Dirs;
  ctx: ExtensionCommandContext;
  deliverMessage: (msg: any) => void;
  updateStatusBar: (ctx: ExtensionCommandContext) => void;
  onRegistered?: (state: MeshState, ctx: ExtensionCommandContext, actions: any) => Promise<void>;
  startHooksPollTimer?: (ctx: ExtensionCommandContext) => Promise<void>;

  // Injected side-effect functions for testability
  unregister: (state: MeshState, dirs: Dirs) => void;
  stopWatcher: (state: MeshState) => void;
  startWatcher: (state: MeshState, dirs: Dirs, deliverFn: (msg: any) => void) => void;
  register: (state: MeshState, dirs: Dirs, ctx: ExtensionCommandContext) => boolean;
  removeAllReservations: (state: MeshState, dirs: Dirs, ctx: ExtensionCommandContext) => string[];
  logEvent: (dirs: Dirs, agentName: string, eventType: FeedEventType, target?: string, preview?: string) => void;
  pruneFeed: (dirs: Dirs, retention: number) => void;
  getActiveAgents: (state: MeshState, dirs: Dirs) => any[];
  extractFolder: (cwd: string) => string;
  setActiveTools?: (tools: string[]) => void;
  sendMessage?: (msg: any, opts: any) => void;
}

export interface ToggleResult {
  enabled: boolean;
  message: string;
}

/**
 * Toggle mesh participation OFF.
 * Returns the result with status message, or null if already off.
 */
export function toggleOff(deps: ToggleDeps): ToggleResult | null {
  const { pi, state, dirs, ctx } = deps;

  if (!state.registered) return null;

  const releasedPaths = deps.removeAllReservations(state, dirs, ctx);
  deps.stopWatcher(state);
  deps.logEvent(dirs, state.agentName, "leave");
  deps.unregister(state, dirs);

  // Deactivate mesh tools
  const current = pi.getActiveTools() as string[];
  const filtered = current.filter((name) => !MESH_TOOL_NAMES.includes(name));
  pi.setActiveTools(filtered);

  // Clear status bar
  ctx.ui.setStatus("mesh", undefined);

  const releasedInfo =
    releasedPaths.length > 0
      ? ` Released ${releasedPaths.length} reservation(s).`
      : "";

  return {
    enabled: false,
    message: `Left mesh.${releasedInfo}`,
  };
}

/**
 * Toggle mesh participation ON.
 * Returns the result with status message, or null if already on.
 */
export function toggleOn(deps: ToggleDeps): ToggleResult | null {
  const { pi, state, dirs, ctx, deliverMessage, updateStatusBar, onRegistered, startHooksPollTimer } = deps;

  if (state.registered) return null;

  if (!deps.register(state, dirs, ctx)) {
    return {
      enabled: false,
      message: "Failed to rejoin mesh — could not register.",
    };
  }

  deps.startWatcher(state, dirs, deliverMessage);
  updateStatusBar(ctx);
  deps.pruneFeed(dirs, 100);
  deps.logEvent(dirs, state.agentName, "join");

  // Activate mesh tools
  const current = pi.getActiveTools() as string[];
  const merged = Array.from(new Set([...current, ...MESH_TOOL_NAMES]));
  pi.setActiveTools(merged);

  // Lifecycle hooks
  onRegistered?.(state, ctx, {});
  startHooksPollTimer?.(ctx);

  // Inject context message
  const folder = deps.extractFolder(process.cwd());
  const branchPart = state.gitBranch ? ` on ${state.gitBranch}` : "";
  const peers = deps.getActiveAgents(state, dirs);
  const peerList =
    peers.length > 0
      ? ` Peers: ${peers.map((a: any) => a.name).join(", ")}.`
      : "";

  pi.sendMessage(
    {
      customType: "mesh_context",
      content: `You are "${state.agentName}" in ${folder}${branchPart}.${peerList} Use mesh_peers to check who's active, mesh_reserve to claim files, mesh_send to message agents.`,
      display: false,
    },
    { triggerTurn: false }
  );

  return {
    enabled: true,
    message: `Joined mesh as ${state.agentName}.`,
  };
}
