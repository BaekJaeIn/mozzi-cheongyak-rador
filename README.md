# 모찌네 청약 알리미

3기 신도시(남양주 왕숙, 하남 교산, 고양 창릉, 부천 대장, 인천 계양, 광명 시흥)의 분양·임대 공고를 매일 모아서,
만 60세 이상 노부부 가구에 **자격이 되는 공고만** 골라 하루 1번 알려 주는 개인용 PWA입니다.

- 요구사항·설계 문서: [`aidlc-docs/`](aidlc-docs/) (AI-DLC 방식)
- 원래 기획: [`SPEC.md`](SPEC.md)

## 구성

| 영역 | 기술 |
|---|---|
| 화면·API | Next.js (App Router) + TypeScript + Tailwind CSS, Vercel (`icn1`) |
| DB·예약 작업 | Supabase (PostgreSQL, RLS, pg_cron, Edge Functions), `ap-northeast-2` |
| 테스트 | Vitest, fast-check(속성 기반 테스트), Playwright + axe, pgTAP |

```text
src/app/                  화면과 API 라우트
src/features/             화면 기능 (app-chrome, device, profile, settings, display-mode, …)
src/features/profile/model/  마법사·저장·동기화 순수 로직 (React 없음, 단위·속성 테스트)
src/server/               서버 전용 코드 (환경 변수, 인증, DB, 핸들러)
supabase/functions/_shared/  Node·Deno 공용 순수 코드 (npm 패키지 import 금지)
supabase/functions/_lib/     Edge Function 전용 코드 (Deno: DB·HTTP·Gemini)
supabase/functions/collect/  매일 수집 함수 / analyze/ 매시 공고문 분석 함수
supabase/migrations/      DB 구조·권한·DB 함수·예약 작업
supabase/tests/           DB 테스트 (pgTAP)
e2e/                      E2E 테스트
```

## 필요한 도구

- Node.js 24 (`.nvmrc`)
- Docker Desktop: 로컬 Supabase, DB 테스트, E2E에 필요
- Supabase CLI: `npx supabase` (devDependency로 포함)
- (선택) Deno 2: `npm run deno:check`

## 로컬 실행

```bash
npm install
npm run db:start              # 로컬 Supabase 시작 (마이그레이션 적용)
npx supabase status -o env    # API_URL, SERVICE_ROLE_KEY 확인
cp .env.example .env.local    # 위 값과 개발용 암호화 키를 채운다
npm run dev                   # http://localhost:3000
```

개발용 암호화 키 만들기 (운영 키와 **다른 값**을 쓰세요):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 서버 / 빌드 / 실행 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run lint` | ESLint |
| `npm test` | 단위 + 속성 기반 테스트 |
| `npm run deno:check` | `supabase/functions` Deno 타입 검사 |
| `npm run db:reset` | 로컬 DB 초기화 + 마이그레이션 + `seed.sql` |
| `npm run db:test` | DB 테스트 (pgTAP) |
| `npm run e2e` | E2E (빌드 후 실행, 로컬 Supabase 필요) |
| `npm run vapid:generate` | 웹 푸시 VAPID 키 1쌍 출력 (파일에 쓰지 않음, `-- --env`는 CI용) |
| `npm run icons:render` | `assets/icon-source.jpg`로 홈 화면 아이콘 PNG 다시 만들기 (`-- --source <사진>`이면 원본부터) |

## 속성 기반 테스트(PBT) seed 재현

테스트를 시작하면 `[PBT] seed=… numRuns=…`가 출력됩니다. 실패한 테스트는 같은 seed로 똑같이 재현할 수 있습니다.

```bash
FC_SEED=123456 npm test -- supabase/functions/_shared/domain
```

- CI는 실행마다 seed를 만들어 로그에 남기고 200회씩 실행합니다.
- 실패를 재시도로 덮지 않습니다. 찾은 반례는 예시 기반 회귀 테스트로 추가합니다.
- `test.prop` 속성 함수는 **블록 본문**으로 쓰고 값을 반환하지 않습니다.
- 파일 이름: 예시 기반 `*.test.ts`, 속성 기반 `*.pbt.test.ts`

## 환경 변수

[`.env.example`](.env.example)에 목록이 있습니다. 비밀 값은 저장소에 커밋하지 않습니다.
브라우저에 노출되는 값은 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 하나뿐이어야 합니다.

## 화면과 API (U4: 내 정보·설정)

| 경로 | 내용 |
|---|---|
| `/` | 프로필이 없으면 처음 실행 안내, 입력 중이면 마법사로, 있으면 피드(U5) |
| `/profile/setup` | 입력 마법사 (`?redo=1`: 지금 값으로 처음부터 다시) |
| `/profile/edit/[group]` | 설정에서 그룹 고치기 (basic·residence·housing·savings·money·districts·prefs) |
| `/settings` | 내 정보 요약·고치기, 알림 시각·켜기/끄기, 쉬운 모드, 모두 지우기 |
| `PUT /api/profile` | 내 정보 저장(금액 암호화) + 이 기기 판정 재계산 |
| `PUT /api/notify-settings` | `{ hour: 0~23, enabled }` |
| `DELETE /api/device` | 이 기기의 서버 정보 모두 삭제 |

- 내 정보는 **휴대폰(localStorage)이 원본**이고 서버는 판정·알림용 사본입니다. 서버 저장이 실패하면 앱을 다시 열 때·인터넷이 연결될 때 자동으로 다시 보냅니다.
- 기기 저장 키: `mz.device`(U1), `mz.profile`, `mz.profile.draft`, `mz.notify`, `mz.display`, `mz.bookmarks`·`mz.seen`·`mz.feed`(U5).

## 화면과 API (U5: 피드·상세·관심 공고)

| 경로 | 내용 |
|---|---|
| `/` | 맞춤 공고 피드: 관심 지구 + 충족·확인 필요만, 마감 제외. 접수 중 → 접수 예정, 그 안에서 점수·마감 순 |
| `/notice/[id]` | 공고 상세: 원문 보기, 일정, 세대수, 판정 이유(내 금액은 기기에서만 붙임), AI 요약, 캘린더. 피드 밖 공고도 열림 (알림 클릭 이동 대상) |
| `/bookmarks` | 관심 공고 (이 기기에만, 100개까지) |
| `GET /api/feed` | `{ state: ready·outdated·no_profile, today, items }`. 판정이 오래됐으면 그 자리에서 한 번 다시 계산 |
| `GET /api/notices/[id]` | 공고 + 이 기기의 판정 (`id`가 UUID가 아니거나 없으면 404) |
| `GET /api/notices?ids=a,b` | 관심 공고 갱신용 요약 (1~100개), 없는 공고는 `missing` |
| `GET /api/notices/[id]/calendar` | 캘린더 파일(.ics). 공고 정보만 담아 **기기 인증 없이** 열림 |

- 피드는 마지막 응답을 기기(`mz.feed`)에 저장해 다음에 열 때 먼저 보여 줍니다. 내 정보를 저장하거나 모두 지우면 함께 지웁니다.
- E2E의 피드 공고는 `e2e/helpers.ts`가 **로컬 Supabase(127.0.0.1·localhost)일 때만** 넣고 지웁니다. 운영 주소면 피드 E2E는 건너뜁니다.

## 알림과 설치 (U6)

| 경로 | 내용 |
|---|---|
| Edge Function `dispatch` | 매시 정각(pg_cron `dispatch-hourly`): 알림 시각이 지금인 기기에 **피드와 같은 규칙**으로 새로 맞는 공고를 모아 하루 1번 웹 푸시. 같은 공고는 두 번 알리지 않음 |
| `POST /api/push/subscribe` | 구독 저장. 기기의 첫 구독이면 지금 피드에 보이는 공고를 "기준선"으로 기록(첫 알림이 이미 본 공고로 오지 않게) |
| `POST /api/push/test` | 시험 알림 (1시간에 3번까지) |
| `GET /api/push/key` | VAPID 공개 키 (없으면 503 — 미리보기 배포) |
| `/sw.js`, `/manifest.webmanifest`, `/icons/*` | 서비스워커(알림 표시·클릭 이동만, 화면 캐시 없음), 홈 화면 앱 정보·아이콘 |

- 웹 푸시 암호화(RFC 8291)·서명(RFC 8292 VAPID)은 `supabase/functions/_shared/push/`에 Web Crypto로 구현했고 Deno·Node가 함께 씁니다. RFC 8291 부록 A 시험 값으로 검증합니다.
- 구독 주소는 알려진 푸시 서비스(FCM·Apple·Mozilla·Windows)만 받습니다.
- iPhone은 iOS 16.4 이상, **홈 화면에 추가한 앱에서만** 알림을 받습니다. 앱이 설치 방법을 그림으로 안내합니다.
- 운영 반영 순서·키 교체·되돌리기: [setup-guide-u6.md](aidlc-docs/construction/U6-pwa-push/code/setup-guide-u6.md)

## 수집·분석 함수 (Edge Functions)

| 함수 | 예약 (pg_cron) | 하는 일 |
|---|---|---|
| `collect` | 매일 KST 05:00 | 청약홈·LH·GH 공고 수집 → 묶기 → 바뀐 공고만 저장(표준 요건) → 판정 재계산. AI 호출 없음 |
| `analyze` | 매시 30분 | 분석 대기 공고 2건 → 공고문 PDF → Gemini 추출(요건·쉬운 요약) → 저장 → 판정 재계산 |

로컬에서 목업으로 실행 (Docker 필요):

```bash
# .env.local에 COLLECT_MOCK=1, CRON_SECRET=<아무 16자 이상 값>, AMOUNT_ENC_KEY_* 를 넣는다
npx supabase functions serve --env-file .env.local
curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:54321/functions/v1/collect
curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:54321/functions/v1/analyze
```

- 결과는 응답 JSON과 `collect_runs` 테이블에 남습니다 (소스별 행 + `all` 요약).
- 운영 수동 실행은 같은 curl을 `https://<ref>.supabase.co/functions/v1/...`로 보냅니다.
- 다시 분석하려면: `update notices set summary_status = pending, ai_attempts = 0 where id = …`
- 긴급 정지: `select cron.unschedule(collect-daily)` / `select cron.unschedule(analyze-hourly)` (다시 켜려면 0007의 `cron.schedule` 문 실행)

## 배포

처음 구축하는 순서는 [`aidlc-docs/construction/U1-setup-data-platform/code/setup-guide.md`](aidlc-docs/construction/U1-setup-data-platform/code/setup-guide.md)를 따릅니다. 수집·분석 함수는 [`setup-guide-u3.md`](aidlc-docs/construction/U3-collection-pipeline/code/setup-guide-u3.md)를 따릅니다.

- 화면·API: `main`에 push하면 Vercel이 자동 배포 (미리보기 배포 끔)
- DB: `npx supabase db push` (사람이 직접 실행, **코드 배포보다 먼저**)
- Edge Functions: `npx supabase functions deploy collect analyze` (사람이 직접 실행, `db push` 다음)

## 연간 갱신 — 소득 기준표·표준 요건 (매년 1~3월)

공고의 소득 조건은 **공고 연도의 기준표**로 판정합니다. 그해 기준표가 없으면 소득 조건이 모두 "확인 필요"로 바뀝니다
(화면에 "올해 소득 기준표가 아직 준비되지 않았어요"가 보이면 갱신할 때입니다).

1. 공식 금액 확인 (해당 연도 적용표)
   - 도시근로자 가구원수별 월평균소득: [마이홈포털 국민임대 입주자격](https://www.myhome.go.kr/hws/portal/cont/selectNationalRentalHouseView.do)
   - 기준 중위소득: [마이홈포털 통합공공임대 입주자격](https://www.myhome.go.kr/hws/portal/cont/selectIntegratedPubRentalHouseView.do)
   - 자산·자동차 기준과 공급유형별 비율도 같은 페이지·LH청약플러스에서 확인
2. `supabase/functions/_shared/eligibility/reference-data.ts`의 `INCOME_THRESHOLDS`(**100% 금액, 원 단위**)·`STANDARD_REQUIREMENTS`를 고친다
3. 같은 값을 넣는 **새 마이그레이션**(`supabase/migrations/NNNN_reference_YYYY.sql`)을 만든다 — 출처 URL과 확인 날짜를 주석으로 남긴다. 이미 적용한 `0006`은 고치지 않는다
4. `reference-data.test.ts`의 대상 파일을 새 마이그레이션으로 바꾸고 `npm test`
5. `npx supabase db push` → 다음 날 새벽 전체 재계산 때 반영

## 암호화 키 교체

소득·자산 금액은 `AMOUNT_ENC_KEY_V{n}`으로 암호화되고, 암호문 앞에 `v{n}`이 붙습니다. 키가 새었거나 바꿔야 할 때:

1. 새 키 만들기: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`
2. **옛 키는 그대로 두고** 새 키를 추가: Vercel과 Supabase 시크릿 양쪽에 `AMOUNT_ENC_KEY_V2=<새 키>`, `AMOUNT_ENC_KEY_CURRENT=2` → 재배포
3. 이후 저장되는 프로필은 새 키로 암호화됩니다. 기존 암호문은 사용자가 프로필을 다시 저장할 때 바뀝니다
4. 옛 키 암호문이 남았는지 확인 (Supabase SQL Editor):
   ```sql
   select count(*) from public.device_profiles
   where enc_monthly_income like 'v1.%' or enc_total_asset like 'v1.%' or enc_car_value like 'v1.%';
   ```
5. 결과가 **0이 된 뒤에만** 옛 키(`AMOUNT_ENC_KEY_V1`)를 양쪽에서 지운다. 0이 아닌데 지우면 그 기기들은 판정이 멈춥니다
