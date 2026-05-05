/**
 * Stub-модуль для @mariozechner/pi-ai.
 */

import { Type } from "@sinclair/typebox";

export interface Message {
	role: string;
	content: string | { type: string; text: string }[];
	[key: string]: unknown;
}

// ВНИМАНИЕ: Message дублирован в stubs/@mariozechner/pi-coding-agent.ts.
// При изменении структуры — обновить оба файла одновременно.

/** Конструктор JSON Schema enum из строковых литералов. */
export function StringEnum<T extends string[]>(values: [...T]) {
	return Type.Union(values.map((v) => Type.Literal(v)));
}

// --- Типы для pi-auto-rename ---

export interface TextContent {
	type: "text";
	text: string;
}

export interface Api {}

export interface Model<T extends Api = Api> {
	provider: string;
	id: string;
	reasoning?: string;
}

export interface CompletionResponse {
	stopReason: string;
	errorMessage?: string;
	content: { type: string; text: string }[];
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		cost: { total: number };
	};
}

/** Тип контекста для complete() — alias CompletionOptions */
export type Context = CompletionOptions;

/** Ответ от complete() с usage-статистикой */
export type AssistantMessage = CompletionResponse;

export interface UserMessage {
	role: string;
	content: string | TextContent[];
	timestamp: number;
}

export interface CompletionOptions {
	systemPrompt?: string;
	messages: UserMessage[];
}

export interface CompletionRequestOptions {
	apiKey?: string;
	headers?: Record<string, string>;
	maxTokens?: number;
	reasoning?: string;
	signal?: AbortSignal;
}

/**
 * Stub для getModel() — возвращает объект Model с переданными provider/id.
 */
export function getModel(provider: string, id: string): Model {
	return { provider, id };
}

/**
 * Stub для complete() — возвращает фиксированный ответ.
 * В тестах можно переопределить через vi.mock.
 */
export async function complete(
	_model: Model,
	_options: CompletionOptions,
	_requestOptions?: CompletionRequestOptions,
): Promise<AssistantMessage> {
	return {
		stopReason: "end_turn",
		content: [{ type: "text", text: "Test Session Name" }],
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { total: 0 },
		},
	};
}

/**
 * Stub для completeSimple() — делегирует к complete().
 */
export async function completeSimple(
	model: Model,
	context: CompletionOptions,
	options?: CompletionRequestOptions,
): Promise<AssistantMessage> {
	return complete(model, context, options);
}
