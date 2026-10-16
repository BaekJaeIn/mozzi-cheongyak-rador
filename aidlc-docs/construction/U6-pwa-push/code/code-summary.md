# U6 pwa-push — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U6-pwa-push-code-generation-plan.md`
> 설계: `aidlc-docs/construction/U6-pwa-push/` (functional-design, nfr-requirements, nfr-design, infrastructure-design)
> 운영 반영: [setup-guide-u6.md](setup-guide-u6.md)

## 1. 생성·변경 파일

| 영역 | 파일 |
|---|---|
| 웹 푸시 (공용, Deno·Node) | `supabase/functions/_shared/push/`: `encrypt.ts`(RFC 8291 aes128gcm), `vapid.ts`(RFC 8292 ES256 JWT·키 생성), `endpoint.ts`(허용 호스트·구독 검사·로그용 해시), `payload.ts`(문구·2KB), `plan.ts`(`planDevice`·`visibleNoticeIds`), `send.ts`(보내기·재시도·결과 분류·`settleDevice`), `dispatch.ts`(실행기·나눠 부르기), `store-rpc.ts`(DB 함수 호출), `test-limit.ts` |
| 피드 노출 공용화 | `_shared/feed/visible.ts` (U5 `src/server/feed/build.ts`에서 옮김 — `buildFeed`·`needsRecompute` 등). U5 `build.ts`·`types.ts`·`api-types.ts`는 여기서 다시 내보냄 |
| DB | `supabase/migrations/0008_push.sql` (칸 4개, 표 `push_test_log`·`dispatch_runs`, 함수 8개, cron `dispatch-hourly`·`cleanup-push`), `supabase/tests/push.test.sql`(31) |
| Edge Function | `supabase/functions/dispatch/index.ts`, `_lib/deps.ts`(db·`recomputeDevice` 노출), `_lib/env.ts`(VAPID), `_lib/guard.ts`(`req` 전달), `supabase/config.toml` |
| Next API | `src/server/handlers/push.ts`, `src/server/db/push-repository.ts`, `src/server/env.ts`(`getVapidEnv`), `src/server/deps.ts`, 라우트 `src/app/api/push/{subscribe,test,key}/route.ts`, 오류 코드 `TOO_MANY_TESTS`·`NO_SUBSCRIPTION`·`PUSH_NOT_CONFIGURED` |
| 브라우저 | `public/sw.js`, `src/app/manifest.ts`, `next.config.ts`(`/sw.js` no-cache), `layout.tsx`(iPhone 메타·아이콘, `PwaProvider`·`PushResync`), `src/features/pwa/`(`PwaProvider.tsx`, `model/install.ts`·`click-url.ts`, `ui/InstallGuide.tsx`·`PwaPanels.tsx`) |
| 아이콘 | `assets/icon-source.jpg`(반려견 사진에서 머리 부분, 사용자 허락), `public/icons/{icon,maskable}-{192,512}.png`·`apple-touch-icon.png`, `src/app/icon.png`. 임시 SVG 3개 삭제 |
| U4·U5 연결 | `push-port.ts`(`needs_install`), `NotifyStep.tsx`(설치·거부 안내), `SettingsView.tsx`(설치 칸·시험 알림·거부 안내), `FeedView.tsx`(설치 안내 띠) |
| 스크립트·CI | `scripts/generate-vapid.mjs`(`npm run vapid:generate`), `scripts/render-icons.mjs`(`npm run icons:render`), `scripts/measure-push-cpu.ts`, `.github/workflows/e2e.yml`(임시 VAPID), `.env.example` |
| 테스트 | `_shared/push/__tests__/`: `webpush.test.ts`(RFC 8291 시험 값 포함), `dispatch.test.ts`, `push.pbt.test.ts`(P-U6-1~8, P-13), `sim.ts`(메모리 DB·가짜 푸시 서비스). `src/features/pwa/model/__tests__/pwa-model.test.ts`(P-U6-9·10, sw.js와 같은 규칙), `src/server/handlers/__tests__/push.test.ts`, `e2e/pwa.spec.ts`(7개), `e2e/helpers.ts`(`subscriptionCount`) |
| 문서 | README "알림과 설치 (U6)", `setup-guide-u6.md` |

## 2. 설계·계획 대비 조정

| 설계·계획 | 실제 | 이유 |
|---|---|---|
| `_shared/push/base64url.ts` 새로 만들기 | U1 `_shared/encoding/base64url.ts` 재사용 | 같은 기능이 이미 있음 |
| 기준선을 DB 함수가 계산 | Next 핸들러가 **피드와 같은 코드**(`visibleNoticeIds`)로 계산해 `save_push_subscription`에 넘김 | 노출 규칙을 SQL로 한 번 더 쓰면 피드와 어긋날 수 있다 |
| `DispatchStore` Deno 구현은 `_lib/push-store.ts` | `_shared/push/store-rpc.ts` (rpc 모양만 받는 공용 구현) | Node의 구독 저장·시험 한도도 같은 호출을 씀 |
| CPU 측정 후 1초 넘으면 나눠 부르기 추가 (Q2=A) | **측정 1,000건 = 1.79초(건당 1.8ms)** → 나눠 부르기(`{"part","parts"}`, 기기 ID 해시) 구현, 400대 넘으면 경고. cron은 지금 1번 호출 | 지금 규모(수십 대 ≈ 50ms)는 1번이면 충분, 늘면 cron만 바꾸면 됨 |
| 아이콘 원본은 저장소 밖 (계획 초안) | 사용자 허락("공개해도 돼")으로 `assets/icon-source.jpg`(1024px JPEG 170KB) 포함 | 다시 만들 수 있게 |
| 시험 알림 순서: 한도 → 구독 | 구독 → 한도 | 구독이 없을 때 한도를 쓰지 않게 |
| U4 마법사: 저장 → 홈 | 저장 → **알림 단계**(US-03) → 홈. U4 E2E에 `skipNotify` 추가 | U6가 `setPushPort`를 채워 설계대로 동작 |
| — | 끊김 흉내 E2E 2개(U4·U5)에 `serviceWorkers: "block"` | 서비스워커가 있는 페이지에서 WebKit이 `page.route` 가로채기를 거치지 않음. 실제 사용자 동작과는 무관 |

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck`·`lint` | ✅ |
| `npm test` | ✅ 54개 파일, **611개 테스트**(U6 추가 약 90개), 서로 다른 seed 3번 + PBT 파일 단독 4번 |
| 웹 푸시 암호화 | ✅ **RFC 8291 부록 A 공식 시험 값과 바이트 단위로 같음**, VAPID 서명 공개 키 검증 |
| 1,000대 발송 시뮬레이션 | ✅ 3.3초 (Node, 가짜 푸시 서비스 지연 5ms, 동시 5) — 예산 45초 |
| Deno CPU 측정 | 1,000건 1.79초 (건당 1.8ms) → 나눠 부르기 준비 |
| `npm run deno:check`·`build` | ✅ (`/manifest.webmanifest`, `/api/push/*`) |
| DB 테스트 (pgTAP, 로컬) | ✅ **120/120** (U6 31개). 테스트가 만든 기기만 세도록 격리 |
| E2E (로컬 Supabase) | ✅ **53 통과 + 3 건너뜀**(기기별 전용 테스트) — Android·iPhone, axe 0 |
| `dispatch` 실제 실행 (로컬 `functions serve`) | ✅ 틀린 비밀값 401 → 대상 기기 찾음 → 알릴 공고 없으면 건너뜀 → 공고 넣고 다시: 암호화해 **실제 FCM으로 전송** → 가짜 구독이라 만료 응답 → 구독 삭제·몫 되돌림·기록 없음, `dispatch_runs` 기록 |

## 4. 남은 일

| 단계 | 내용 |
|---|---|
| push | 사용자 확인 후 → CI |
| 운영 반영 | [setup-guide-u6.md](setup-guide-u6.md) ①~⑧ (DB 0008, VAPID 키 Supabase·Vercel, 함수 배포, push, 휴대폰 알림 켜기·시험, Vault `dispatch_url`) |
| 실기기 확인 | 어머니 iPhone(홈 화면 앱)·Android에서 시험 알림 도착, 다음 날 9시 알림 (Build and Test) |
| Build and Test | 전체 Unit 통합 검증, 4G 피드 표시 시간(U5에서 넘김) |
