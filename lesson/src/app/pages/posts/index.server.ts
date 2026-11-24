import type { PageServerLoad } from '@analogjs/router';
import type { PageMeta, PostSummary } from '../../../shared/contract';

export async function load({ event, fetch }: PageServerLoad) {
  const incoming = new URL(event.path, 'http://localhost');
  const query = new URLSearchParams();
  for (const key of ['q', 'page', 'limit', 'sort']) {
    const value = incoming.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  try {
    const result = await fetch<{ data: PostSummary[]; meta: PageMeta }>('/api/posts?' + query.toString());
    return { result };
  } catch {
    return { issue: '목록을 불러오지 못했습니다. 검색 조건을 확인하고 다시 시도하세요.' };
  }
}
