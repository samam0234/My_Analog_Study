# study0 · 환경 설정

## ① 목표

Analog 프로젝트를 생성하고 Windows에서 개발 서버, Git, 환경변수를 준비한다.

## ② 📖 이론

Analog는 화면 라우트와 서버 라우트를 하나의 프로젝트에서 관리한다. Vite는 개발 중 수정한 모듈을 다시 제공하고, Nitro는 API와 SSR 서버를 실행한다. 파일 라우팅은 방의 이름이 적힌 안내판과 비슷하다. 파일 이름을 정하면 URL의 위치가 정해진다.

| 용어 | 실습에서 하는 역할 |
| --- | --- |
| Standalone 컴포넌트 | 템플릿과 상태를 가진 화면 조각 |
| HMR | dev 서버가 변경된 브라우저 모듈을 자동 교체 |
| SSR / SSG | 요청 시 HTML 생성 / 빌드 시 HTML 생성 |
| h3 | Nitro 핸들러에서 요청과 응답에 접근하는 API |
| Hydration | 서버 HTML에 브라우저 이벤트와 상태를 연결 |
| `.env` / `VITE_` | 서버 설정 파일 / 빌드 후 브라우저에 공개되는 값 |

## ③ 🛠️ 실기

저장소 루트에는 학습 문서가 있고, 실행 코드와 설정은 `lesson/`에 있습니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

Windows PowerShell에서 Node 24.15 이상과 npm, Git을 설치하고 VS Code에서 폴더를 연다. Node가 여러 개면 `Get-Command node -All`로 실제 경로를 확인한다. 새 빈 폴더에 독립 실습 프로젝트를 만들려면 아래 첫 블록을 실행한다. 이미 이 저장소를 내려받은 상태라면 저장소 루트에서 두 번째 블록을 실행한다.

```powershell
node --version
npm --version
git --version
npm create analog@latest
# 프로젝트 이름을 입력하고 Full-stack Application / Nitro 선택
Set-Location <입력한-프로젝트-이름>
git init
npm install
npm run start
```

```powershell
Set-Location lesson
npm ci
npm ls @analogjs/platform @analogjs/router @angular/core vite
Copy-Item .env.example .env
# 아래 출력값을 .env의 APP_SECRET에 붙여넣는다.
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
git check-ignore .env
npm run start
```

`http://localhost:5173`에서 첫 화면을 열고, 터미널에서 `Ctrl+C`로 서버를 종료한다. 새 프로젝트의 생성 시점 버전은 `@latest`에 따라 달라진다. 이 저장소에서는 `package-lock.json`으로 Analog 3.0.0과 Angular 22 계열을 재현한다. VS Code에서 Angular Language Service와 Prettier 확장 권장 목록을 확인한다.

```text
lesson/
  src/app/pages/        화면과 서버 load
  src/app/board/        게시판 컴포넌트
  src/server/routes/    HTTP API와 health
  src/server/lib/       DB·인증·검증과 데이터 접근
  src/shared/           화면과 서버가 공유하는 응답 타입
```

### `lesson/.env.example` 전체 코드

```text
DB_CLIENT=better-sqlite3
SQLITE_PATH=./data/board.sqlite
DATABASE_URL=
APP_SECRET=
APP_ORIGIN=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
AI_PROVIDER=demo
AI_MODEL=
ANTHROPIC_API_KEY=
OLLAMA_URL=http://127.0.0.1:11434
AI_DAILY_REQUEST_LIMIT=20
REDIS_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
SMTP_URL=
MAIL_FROM=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MONGODB_URL=mongodb://127.0.0.1:27017
UPLOAD_DIR=./data/uploads
POSTGRES_PASSWORD=
```

- 1–3행 로컬 엔진을 SQLite로 선택한다.
- 4행 세션 서명 키는 환경마다 생성한다.
- 5–7행 브라우저 주소와 서버의 Origin 검사가 일치해야 한다.
- 8–13행 키 없이 demo 모드부터 실행한다.
- 14–23행 외부 서비스 키를 서버 변수에 넣는다.

### `.gitignore` 전체 코드

```text
node_modules/
dist/
.angular/
.vite/
.vitest/
coverage/
playwright-report/
test-results/
data/
.env*
!.env.example
*.log
.DS_Store
Thumbs.db
/lesson/public/swagger/swagger-ui*
```

- 1–8행 설치 산출물은 lockfile로 재현한다.
- 9행 로컬 DB와 텍스트 파일은 커밋에서 제외한다.
- 10행 실제 설정 파일을 전부 제외한다.
- 11–15행 키가 없는 예시만 Git에서 추적한다.

## ④ 🔗 연동 포인트

개발 서버는 `.env`를 읽고, DB는 첫 API 요청 시 SQLite 파일을 생성한다. 배포 서버는 같은 변수 이름에 운영 값을 주입한다. 이 상태에서 study1이 첫 화면과 첫 HTTP 응답을 확인한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `EBADENGINE` | Node가 설치된 Angular 패키지 범위를 벗어남 | Node 24.15 이상으로 올리고 `npm ci`를 다시 실행한다. |
| `EADDRINUSE` | 5173 또는 HMR 5174를 다른 앱이 사용 | `Get-NetTCPConnection -State Listen`으로 점유 앱을 찾고 종료 또는 포트를 변경한다. |
| 로그인 500 | `APP_SECRET`가 비어 있음 | 32자 이상 무작위 키를 넣고 dev 서버를 재시작한다. |

## ⑥ 직접 해보기

1. VS Code에서 컴포넌트의 `template`에 마우스를 올려 타입과 오류 표시를 확인한다.
2. `.env`와 `.env.example`에 각각 `git check-ignore`를 실행해 차이를 확인한다.
3. `npm ls @analogjs/platform`로 재현 버전을 기록한다.

## ⑦ ☐ 체크리스트

- [ ] `npm create analog@latest`로 프로젝트 생성
- [ ] Node·npm·Git과 설치한 Analog 버전 확인
- [ ] 개발 서버와 Angular Language Service 확인
- [ ] .env의 서버 키와 Git 제외 규칙 확인

## ⑧ 다음 단계

[study1](study1.md)에서 생성한 프로젝트가 화면과 JSON을 각각 어떻게 보내는지 확인한다.

[참고 문서](https://analogjs.org/docs/getting-started)
