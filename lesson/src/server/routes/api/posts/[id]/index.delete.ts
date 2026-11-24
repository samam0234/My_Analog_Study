import { getRouterParam, sendNoContent } from 'h3';
import { requireUser } from '../../../../lib/auth';
import { database } from '../../../../lib/db';
import { api, resourceId } from '../../../../lib/http';
import { removeItem } from '../../../../lib/posts';
import { invalidateList } from '../../../../lib/notifications';
export default api(async (event) => {
  const { id } = await requireUser(event);
  await removeItem(await database(), 'posts', resourceId(getRouterParam(event, 'id')), id);
  invalidateList();
  return sendNoContent(event);
});
