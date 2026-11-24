import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { database } from './db';
import { listPosts } from './posts';

export function boardMcp() {
  const server = new McpServer({ name: 'analog-board', version: '1.0.0' });
  server.registerTool('search_posts', {
    description: '공개 게시판에서 제목과 본문으로 글을 검색합니다.',
    inputSchema: { q: z.string().trim().min(1).max(200) },
  }, async ({ q }) => {
    const { data } = await listPosts(await database(), { q, page: 1, limit: 5, sort: '-createdAt' });
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  });
  return server;
}
