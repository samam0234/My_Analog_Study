import { getQuery, getRouterParam } from 'h3';
import { database } from '../../../../lib/db';
import { api, resourceId, validate } from '../../../../lib/http';
import { listComments } from '../../../../lib/posts';
import { listSchema } from '../../../../lib/schemas';
export default api(async (event) => listComments(await database(), resourceId(getRouterParam(event, 'id')), validate(listSchema, getQuery(event))));
