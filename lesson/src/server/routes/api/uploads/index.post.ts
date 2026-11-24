import { setResponseStatus } from 'h3';
import { api } from '../../../lib/http';
import { requireUser } from '../../../lib/auth';
import { uploadText } from '../../../lib/integrations';
export default api(async (event) => {
  const data = await uploadText(event, (await requireUser(event)).id);
  setResponseStatus(event, 201);
  return { data };
});
