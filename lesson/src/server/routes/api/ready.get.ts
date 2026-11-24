import { api } from '../../lib/http';
import { database } from '../../lib/db';
export default api(async () => {
  await (await database()).raw('select 1');
  return { data: { status: 'ok' } };
});
