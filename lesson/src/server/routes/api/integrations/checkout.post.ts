import { requireUser } from '../../../lib/auth';
import { api } from '../../../lib/http';
import { checkout } from '../../../lib/integrations';
export default api(async (event) => ({ data: await checkout(await requireUser(event)) }));
