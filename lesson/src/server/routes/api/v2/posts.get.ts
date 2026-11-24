import { getQuery, setHeader } from 'h3';
import { api, validate } from '../../../lib/http';
import { database } from '../../../lib/db';
import { listPosts } from '../../../lib/posts';
import { listSchema } from '../../../lib/schemas';
import { cachedList } from '../../../lib/notifications';
export default api(async (event) => {
  const query = validate(listSchema, getQuery(event));
  const started = performance.now();
  const result = await cachedList(JSON.stringify(query), async () => listPosts(await database(), query));
  setHeader(event, 'server-timing', 'posts;dur=' + (performance.now() - started).toFixed(2));
  return { ...result, version: 2 };
});
