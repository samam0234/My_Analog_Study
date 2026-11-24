import { getRouterParam, setResponseStatus } from 'h3';
import { requireUser } from '../../../../lib/auth';
import { database } from '../../../../lib/db';
import { api, json, resourceId } from '../../../../lib/http';
import { addComment } from '../../../../lib/posts';
import { commentSchema } from '../../../../lib/schemas';
import { invalidateList } from '../../../../lib/notifications';
export default api(async (event) => {
  const { id } = await requireUser(event);
  const { body } = await json(event, commentSchema);
  const data = await addComment(await database(), resourceId(getRouterParam(event, 'id')), id, body);
  invalidateList();
  setResponseStatus(event, 201);
  return { data };
});
