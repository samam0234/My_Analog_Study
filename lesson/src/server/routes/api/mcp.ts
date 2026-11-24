import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getHeader, toWebRequest } from 'h3';
import { requireUser } from '../../lib/auth';
import { api, fail } from '../../lib/http';
import { boardMcp } from '../../lib/mcp';

export default api(async (event) => {
  if (event.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'MCP 실습은 POST 요청을 사용합니다.');
  if (!getHeader(event, 'authorization')?.startsWith('Bearer ')) {
    return fail(401, 'UNAUTHORIZED', 'Bearer 토큰이 필요합니다.');
  }
  await requireUser(event);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = boardMcp();
  await server.connect(transport);
  try {
    return await transport.handleRequest(toWebRequest(event));
  } finally {
    await server.close();
  }
});
