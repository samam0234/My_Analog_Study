# study17 · 실시간 알림과 파일 처리

## ① 목표

WebSocket으로 새 글 알림을 받고 업로드 파일의 경로와 접근 권한을 검사한다.

## ② 📖 이론

WebSocket은 연결을 열린 상태로 두어 서버가 새 글 이벤트를 밀어준다. HTTP는 파일 업로드와 다운로드 요청 흐름을 유지한다. 방송 스피커는 새 글 번호를 알리고 자료실 창구는 파일을 발급자에게만 돌려주는 것과 같다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

두 탭을 연 뒤 `/lab`에서 **알림 연결**을 누르고 다른 탭의 `/posts/new`에서 글을 작성한다. DevTools Network → WS → Messages에서 `connected`와 `post-created`를 확인한다. 파일은 `/lab`에서 32 KiB 이하 UTF-8 텍스트를 올린 뒤 로그인 상태에서 내려받는다. TLS 앞단에서는 `wss:`로 자동 선택되고 Caddy가 WebSocket 연결을 전달한다.

### `lesson/src/server/routes/api/notifications.ts` 전체 코드

```typescript
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
```

- 1–2행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3행 신규 글 ID를 연결된 브라우저에 보낸다.
- 5–7행 연결마다 해제 함수를 보관한다.
- 8–13행 WebSocket 요청의 Origin을 확인한다.
- 14–20행 초기 연결 신호를 보내고 게시물 생성 구독을 시작한다.
- 21–25행 연결이 종료되면 메모리에서 구독을 제거한다.

### `lesson/src/server/routes/api/uploads/index.post.ts` 전체 코드

```typescript
import { setResponseStatus } from 'h3';
import { api } from '../../../lib/http';
import { requireUser } from '../../../lib/auth';
import { uploadText } from '../../../lib/integrations';
export default api(async (event) => {
  const data = await uploadText(event, (await requireUser(event)).id);
  setResponseStatus(event, 201);
  return { data };
});
```

- 1–5행 파일 저장 성공을 201로 표시한다.
- 6–7행 인증된 사용자의 업로드만 저장한다.
- 8–9행 생성한 파일 ID와 크기를 반환한다.

### `lesson/src/server/routes/api/uploads/[id].get.ts` 전체 코드

```typescript
import { getRouterParam } from 'h3';
import { api } from '../../../lib/http';
import { requireUser } from '../../../lib/auth';
import { downloadText } from '../../../lib/integrations';
export default api(async (event) => downloadText(event, (await requireUser(event)).id, getRouterParam(event, 'id') || ''));
```

- 1–4행 경로에서 요청 파일 ID를 읽는다.
- 5행 세션 사용자와 파일 ID를 다운로드 헬퍼에 전달한다.

## ④ 🔗 연동 포인트

글 POST 후 `publishPost`가 live 알림을 보낸다. 사용자 콘텐츠를 클라이언트에서 읽어 study18 문서 질의에 넣을 수 있다. 원본 파일은 소유자별 영역에 저장되어 있고 검색용 발췌는 별도 API 요청으로 전달된다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| WebSocket 403 | Origin이 운영 주소와 다름 | HTTPS의 `APP_ORIGIN`과 브라우저 주소를 맞춘다. |
| 연결되나 알림이 없음 | 서버 인스턴스가 다르거나 아직 글 저장 전 | 한 인스턴스에서 재현하고 배포 확장 시 공용 pub/sub를 연결한다. |
| 파일 다운로드 404 | 다른 계정 또는 파일 경로 소실 | 세션과 업로드 볼륨을 확인한다. |

## ⑥ 직접 해보기

1. 동일 Origin 페이지 두 탭에서 알림을 받는다.
2. DevTools의 WS 요청과 HTTP 파일 요청을 각각 확인한다.
3. 다른 계정으로 같은 파일 링크를 열어 404를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] WebSocket 업그레이드와 구독 해제 확인
- [ ] 새 글 알림과 HTTP CRUD 연결
- [ ] 파일 크기·인코딩·소유권 검사 확인

## ⑧ 다음 단계

[study18](study18.md)에서 문서 입력을 AI 응답과 MCP 도구로 연결한다.

[참고 문서](https://analogjs.org/docs/features/api/websockets)
