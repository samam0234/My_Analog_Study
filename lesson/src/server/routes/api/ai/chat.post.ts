import { setHeader, toWebRequest } from 'h3';
import { chatSchema, prepareChat } from '../../../lib/ai';
import { requireUser } from '../../../lib/auth';
import { api, fail, json } from '../../../lib/http';

export default api(async (event) => {
  const user = await requireUser(event);
  const input = await json(event, chatSchema);
  const chat = await prepareChat(user.id, input);
  setHeader(event, 'cache-control', 'no-store');
  try {
    const { usage, ...data } = await chat.run(() => {}, toWebRequest(event).signal);
    return { data, meta: { usage } };
  } catch {
    return fail(502, 'AI_UNAVAILABLE', 'AI 응답을 받지 못했습니다.');
  }
});
