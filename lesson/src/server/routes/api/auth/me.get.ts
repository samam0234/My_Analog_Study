import { requireUser } from '../../../lib/auth';
import { api } from '../../../lib/http';
export default api(async (event) => ({ data: await requireUser(event) }));
