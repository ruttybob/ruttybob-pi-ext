# AGENTS.md — search-tools

- Registers MCP-based web search, web reader, zread, vision, and Tavily tools.
- MCP clients: `stdio-mcp` (local), `remote-mcp` (HTTP). Server paths in `src/constants.ts`.
- Truncation logic lives in `src/utils/truncation.ts` — max token output per tool.
- Tool registration depends on API key presence (`BRAVE_API_KEY`, `TAVILY_API_KEY`, `ZREAD_API_TOKEN`).
- Cache: `src/utils/cache.ts` — file-based; clear with `/search-tools:cache-clear`.
