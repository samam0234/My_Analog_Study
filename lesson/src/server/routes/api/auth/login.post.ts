import { login } from '../../../lib/auth';
import { api, json } from '../../../lib/http';
import { loginSchema } from '../../../lib/schemas';
export default api(async (event) => {
  const { email, password } = await json(event, loginSchema);
  return { data: await login(event, email, password) };
});
