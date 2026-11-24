import { randomUUID } from 'node:crypto';
import {
  defineEventHandler, getHeader, readRawBody, setHeader, setResponseStatus, type H3Event,
} from 'h3';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}

export function requestId(event: H3Event): string {
  const supplied = getHeader(event, 'x-request-id');
  return event.context['requestId'] ??= (
    supplied && /^[A-Za-z0-9_.:-]{1,128}$/.test(supplied) ? supplied : randomUUID()
  );
}

export function api<T>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    const id = requestId(event);
    setHeader(event, 'x-request-id', id);
    try {
      const response = await handler(event);
      if (response !== undefined && !(response instanceof Response) && !event.node.res.headersSent) {
        setHeader(event, 'content-type', 'application/json; charset=utf-8');
      }
      return response;
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({ level: 'error', requestId: id, errorType: error instanceof Error ? error.name : 'unknown' }));
      }
      const issue = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL', '서버 오류가 발생했습니다.');
      setHeader(event, 'content-type', 'application/json; charset=utf-8');
      setResponseStatus(event, issue.status);
      return { error: { code: issue.code, message: issue.message, fields: issue.fields, requestId: id } };
    }
  });
}

export function validate<T>(schema: ZodType<T>, payload: unknown, status = 400): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (fields[issue.path.join('.') || '_form'] ??= []).push(issue.message);
  }
  throw new HttpError(status, 'VALIDATION_ERROR', '입력값을 확인하세요.', fields);
}

export async function json<T>(event: H3Event, schema: ZodType<T>, status = 400): Promise<T> {
  if (getHeader(event, 'content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fail(400, 'BAD_REQUEST', 'Content-Type은 application/json이어야 합니다.');
  }
  const raw = await readRawBody(event, false);
  if (raw && raw.byteLength > 64 * 1024) return fail(413, 'PAYLOAD_TOO_LARGE', '요청 크기 제한을 초과했습니다.');
  let payload: unknown;
  try {
    payload = JSON.parse(raw?.toString('utf8') ?? '');
  } catch {
    return fail(400, 'BAD_REQUEST', 'JSON 본문을 확인하세요.');
  }
  return validate(schema, payload, status);
}

export function resourceId(raw: unknown): number {
  const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'BAD_REQUEST', '양의 정수 ID가 필요합니다.');
  return id;
}

export const missing = () => fail(404, 'NOT_FOUND', '요청한 항목을 찾을 수 없습니다.');
