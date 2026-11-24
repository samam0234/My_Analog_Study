import { getRouterParam } from 'h3';
import { api } from '../../../lib/http';
import { requireUser } from '../../../lib/auth';
import { downloadText } from '../../../lib/integrations';
export default api(async (event) => downloadText(event, (await requireUser(event)).id, getRouterParam(event, 'id') || ''));
