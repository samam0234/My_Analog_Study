# study16 · 운영과 CI/CD

## ① 목표

Docker로 운영 환경을 재현하고 GitHub Actions의 검증·이미지 배포·복구 흐름을 준비한다.

## ② 📖 이론

컨테이너 이미지는 실행 환경을 재현하고, 볼륨은 앱이 다시 시작되어도 파일을 보존한다. CI가 변경을 검증하고 CD는 검증된 동일 이미지 digest를 배포한다. 재고에 일련번호가 붙으면 같은 제품을 다시 가져갈 수 있는 것처럼 태그보다 digest가 실제 바이너리를 고정한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

### 로컬 운영 환경

`.env`에서 새 `APP_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL=postgresql://board:<encoded-password>@db:5432/board`를 설정한다. 로컬 `APP_ORIGIN=http://localhost:3000`, `COOKIE_SECURE=false`를 사용한다.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 board
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/api/ready
```

### 백업과 복구 실습

PowerShell에서 바이너리 덤프를 `>`로 변환하지 않도록 컨테이너에 파일을 생성하고 `docker compose cp`로 복사한다. 복원용 빈 `board_restore` DB에서 행 수와 동작을 확인한다.

```powershell
docker compose exec -T db pg_dump -U board -d board -Fc -f /tmp/board.dump
docker compose cp db:/tmp/board.dump .\data\board.dump
docker compose exec -T db createdb -U board board_restore
docker compose exec -T db pg_restore -U board -d board_restore /tmp/board.dump
docker compose exec -T db psql -U board -d board_restore -c 'select count(*) from posts;'
```

운영에서는 덤프와 업로드 볼륨 백업을 암호화된 별도 위치로 복제한다. 앞단에서 요청 시간 및 5xx 비율을 추적하고 `/api/ready` 실패와 큐 오류를 알림에 연결한다.

### `lesson/Dockerfile` 전체 코드

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/analog/ ./dist/analog/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"]
CMD ["node", "dist/analog/server/index.mjs"]
```

- 1–2행 빌드와 실행 단계에 같은 Node 계열을 사용한다.
- 3–5행 SQLite 네이티브 모듈이 소스에서 빌드될 때 필요한 도구를 설치한다.
- 6–7행 의존성은 lockfile을 사용한다.
- 8행 SSR 서버와 정적 HTML을 생성한다.
- 10–14행 실행 컨테이너로 빌드 결과만 옮기는 단계를 연다.
- 15–16행 권한이 낮은 사용자로 프로세스를 실행한다.
- 17–18행 프로세스 HTTP 상태를 주기적으로 확인한다. Nitro 서버 시작점을 설정한다.

### `.github/workflows/ci-deploy.yml` 전체 코드

```yaml
name: Verify and deploy
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: lesson
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: lesson/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
  image:
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      reference: ${{ steps.publish.outputs.reference }}
    steps:
      - uses: actions/checkout@v5
      - name: Publish tested commit as an immutable image
        id: publish
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          package="ghcr.io/${GITHUB_REPOSITORY,,}"
          tag="$package:$GITHUB_SHA"
          echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
          docker build -t "$tag" lesson
          docker push "$tag"
          reference=$(docker image inspect --format '{{index .RepoDigests 0}}' "$tag")
          echo "reference=$reference" >> "$GITHUB_OUTPUT"
  deploy:
    if: github.ref == 'refs/heads/main' && vars.BOARD_DEPLOY == 'true'
    needs: image
    runs-on: ubuntu-latest
    environment: production
    concurrency: { group: analog-board-production, cancel-in-progress: false }
    steps:
      - name: Pull image and check readiness over SSH
        env:
          BOARD_IMAGE: ${{ needs.image.outputs.reference }}
          SSH_HOST: ${{ secrets.BOARD_SSH_HOST }}
          SSH_USER: ${{ secrets.BOARD_SSH_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.BOARD_SSH_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.BOARD_SSH_KNOWN_HOSTS }}
        run: |
          set -euo pipefail
          [[ "$BOARD_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]
          install -d -m 700 ~/.ssh
          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/board
          chmod 600 ~/.ssh/board
          printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i ~/.ssh/board -- "$SSH_USER@$SSH_HOST" "BOARD_IMAGE='$BOARD_IMAGE' bash -s" <<'REMOTE'
          set -euo pipefail
          cd /opt/analog-board/lesson
          previous=$(docker compose ps -q board)
          previous_image=""
          if [ -n "$previous" ]; then previous_image=$(docker inspect --format '{{.Config.Image}}' "$previous"); fi
          docker compose pull board
          docker compose up -d --no-build board
          if ! docker compose exec -T board node -e '
            (async () => {
              for (let attempt = 0; attempt < 30; attempt++) {
                const result = await fetch("http://127.0.0.1:3000/api/ready").catch(() => null);
                if (result?.ok) return;
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
              process.exitCode = 1;
            })();
          '; then
            if [ -n "$previous_image" ]; then BOARD_IMAGE="$previous_image" docker compose up -d --no-build board; fi
            exit 1
          fi
          REMOTE
```

- 1행 GitHub Actions에 표시할 워크플로 이름을 정한다.
- 2–9행 PR, main push, 수동 실행에서 워크플로가 동작한다.
- 10–27행 lesson을 작업 폴더로 지정하고 해당 lockfile을 캐시한다. 의존성 설치 뒤 타입·단위·빌드·브라우저 검증을 실행한다.
- 28–49행 main에서 lesson을 Docker 빌드 컨텍스트로 사용해 GHCR 이미지를 게시한다.
- 50–51행 태그가 가리키는 digest를 배포 입력으로 고정한다.
- 52–64행 배포 변수로 제어하고 환경 접근 권한을 적용한다.
- 65–76행 미리 신뢰한 호스트 키를 사용한다.
- 77–83행 업데이트하기 전에 현재 이미지 ID를 보관한다.
- 84–90행 신규 서비스에 실제 DB 준비를 검사한다.
- 91–94행 준비 검사가 실패하면 이전 이미지로 복귀한다.

## ④ 🔗 연동 포인트

호스트 `/opt/analog-board`에 저장소를 배치하고, `/opt/analog-board/lesson`에 운영 `.env`를 만든다. 같은 폴더의 `compose.yaml`과 `Caddyfile`을 사용하며 호스트에 GHCR 읽기 권한을 설정한다. GitHub `production` 환경에 `BOARD_SSH_HOST`, `BOARD_SSH_USER`, `BOARD_SSH_KEY`, `BOARD_SSH_KNOWN_HOSTS`를 설정한 뒤 `BOARD_DEPLOY=true`를 넣으면 main 워크플로가 호스트에 배포한다. `docker compose --profile tls up -d proxy`와 DNS 설정으로 HTTPS를 연결한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| DB는 뜨는데 readiness가 500 | DB URL·암호 또는 역할 권한 불일치 | `db:5432`, DB 이름, 인증 권한과 서버 로그를 확인한다. |
| `Permission denied` 볼륨 업로드 | 파일 소유자가 컨테이너 user와 다름 | 볼륨의 UID와 애플리케이션 사용자 권한을 맞춘다. |
| CI 배포 job이 생략됨 | 배포 스위치가 꺼짐 | `BOARD_DEPLOY`와 production 환경 설정을 확인한다. |

## ⑥ 직접 해보기

1. Docker 로그를 켠 상태에서 readiness를 조회한다.
2. 로컬 PostgreSQL 백업을 `board_restore`에 복원하고 행 수를 비교한다.
3. 외부 배포 없이 CI의 verify와 image 단계가 동작하는 조건을 확인한다.

## ⑦ ☐ 체크리스트

- [ ] `docker compose up -d --build`와 health/readiness 확인
- [ ] PR typecheck·Vitest·build·Playwright 확인
- [ ] GHCR digest·운영 SSH 확인
- [ ] 로그 순환과 DB·파일 백업 및 복원 확인

## ⑧ 다음 단계

[study17](study17.md)에서 같은 배포 연결에 WebSocket과 사용자 파일을 붙인다.

[참고 문서](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
