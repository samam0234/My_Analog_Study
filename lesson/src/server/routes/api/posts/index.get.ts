import { getQuery } from 'h3';
import { database } from '../../../lib/db';
import { api, validate } from '../../../lib/http';
import { listPosts } from '../../../lib/posts';
import { listSchema } from '../../../lib/schemas';
export default api(async (event) => listPosts(await database(), validate(listSchema, getQuery(event))));
