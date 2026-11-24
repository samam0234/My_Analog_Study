import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/auth';
import { database } from '../../../../lib/db';
import { api, json, resourceId } from '../../../../lib/http';
import { editPost } from '../../../../lib/posts';
import { patchSchema } from '../../../../lib/schemas';
import { invalidateList } from '../../../../lib/notifications';
export default api(async (event) => {
  const { id } = await requireUser(event);
  const data = await editPost(await database(), resourceId(getRouterParam(event, 'id')), id, await json(event, patchSchema));
  invalidateList();
  return { data };
});
