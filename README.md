# Analog Board

Analog로 파일 라우팅, 서버 load, 로그인, 글·댓글 CRUD를 학습하는 한국어 실습 저장소입니다. 기초 실습은 SQLite에서 실행하고, 최종 프로젝트는 PostgreSQL·Redis, 외부 서비스, 문서 질의, MCP를 연결합니다. [Notion 학습 페이지](https://app.notion.com/p/41fd7dec5e2e81a1a6d6e9f69d8a948e)

## 저장소 구조

- 루트의 study*.md 파일에는 학습 순서와 실습 설명이 있습니다.
- [lesson/](lesson/)에는 실행 코드, 환경변수 예시, 테스트, Docker 설정이 있습니다.
- [.github/workflows/](.github/workflows/)에는 GitHub Actions 설정이 있습니다.

## 실행

Node.js 24.15 이상과 npm을 준비합니다.

```powershell
Set-Location lesson
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# 출력값을 .env의 APP_SECRET에 붙여넣는다.
npm run start
```

| 주소 | 실습 |
| --- | --- |
| `http://localhost:5173/` | 홈과 메뉴 |
| `/account` | 가입·로그인·로그아웃 |
| `/posts` | SSR 목록, 검색·상세·댓글·작성 |
| `/blog/welcome` | Markdown 콘텐츠와 SSG |
| `/practice` | 상태 저장과 200·400·422 확인 |
| `/lab` | 실시간 알림, 파일, 외부 서비스, AI 질의 |
| `/api-docs` | Swagger UI |
| `/health`, `/api/ready` | 프로세스·DB 상태 |

AI는 `AI_PROVIDER=demo` 기본값으로 실행됩니다. 메일·결제·OAuth와 실제 모델 설정은 study13과 study18을 참고하세요.

## 학습 순서

| 문서 | 주제 |
| --- | --- |
| [study0](study0.md) | 환경 설정 |
| [study1](study1.md) | Hello World와 기본 문법 |
| [study2](study2.md) | 핵심 구조와 컴포넌트 |
| [study3](study3.md) | 데이터와 상태 |
| [study4](study4.md) | 라우팅과 요청 처리 |
| [study5](study5.md) | 폼·입력·검증 |
| [study6](study6.md) | DB·API 연동 |
| [study7](study7.md) | 인증과 보안 기초 |
| [study8](study8.md) | 구조화와 재사용 |
| [study9](study9.md) | 테스트와 디버깅 |
| [study10](study10.md) | 배포와 기초 정리 |
| [studyMidpoint](studyMidpoint.md) | 중간 프로젝트 · Analog 게시판 |
| [study11](study11.md) | DB 확장과 마이그레이션 |
| [study12](study12.md) | 프런트·UI 연동 |
| [study13](study13.md) | 외부 서비스 연동 |
| [study14](study14.md) | REST API 설계와 OpenAPI |
| [study15](study15.md) | 성능·캐시·비동기 작업 |
| [study16](study16.md) | 운영과 CI/CD |
| [study17](study17.md) | 실시간 알림과 파일 처리 |
| [study18](study18.md) | AI 모델과 MCP |
| [studyFinal](studyFinal.md) | 최종 프로젝트 · Analog 게시판과 문서 질의 |

## 확인한 동작

- TypeScript 검사, Vitest 4건, Chromium Playwright 3건, 프로덕션 SSR·SSG 빌드
- Docker 이미지와 PostgreSQL CRUD·재시작·백업 복원, Redis 큐와 Mailpit 수신
- SQLite 데이터의 PostgreSQL 이전·시퀀스, MariaDB CRUD·댓글, MongoDB 문서 예제
- 실제 Stripe 결제, Google OAuth 로그인, 외부 모델 호출과 공개 HTTPS 자동 배포는 해당 테스트 계정·키와 운영 호스트가 필요합니다.

저장소 루트에서 시작한다면 `Set-Location lesson`을 먼저 실행합니다.

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## 운영 실습

[study16](study16.md)에서 Docker·Actions·백업을 준비하고 [studyFinal](studyFinal.md)에서 전체 연동 흐름을 실행합니다. 운영 변수는 실습 폴더의 예시 파일을 참고하세요. [lesson/.env.example](lesson/.env.example)

## Notion 체크 항목 미반영

Analog 페이지의 ‘기존 Angular 게시판 컴포넌트를 옮겨 Angular CLI 프로젝트와 비교’는 단일 프레임워크 학습 요청과 충돌하여 [studyFinal](studyFinal.md#notion-체크-항목-미반영)에 원문과 사유를 남겼습니다.
