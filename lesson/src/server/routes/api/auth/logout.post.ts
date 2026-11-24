import { sendNoContent } from 'h3';
import { logout } from '../../../lib/auth';
import { api } from '../../../lib/http';
export default api(async (event) => {
  await logout(event);
  return sendNoContent(event);
});
