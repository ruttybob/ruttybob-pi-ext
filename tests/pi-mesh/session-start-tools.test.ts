// tests/pi-mesh/session-start-tools.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockExtensionAPI } from "../test-helpers/mock-api.js";
import { createMockContext } from "../test-helpers/mock-context.js";

// Мокаем модули с side-эффектами (fs, child_process, etc.)
vi.mock("../../extensions/pi-mesh/config.js", () => ({
	loadConfig: () => ({
		autoRegister: false,
		autoRegisterPaths: [],
		contextMode: "full",
		feedRetention: 20,
		stuckThreshold: 600,
		autoStatus: false,
	}),
	matchesAutoRegisterPath: () => false,
	findPiDir: () => null,
}));

vi.mock("../../extensions/pi-mesh/registry.js", () => ({
	resolveDirs: () => ({
		base: "/tmp/pi-mesh-test",
		registry: "/tmp/pi-mesh-test/registry",
		inbox: "/tmp/pi-mesh-test/inbox",
	}),
	register: () => false,
	unregister: () => {},
	getActiveAgents: () => [],
	getAllAgents: () => [],
	extractFolder: () => "test-project",
	invalidateAgentsCache: () => {},
	updateRegistration: () => {},
	flushActivityToRegistry: () => {},
	getConflicts: () => [],
	pathMatchesReservation: () => false,
	computeStatus: () => ({ status: "active" }),
	formatDuration: () => "0s",
	isProcessAlive: () => false,
	generateName: () => "agent-1",
	getRegistrationPath: () => "/tmp/agent-1.json",
	renameAgent: () => ({ success: false, error: "not_registered" }),
}));

vi.mock("../../extensions/pi-mesh/messaging.js", () => ({
	startWatcher: () => {},
	stopWatcher: () => {},
	validateRecipient: () => ({ valid: true }),
	sendMessage: () => {},
	broadcastMessage: () => [],
	processInbox: () => {},
	recoverWatcherIfNeeded: () => {},
	clearInbox: () => 0,
}));

vi.mock("../../extensions/pi-mesh/feed.js", () => ({
	logEvent: () => {},
	pruneFeed: () => {},
	readEvents: () => [],
	formatEvent: () => "",
}));

vi.mock("../../extensions/pi-mesh/tracking.js", () => ({
	onToolCall: () => {},
	onToolResult: () => {},
	cleanup: () => {},
}));

vi.mock("../../extensions/pi-mesh/reservations.js", () => ({
	addReservation: () => ({ valid: true }),
	removeReservation: () => false,
	removeAllReservations: () => [],
}));

vi.mock("../../extensions/pi-mesh/overlay.js", () => ({
	MeshOverlay: class {},
}));

vi.mock("node:fs", () => ({
	...require("node:fs"),
	existsSync: () => false,
	mkdirSync: () => {},
	readdirSync: () => [],
	readFileSync: () => "{}",
	writeFileSync: () => {},
	unlinkSync: () => {},
	rmSync: () => {},
}));

vi.mock("node:child_process", () => ({
	execSync: () => "",
}));

// Мокаем truncateToWidth и wrapTextWithAnsi из pi-tui (через stub)
vi.mock("@mariozechner/pi-tui", () => ({
	truncateToWidth: (s: string) => s,
	wrapTextWithAnsi: (s: string, _w: number) => [s],
}));

describe("session_start — mesh tools in activeTools", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("deactivates mesh tools when autoRegister is false", async () => {
		const pi = createMockExtensionAPI();

		// Отслеживаем вызовы setActiveTools
		const setActiveToolsCalls: string[][] = [];
		pi.setActiveTools = (names: string[]) => {
			setActiveToolsCalls.push([...names]);
		};

		// Имитируем, что mesh-инструменты уже в activeTools (как pi делает при registerTool)
		const allTools = [
			"read", "bash", "edit", "write",
			"mesh_peers", "mesh_send", "mesh_reserve", "mesh_release", "mesh_manage",
		];
		pi.getActiveTools = () => [...allTools];

		// Загружаем расширение
		const mod = await import("../../extensions/pi-mesh/index.js");
		mod.default(pi);

		// Вызываем session_start с hasUI=true, но autoRegister=false
		const ctx = createMockContext({ hasUI: true });
		await pi._fire("session_start", {}, ctx);

		// Проверяем: setActiveTools вызван без mesh-инструментов
		expect(setActiveToolsCalls.length).toBeGreaterThanOrEqual(1);
		const lastCall = setActiveToolsCalls[setActiveToolsCalls.length - 1];

		expect(lastCall).not.toContain("mesh_peers");
		expect(lastCall).not.toContain("mesh_send");
		expect(lastCall).not.toContain("mesh_reserve");
		expect(lastCall).not.toContain("mesh_release");
		expect(lastCall).not.toContain("mesh_manage");

		// Обычные инструменты сохранены
		expect(lastCall).toContain("read");
		expect(lastCall).toContain("bash");
		expect(lastCall).toContain("edit");
		expect(lastCall).toContain("write");
	});

	it("does NOT deactivate mesh tools when autoRegister is true and register succeeds", async () => {
		// Пересоздаём мок config с autoRegister: true
		vi.doMock("../../extensions/pi-mesh/config.js", () => ({
			loadConfig: () => ({
				autoRegister: true,
				autoRegisterPaths: [],
				contextMode: "none",
				feedRetention: 20,
				stuckThreshold: 600,
				autoStatus: false,
			}),
			matchesAutoRegisterPath: () => false,
			findPiDir: () => "/tmp/.pi",
		}));

		vi.doMock("../../extensions/pi-mesh/registry.js", () => ({
			resolveDirs: () => ({
				base: "/tmp/pi-mesh-test",
				registry: "/tmp/pi-mesh-test/registry",
				inbox: "/tmp/pi-mesh-test/inbox",
			}),
			register: (state: any) => {
				state.registered = true;
				state.agentName = "agent-1";
				return true;
			},
			unregister: () => {},
			getActiveAgents: () => [],
			getAllAgents: () => [],
			extractFolder: () => "test-project",
			invalidateAgentsCache: () => {},
			updateRegistration: () => {},
			flushActivityToRegistry: () => {},
			getConflicts: () => [],
			pathMatchesReservation: () => false,
			computeStatus: () => ({ status: "active" }),
			formatDuration: () => "0s",
			isProcessAlive: () => false,
			generateName: () => "agent-1",
			getRegistrationPath: () => "/tmp/agent-1.json",
			renameAgent: () => ({ success: false, error: "not_registered" }),
		}));

		// Theme mock нужен для updateStatusBar при успешной регистрации
		const mockTheme = {
			fg: (_c: string, t: string) => t,
			bold: (t: string) => t,
			success: (t: string) => t,
			dim: (t: string) => t,
			warning: (t: string) => t,
			accent: (t: string) => t,
			muted: (t: string) => t,
		};

		vi.doMock("@mariozechner/pi-tui", () => ({
			truncateToWidth: (s: string) => s,
			wrapTextWithAnsi: (s: string, _w: number) => [s],
		}));

		const pi2 = createMockExtensionAPI();

		const setActiveToolsCalls: string[][] = [];
		pi2.setActiveTools = (names: string[]) => {
			setActiveToolsCalls.push([...names]);
		};
		pi2.getActiveTools = () => [
			"read", "bash", "edit", "write",
			"mesh_peers", "mesh_send", "mesh_reserve", "mesh_release", "mesh_manage",
		];

		const mod2 = await import("../../extensions/pi-mesh/index.js");
		mod2.default(pi2);

		const ctx2 = createMockContext({ hasUI: true });
		(ctx2 as any).ui.theme = mockTheme;
		await pi2._fire("session_start", {}, ctx2);

		// При успешной регистрации setActiveTools НЕ должен вызываться
		expect(setActiveToolsCalls).toHaveLength(0);
	});
});
