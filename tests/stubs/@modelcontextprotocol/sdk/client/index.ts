/** Stub @modelcontextprotocol/sdk/client/index.js для тестов */

export class Client {
	constructor(_init: { name: string; version: string }) {}
	async connect(_transport: unknown): Promise<void> {}
	async close(): Promise<void> {}
	async callTool(_request: { name: string; arguments?: Record<string, unknown> }): Promise<unknown> {
		return { content: [] };
	}
}
