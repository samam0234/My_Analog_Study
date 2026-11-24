import type { PostSummary, PageMeta } from '../../shared/contract';
type List = { data: PostSummary[]; meta: PageMeta };
const cache = new Map<string, { value: List; until: number }>();
const listeners = new Set<(id: number) => void>();
let generation = 0;

export async function cachedList(key: string, load: () => Promise<List>): Promise<List> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const version = generation;
  const value = await load();
  if (version === generation) {
    if (cache.size >= 100) cache.clear();
    cache.set(key, { value, until: Date.now() + 5_000 });
  }
  return value;
}

export function invalidateList() {
  generation++;
  cache.clear();
}

export function subscribePosts(listener: (id: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishPost(id: number) {
  for (const listener of listeners) listener(id);
}
