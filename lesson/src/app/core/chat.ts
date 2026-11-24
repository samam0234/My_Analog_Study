import { ApiFailure } from './api';

interface Frame {
  text?: string;
  sources?: Array<{ number: number; text: string }>;
  error?: { message: string };
}

export async function streamAnswer(
  input: { document: string; question: string },
  onFrame: (frame: Frame) => void,
  signal: AbortSignal,
) {
  const response = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new ApiFailure(response.status, payload?.error);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error('응답을 모두 받기 전에 연결이 끊겼습니다.');
      buffer += value;
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        if (data === '[DONE]') return;
        const event: Frame = JSON.parse(data);
        if (event.error) throw new Error(event.error.message);
        onFrame(event);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
