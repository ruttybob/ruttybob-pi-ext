/**
 * Типы для side-agents.
 *
 * Все типы, интерфейсы, константы — без побочных эффектов.
 */

export type AgentStatus =
	| "allocating_worktree"
	| "spawning_tmux"
	| "running"
	| "waiting_user"
	| "done"
	| "failed"
	| "crashed";

export const ALL_AGENT_STATUSES: AgentStatus[] = [
	"allocating_worktree",
	"spawning_tmux",
	"running",
	"waiting_user",
	"failed",
	"crashed",
];

export const DEFAULT_WAIT_STATES: AgentStatus[] = ["waiting_user", "failed", "crashed"];

export type AgentRecord = {
	id: string;
	parentSessionId?: string;
	childSessionId?: string;
	tmuxSession?: string;
	tmuxWindowId?: string;
	tmuxWindowIndex?: number;
	worktreePath?: string;
	branch?: string;
	model?: string;
	task: string;
	status: AgentStatus;
	startedAt: string;
	updatedAt: string;
	finishedAt?: string;
	runtimeDir?: string;
	logPath?: string;
	promptPath?: string;
	exitFile?: string;
	exitCode?: number;
	error?: string;
	warnings?: string[];
};

export type RegistryFile = {
	version: 1;
	agents: Record<string, AgentRecord>;
};

export type CommandResult = {
	ok: boolean;
	status: number | null;
	stdout: string;
	stderr: string;
	error?: string;
};

export type AllocateWorktreeResult = {
	worktreePath: string;
	slotIndex: number;
	branch: string;
	warnings: string[];
};

export type StartAgentParams = {
	task: string;
	branchHint?: string;
	model?: string;
	includeSummary: boolean;
};

export type StartAgentResult = {
	id: string;
	tmuxWindowId: string;
	tmuxWindowIndex: number;
	worktreePath: string;
	branch: string;
	warnings: string[];
	prompt: string;
};

export type PrepareRuntimeDirResult = {
	runtimeDir: string;
	archivedRuntimeDir?: string;
	warning?: string;
};

export type ExitMarker = {
	exitCode?: number;
	finishedAt?: string;
};

export type StatusTransitionNotice = {
	id: string;
	fromStatus: AgentStatus;
	toStatus: AgentStatus;
	tmuxWindowIndex?: number;
};

export type AgentStatusSnapshot = {
	status: AgentStatus;
	tmuxWindowIndex?: number;
};

export type WorktreeSlot = {
	index: number;
	path: string;
};

export type OrphanWorktreeLock = {
	worktreePath: string;
	lockPath: string;
	lockAgentId?: string;
	lockPid?: number;
	lockTmuxWindowId?: string;
	blockers: string[];
};

export type OrphanWorktreeLockScan = {
	reclaimable: OrphanWorktreeLock[];
	blocked: OrphanWorktreeLock[];
};

export type RefreshRuntimeResult = {
	removeFromRegistry: boolean;
};

export type ThemeForeground = {
	fg: (role: "warning" | "muted" | "accent" | "error", text: string) => string;
};

export const REGISTRY_VERSION = 1;
export const CHILD_LINK_ENTRY_TYPE = "side-agent-link";
export const STATUS_UPDATE_MESSAGE_TYPE = "side-agent-status";
export const PROMPT_UPDATE_MESSAGE_TYPE = "side-agent-prompt";
export const STATUS_KEY = "side-agents";
export const TASK_PREVIEW_MAX_CHARS = 220;
export const BACKLOG_LINE_MAX_CHARS = 240;
export const BACKLOG_TOTAL_MAX_CHARS = 2400;
export const TMUX_BACKLOG_CAPTURE_LINES = 300;

export const ENV_STATE_ROOT = "PI_SIDE_AGENTS_ROOT";
export const ENV_AGENT_ID = "PI_SIDE_AGENT_ID";
export const ENV_PARENT_SESSION = "PI_SIDE_PARENT_SESSION";
export const ENV_PARENT_REPO = "PI_SIDE_PARENT_REPO";
export const ENV_RUNTIME_DIR = "PI_SIDE_RUNTIME_DIR";
