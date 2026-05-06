import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../extensions/search-tools/src/config.js';
import { createRemoteMcpClient } from '../../extensions/search-tools/src/client/remote-mcp.js';
import { MCP_SERVER_PATHS } from '../../extensions/search-tools/src/constants.js';
import { createWebSearchService } from '../../extensions/search-tools/src/services/web-search.js';
import { createWebReaderService } from '../../extensions/search-tools/src/services/web-reader.js';
import { createZreadService } from '../../extensions/search-tools/src/services/zread.js';

const hasApiKey = Boolean(process.env.ZAI_API_KEY);

/** Live-тесты пропускаются без ZAI_API_KEY */
const maybeDescribe = hasApiKey ? describe : describe.skip;

maybeDescribe('live Z.AI MCP integration', () => {
  const config = loadConfig(process.env);

  it('searches the web', async () => {
    const service = createWebSearchService(createRemoteMcpClient(config, MCP_SERVER_PATHS.search));
    const result = await service.search('example domain', 3);

    expect(result.items.length).toBeGreaterThan(0);
  }, 60_000);

  it('reads a web page', async () => {
    const service = createWebReaderService(createRemoteMcpClient(config, MCP_SERVER_PATHS.reader));
    const result = await service.read('https://example.com');

    expect(JSON.stringify(result.payload).toLowerCase()).toContain('example');
  }, 60_000);

  it('searches repository docs with zread', async () => {
    const service = createZreadService(createRemoteMcpClient(config, MCP_SERVER_PATHS.zread));
    const result = await service.searchDoc('vercel/ai', 'installation');

    expect(result.items.length).toBeGreaterThan(0);
  }, 60_000);

  it('gets repository structure with zread', async () => {
    const service = createZreadService(createRemoteMcpClient(config, MCP_SERVER_PATHS.zread));
    const result = await service.getRepoStructure('vercel/ai');

    expect(JSON.stringify(result.payload).toLowerCase()).toContain('readme');
  }, 60_000);

  it('reads repo content with zread', async () => {
    const service = createZreadService(createRemoteMcpClient(config, MCP_SERVER_PATHS.zread));
    const result = await service.readFile('vercel/ai', 'package.json');

    expect(JSON.stringify(result.payload).toLowerCase()).toContain('package');
  }, 60_000);
});
