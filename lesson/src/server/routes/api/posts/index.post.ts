import { setHeader, setResponseStatus } from 'h3';
import { requireUser } from '../../../lib/auth';
import { database } from '../../../lib/db';
import { api, json } from '../../../lib/http';
import { addPost } from '../../../lib/posts';
import { postSchema } from '../../../lib/schemas';
import { invalidateList, publishPost } from '../../../lib/notifications';
export default api(async (event) => {
  const user = await requireUser(event);
  const data = await addPost(await database(), user.id, await json(event, postSchema));
  invalidateList();
  publishPost(data.id);
  setHeader(event, 'location', '/api/posts/' + data.id);
  setResponseStatus(event, 201);
  return { data };
});
