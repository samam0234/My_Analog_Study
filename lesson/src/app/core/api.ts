import type { ApiError } from '../../shared/contract';

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly problem?: ApiError) {
    super(problem?.message || '요청에 실패했습니다 (' + status + ').');
  }
}

export async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const result = await response.json().catch(() => undefined) as { error?: ApiError } | undefined;
    throw new ApiFailure(response.status, result?.error);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const explain = (error: unknown) => error instanceof Error ? error.message : '요청을 완료할 수 없습니다.';
