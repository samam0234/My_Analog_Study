# study10 · 배포와 기초 정리

## ① 목표

Analog SSR 서버를 빌드하고 Markdown 한 페이지의 SSG 산출물을 확인한다.

## ② 📖 이론

SSR은 요청마다 글 목록을 DB에서 읽어 HTML을 만든다. SSG는 빌드 시 확정된 안내 페이지를 저장해 둔다. 매일 갱신되는 게시판과 미리 인쇄해 둔 안내문을 각각 쓰는 것과 같다. 도메인의 DNS가 배포 서버를 가리키고, HTTPS의 TLS 인증서가 연결을 암호화한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

```powershell
npm run build
Test-Path dist/analog/public/blog/welcome/index.html
$env:APP_ORIGIN = 'http://localhost:3000'
$env:CORS_ORIGIN = 'http://localhost:3000'
$env:COOKIE_SECURE = 'false'
npm run preview
```

1. `/health`는 프로세스 상태, `/api/ready`는 DB 접속까지 확인한다.
2. `/posts`를 열어 SSR 목록을, `/blog/welcome`에서 정적 콘텐츠를 확인한다.
3. 운영 호스트는 `dist/analog/` 전체를 패키징하고 `node dist/analog/server/index.mjs`를 실행한다. SQLite를 유지하는 첫 배포에서는 `SQLITE_PATH`와 `UPLOAD_DIR`를 영속 볼륨으로 연결한다.
4. DNS A/AAAA 또는 호스팅 CNAME을 설정한 뒤 리버스 프록시에서 TLS와 HTTPS 리다이렉트를 설정한다. 운영에서는 HTTPS Origin과 Secure 쿠키를 지정한다.

study0~4에서 실행·표현·구성·URL을, study5~7에서 검증·저장·인증을, study8~9에서 구조·테스트를 확인했다.

### `lesson/vite.config.ts` 전체 코드

```typescript
import { defineConfig } from 'vitest/config';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';

export default defineConfig({
  build: { target: ['es2020'] },
  resolve: { mainFields: ['module'] },
  server: { port: 5173, strictPort: true, hmr: { port: 5174 } },
  plugins: [
    analog({ content: { highlighter: 'prism' } }),
    angular(),
    nitro({
      preset: 'node-server',
      experimental: { websocket: true },
      prerender: { routes: ['/blog/welcome'], crawlLinks: false },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/*.spec.ts'],
  },
});
```

- 1–4행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 6–8행 빌드·dev·테스트 옵션을 하나의 Vite 진입점에 둔다.
- 9–10행 개발 HTTP와 HMR 포트를 설정한다.
- 11행 콘텐츠 렌더링을 활성화한다.
- 12행 컴포넌트와 템플릿을 컴파일한다.
- 13행 SSR/API 서비스를 생성한다.
- 14–15행 Node 운영 산출물을 선택한다.
- 16–18행 Markdown URL의 HTML을 빌드에 포함한다.
- 19–24행 Vitest의 테스트 파일과 환경을 정한다.

### `lesson/src/server/routes/api/ready.get.ts` 전체 코드

```typescript
import { api } from '../../lib/http';
import { database } from '../../lib/db';
export default api(async () => {
  await (await database()).raw('select 1');
  return { data: { status: 'ok' } };
});
```

- 1–3행 공통 HTTP 응답을 적용한다.
- 4행 DB 초기화 후 SQL로 연결을 확인한다.
- 5–6행 운영 점검용 200 본문을 보낸다.

## ④ 🔗 연동 포인트

배포에서는 등록한 HTTPS 도메인을 `APP_ORIGIN`에 맞추고 DB 비밀을 프로세스에 주입한다. 기초 실습만 합친 중간 프로젝트에서 동일한 배포 흐름을 재사용한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 미리보기 로그인 403 | 실행 호스트가 3000인데 Origin 설정이 5173 | HTTP 미리보기 변수와 실제 브라우저 주소를 맞춘다. |
| 배포 재시작 후 글이 없음 | SQLite 경로가 임시 컨테이너 내부 | 파일을 영속 볼륨으로 옮기고 복원을 검증한다. |
| SSG 파일에 잘못된 화면 | 콘텐츠 라우트 등록 누락 | `withContentRoutes()`와 빌드된 HTML 본문을 확인한다. |

## ⑥ 직접 해보기

1. 로컬 `dist/analog/public/blog/welcome/index.html`에서 블로그 문장을 찾는다.
2. `curl.exe -i http://localhost:3000/api/ready`로 응답을 확인한다.
3. preview 종료 후 DB가 보존되는지 같은 경로로 재실행한다.

## ⑦ ☐ 체크리스트

- [ ] SSR과 정적 생성(SSG) 설정
- [ ] 빌드 서버, `/health`와 `/api/ready` 확인
- [ ] HTTPS 도메인·환경변수·영속 DB 확인
- [ ] 배포 후 회원가입·쓰기·상세·404 확인

## ⑧ 다음 단계

[midpoint](studyMidpoint.md)에서 기초 기능을 한 번에 실행한다.

[참고 문서](https://analogjs.org/docs/features/deployment/overview)
