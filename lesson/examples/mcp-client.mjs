import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { BOARD_URL = 'http://localhost:5173', BOARD_TOKEN } = process.env;
if (!BOARD_TOKEN) throw new Error('Set BOARD_TOKEN to a current Board access token.');
const client = new Client({ name: 'analog-study', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', BOARD_URL), {
    requestInit: { headers: { Authorization: 'Bearer ' + BOARD_TOKEN } },
  }));
  console.log(await client.listTools());
  console.log(await client.callTool({ name: 'search_posts', arguments: { q: process.argv[2] || 'Analog' } }));
} finally {
  await client.close();
}
