import { api, json } from '../../../lib/http';
import { postSchema } from '../../../lib/schemas';
export default api(async (event) => ({ data: await json(event, postSchema, 422) }));
