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

## 변경 요청 2 (2026-10-20)

- 빌드 방법은 같다. 새 환경 변수 없음
- 산출물 추가: 마이그레이션 0009(`notices.regions`)·0010(`regions_ai`, 관심 지역 함수, cron 두 묶음), 화면 `/profile/update`
- ✅ `typecheck`·`lint`·`deno:check`·`build`(E2E 실행 때 `npm run build`) 통과

### 운영 반영 순서 (변경 2)

옛 코드가 새 칸을 모르는 것은 괜찮지만, **새 코드는 새 칸을 읽으므로 DB가 먼저**다.

| 순서 | 할 일 | 상태 |
|---|---|---|
| 1 | `npx supabase db push --linked` (0009·0010) → `npx supabase migration list --linked`로 확인 | ✅ 2026-10-19 |
| 2 | `npx supabase functions deploy collect analyze dispatch --project-ref <ref>` | ✅ 2026-10-19 (U3·U4 코드) |
| 3 | `git push` (Vercel) — U2~U4 | ✅ 2026-10-19 `5759d29` |
| 4 | U5: `git push` + `dispatch` 다시 배포(공용 피드 코드) | ⏳ 사용자 확인 뒤 |
| 5 | 다음 날 05:00(api)·05:10(crawl) `collect_runs` 확인 | 아래 요약 |
| 6 | 부모님 휴대폰: 새로 바뀐 점 → 새 항목 입력 | 사용자 |

되돌리기: Vercel 이전 배포로 되돌리기 + 함수는 이전 커밋에서 다시 배포. 0009·0010은 칸·함수 추가라 그대로 두어도 옛 코드가 동작한다(cron은 0010 이전 하나짜리 호출로 바꾸려면 새 마이그레이션 필요).
