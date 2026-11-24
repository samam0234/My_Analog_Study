import { z } from 'zod';
import { commentSchema, loginSchema, patchSchema, postSchema, signupSchema } from './schemas';

const string = { type: 'string' };
const integer = { type: 'integer' };
const nullable = { type: ['string', 'null'] };
const utc = { type: 'string', format: 'date-time' };
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const array = (items: unknown) => ({ type: 'array', items });
const content = (schema: unknown) => ({ 'application/json': { schema } });
const signup = z.toJSONSchema(signupSchema, { io: 'input' });
const login = z.toJSONSchema(loginSchema, { io: 'input' });
const post = z.toJSONSchema(postSchema, { io: 'input' });
const patch = z.toJSONSchema(patchSchema, { io: 'input' });
const comment = z.toJSONSchema(commentSchema, { io: 'input' });
const commonRequestId = { 'X-Request-Id': { schema: string } };
const id = { name: 'id', in: 'path', required: true, schema: { ...integer, minimum: 1 } };
const pagination = [
  { name: 'page', in: 'query', schema: { ...integer, default: 1, minimum: 1 } },
  { name: 'limit', in: 'query', description: '50을 초과하면 50을 적용합니다.', schema: { ...integer, default: 10, minimum: 1 } },
];
const postQuery = [
  ...pagination,
  { name: 'q', in: 'query', schema: { ...string, maxLength: 200 } },
  { name: 'sort', in: 'query', schema: { ...string, enum: ['createdAt', '-createdAt', '-commentCount'], default: '-createdAt' } },
];
const data = (schema: unknown) => object({ data: schema });
const listing = (name: string) => object({ data: array(ref(name)), meta: ref('PageMeta') });

function operation(summary: string, status: number, options: {
  secured?: boolean; body?: object; result?: unknown; parameters?: object[]; location?: boolean;
} = {}) {
  const headers = options.location ? { ...commonRequestId, Location: { schema: string } } : commonRequestId;
  return {
    summary,
    ...(options.secured ? { security: [{ bearerAuth: [] }, { cookieAuth: [] }] } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: { required: true, content: content(options.body) } } : {}),
    responses: {
      [status]: { description: '성공', headers, ...(options.result ? { content: content(options.result) } : {}) },
      default: { description: '공통 오류', headers: commonRequestId, content: content(ref('Error')) },
    },
  };
}

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Analog Board API', version: '1.0.0' },
  paths: {
    '/health': { get: operation('프로세스 상태', 200, { result: object({ status: string }) }) },
    '/api/auth/signup': { post: operation('회원가입', 201, { body: signup, result: data(ref('User')) }) },
    '/api/auth/login': { post: operation('로그인', 200, { body: login, result: data(object({ user: ref('User'), accessToken: string })) }) },
    '/api/auth/logout': { post: operation('로그아웃', 204, { secured: true }) },
    '/api/auth/me': { get: operation('내 계정', 200, { secured: true, result: data(ref('User')) }) },
    '/api/posts': {
      get: operation('게시물 목록', 200, { parameters: postQuery, result: listing('PostSummary') }),
      post: operation('게시물 작성', 201, { secured: true, body: post, result: data(ref('Post')), location: true }),
    },
    '/api/posts/{id}': {
      get: operation('게시물 상세', 200, { parameters: [id], result: data(ref('Post')) }),
      patch: operation('게시물 부분 수정', 200, { parameters: [id], secured: true, body: patch, result: data(ref('Post')) }),
      delete: operation('게시물 삭제', 204, { parameters: [id], secured: true }),
    },
    '/api/posts/{id}/comments': {
      get: operation('댓글 목록', 200, { parameters: [id, ...pagination], result: listing('Comment') }),
      post: operation('댓글 작성', 201, { parameters: [id], secured: true, body: comment, result: data(ref('Comment')) }),
    },
    '/api/comments/{id}': { delete: operation('댓글 삭제', 204, { secured: true, parameters: [id] }) },
    '/api/v2/posts': { get: operation('게시물 목록 v2', 200, {
      parameters: postQuery, result: object({ data: array(ref('PostSummary')), meta: ref('PageMeta'), version: { const: 2 } }),
    }) },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'analog_session' },
    },
    schemas: {
      Author: object({ id: integer, nickname: string }),
      User: { allOf: [ref('Author'), object({ email: { ...string, format: 'email' } })] },
      PostSummary: object({ id: integer, title: string, author: ref('Author'), commentCount: integer, createdAt: utc }),
      Post: { allOf: [ref('PostSummary'), object({ body: string, tags: array(string), updatedAt: utc })] },
      Comment: object({ id: integer, body: string, author: ref('Author'), createdAt: utc }),
      PageMeta: object({ page: integer, limit: integer, total: integer, totalPages: integer, q: string }, ['page', 'limit', 'total', 'totalPages']),
      Error: object({ error: object({ code: string, message: string, requestId: string,
        fields: { type: 'object', additionalProperties: array(string) },
      }, ['code', 'message', 'requestId']) }),
      QuestionHistory: object({ id: integer, question: string, answer: nullable, createdAt: utc }),
    },
  },
};
