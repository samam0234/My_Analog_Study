import { requireUser } from '../../../lib/auth';
import { database } from '../../../lib/db';
import { api } from '../../../lib/http';

export default api(async (event) => {
  const user = await requireUser(event);
  const data = await (await database())('aiQuestions').where({ userId: user.id }).orderBy('id', 'desc')
    .limit(20).select('id', 'question', 'answer', 'inputTokens', 'outputTokens', 'createdAt');
  return { data };
});
