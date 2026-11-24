import { getRouterParam } from 'h3';
import { database } from '../../../../lib/db';
import { api, resourceId } from '../../../../lib/http';
import { getPost } from '../../../../lib/posts';
export default api(async (event) => ({ data: await getPost(await database(), resourceId(getRouterParam(event, 'id'))) }));
