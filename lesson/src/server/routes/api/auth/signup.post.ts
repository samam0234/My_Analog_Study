import { createUser } from '../../../lib/auth';
import { api, json } from '../../../lib/http';
import { signupSchema } from '../../../lib/schemas';
import { setResponseStatus } from 'h3';
export default api(async (event) => {
  const user = await createUser(await json(event, signupSchema));
  setResponseStatus(event, 201);
  return { data: user };
});
