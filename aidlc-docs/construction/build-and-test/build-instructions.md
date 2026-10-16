# 빌드 안내

## 준비물

| 항목 | 버전·내용 |
|---|---|
| Node.js | `.nvmrc` (CI와 같음, 24.x) |
| npm | Node에 포함 |
| Docker Desktop | 로컬 Supabase용. Windows에서 `docker`가 PATH에 없으면 `C:\Users\<사용자>\AppData\Local\Programs\DockerDesktop\resources\bin` 추가 |
| Supabase CLI | `npx supabase` (devDependency, CI 2.120.0) |
| Deno | 없으면 `npm run deno:check`가 `npx deno@2.5.6`으로 실행 |
| Playwright 브라우저 | `npx playwright install chromium webkit` |

## 환경 변수

`.env.example` 참고. **로컬 개발·테스트에서는 운영을 가리키는 `.env.local`을 쓰지 말고** 로컬 Supabase 값을 환경 변수로 덮어씁니다.

```bash
npx supabase start
npx supabase status -o env          # API_URL, SERVICE_ROLE_KEY 확인
export SUPABASE_URL=<API_URL>
export SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
export AMOUNT_ENC_KEY_V1=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
export AMOUNT_ENC_KEY_CURRENT=1
eval "$(node scripts/generate-vapid.mjs --env | sed 's/^/export /')"   # 임시 VAPID (U6)
```

## 빌드

```bash
npm ci
npx supabase migration up --local     # 0001~0008
npm run typecheck
npm run lint
npm run deno:check                    # Edge Function(collect·analyze·dispatch)
npm run build
```

## 성공 기준

- `npm run build`가 라우트 목록을 출력하고 끝남: 화면 `/`·`/notice/[id]`·`/bookmarks`·`/settings`·`/profile/*`, API `/api/{device,profile,notify-settings,feed,notices,push/*,health}`, `/manifest.webmanifest`
- 산출물: `.next/` (Vercel이 배포 때 다시 빌드), Edge Function은 `supabase functions deploy`가 번들
- 받아들이는 경고: Supabase CLI 새 버전 안내, GitHub Actions의 Node 20 사용 중단 안내

## 문제 해결

| 증상 | 원인·해결 |
|---|---|
| `docker`를 찾을 수 없음 | Docker Desktop을 켜고 위 PATH 추가 |
| 빌드 중 환경 변수 오류 | 서버 환경 변수는 요청 때 읽으므로 빌드에는 필요 없음. `next start`·E2E 전에 위 값을 설정 |
| `deno check` 실패 | `_shared`에서 Node 전용 API(`Buffer` 등)나 확장자 없는 import를 쓰지 않았는지 확인 |
