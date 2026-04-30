/**
 * Минимальный мок ExtensionAPI для unit-тестов.
 *
 * Поля-массивы (on, registerTool и т.д.) накапливают вызовы
 * для последующих assert'ов.
 *
 * Хелперы с префиксом `_` — дополнительные методы для тестов,
 * не из настоящего API.
 */

export function createMockExtensionAPI() {
	const calls = {
		on: [] as { event: string; handler: Function }[],
		registerTool: [] as any[],
		registerCommand: [] as { name: string; options: any }[],
		registerShortcut: [] as { shortcut: string; options: any }[],
		registerFlag: [] as { name: string; options: any }[],
		sendMessage: [] as any[],
		sendUserMessage: [] as any[],
		appendEntry: [] as any[],
		setSessionName: [] as string[],
		getModel: [] as any[],
		setModel: [] as any[],
		setThinkingLevel: [] as string[],
		setActiveTools: [] as string[][],
		getAllTools: [] as any[],
		getActiveTools: [] as string[],
	};

	/** Internal state for getters that reflect recent mutations */
	let currentThinkingLevel = "off";

	/** EventEmitter-подобное хранилище обработчиков событий */
	const eventHandlers = new Map<string, Function[]>();

	/** EventEmitter-подобное хранилище для events bus (межрасширённая шина) */
	const busHandlers = new Map<string, Function[]>();
	const busEmitCalls: { channel: string; data: unknown }[] = [];

	const api = {
		on(event: string, handler: Function) {
			calls.on.push({ event, handler });
			if (!eventHandlers.has(event)) eventHandlers.set(event, []);
			eventHandlers.get(event)!.push(handler);
		},

		registerTool(def: any) {
			calls.registerTool.push(def);
		},

		registerCommand(name: string, options: any) {
			calls.registerCommand.push({ name, options });
		},

		registerShortcut(shortcut: string, options: any) {
			calls.registerShortcut.push({ shortcut, options });
		},

		registerFlag(name: string, options: any) {
			calls.registerFlag.push({ name, options });
		},

		registerMessageRenderer(_type: string, _renderer: any) {
			// no-op for tests
		},

		sendMessage(msg: any, opts?: any) {
			calls.sendMessage.push({ msg, opts });
		},

		sendUserMessage(content: any, opts?: any) {
			calls.sendUserMessage.push({ content, opts });
		},

		appendEntry(type: string, data?: any) {
			calls.appendEntry.push({ type, data });
		},

		getSessionName(): string {
			return (api as any)._sessionName ?? "";
		},

		setSessionName(name: string) {
			calls.setSessionName.push(name);
			(api as any)._sessionName = name;
		},

		setModel: async (_model: any) => true,
		setThinkingLevel(level: string) {
			calls.setThinkingLevel.push(level);
			currentThinkingLevel = level;
		},
		setActiveTools: (_names: string[]) => {},
		getAllTools: () => [],
		getActiveTools: () => [],
		getThinkingLevel: () => currentThinkingLevel,
		getFlag: () => undefined,
		events: {
			on(channel: string, handler: (data: unknown) => void) {
				if (!busHandlers.has(channel)) busHandlers.set(channel, []);
				busHandlers.get(channel)!.push(handler);
			},
			emit(channel: string, data: unknown) {
				busEmitCalls.push({ channel, data });
				const handlers = busHandlers.get(channel) ?? [];
				for (const h of handlers) h(data);
			},
		},

		// --- Хелперы для тестов (не из настоящего API) ---

		/** Получить все вызовы pi.on() для проверки */
		_calls: calls,

		/** Получить последний обработчик события по имени */
		_getHandler(event: string): Function | undefined {
			const handlers = eventHandlers.get(event);
			return handlers?.[handlers.length - 1];
		},

		/** Получить ВСЕ обработчики события */
		_getHandlers(event: string): Function[] {
			return eventHandlers.get(event) ?? [];
		},

		/** Программно вызвать все обработчики события и вернуть последний результат */
		async _fire(event: string, ...args: any[]): Promise<any> {
			const handlers = eventHandlers.get(event) ?? [];
			let lastResult: any;
			for (const h of handlers) {
				lastResult = await h(...args);
			}
			return lastResult;
		},

		/** Получить все bus-emit вызовы */
		_busEmitCalls: busEmitCalls,

		/** Получить bus-emit вызовы по каналу */
		_busEmits(channel: string) {
			return busEmitCalls.filter(e => e.channel === channel);
		},

		/** Программно эмитнуть событие в bus */
		_busEmit(channel: string, data: unknown) {
			const handlers = busHandlers.get(channel) ?? [];
			for (const h of handlers) h(data);
		},
	} as any;

	return api;
}
