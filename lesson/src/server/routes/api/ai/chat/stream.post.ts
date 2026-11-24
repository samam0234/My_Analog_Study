import { chatSchema, prepareChat } from '../../../../lib/ai';
import { requireUser } from '../../../../lib/auth';
import { api, json, requestId } from '../../../../lib/http';

export default api(async (event) => {
  const user = await requireUser(event);
  const chat = await prepareChat(user.id, await json(event, chatSchema));
  const cancellation = new AbortController();
  event.node.res.once('close', () => cancellation.abort());
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      const push = (data: string) => {
        if (!cancellation.signal.aborted) stream.enqueue(encoder.encode('data: ' + data + '\n\n'));
      };
      try {
        const { usage, sources } = await chat.run((text) => push(JSON.stringify({ text })), cancellation.signal);
        push(JSON.stringify({ sources, usage }));
        push('[DONE]');
      } catch {
        push(JSON.stringify({
          error: { code: 'AI_UNAVAILABLE', message: 'AI 응답을 받지 못했습니다.', requestId: requestId(event) },
        }));
      } finally {
        if (!cancellation.signal.aborted) stream.close();
      }
    },
    cancel() { cancellation.abort(); },
  });

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform' },
  });
});
