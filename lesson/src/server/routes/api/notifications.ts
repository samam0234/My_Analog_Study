import { defineWebSocketHandler } from 'h3';
import { appOrigin } from '../../lib/config';
import { subscribePosts } from '../../lib/notifications';

const subscriptions = new Map<string, () => void>();

export default defineWebSocketHandler({
  upgrade(request) {
    if (request.headers.get('origin') !== appOrigin()) {
      return new Response('Forbidden', { status: 403 });
    }
    return undefined;
  },
  open(peer) {
    peer.send(JSON.stringify({ type: 'connected' }));
    subscriptions.set(peer.id, subscribePosts((id) => {
      try { peer.send(JSON.stringify({ type: 'post-created', id })); }
      catch { subscriptions.get(peer.id)?.(); subscriptions.delete(peer.id); }
    }));
  },
  close(peer) {
    subscriptions.get(peer.id)?.();
    subscriptions.delete(peer.id);
  },
});
