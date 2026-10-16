# U6 pwa-push — 코드 생성 계획

> **이 계획이 U6 코드 생성의 유일한 기준이다.** 단계를 끝낼 때마다 [x]로 표시한다.
> 설계: `aidlc-docs/construction/U6-pwa-push/` (functional-design BR-U6-*, nfr-requirements NFR-U6-*, nfr-design P-*, infrastructure-design)

## Unit 맥락

| 항목 | 내용 |
|---|---|
| 스토리 | US-01 설치, US-03 알림 허용, US-10 하루 1번 알림, US-11 알림 눌러 바로 보기 |
| 의존 (U1) | route guard·respond·logger, api-client, DeviceBootstrap, 정리 cron 0005, RLS 규칙 |
| 의존 (U2) | `isVisible`(K5), `compareFeedItems`, `judgementService().recomputeForDevice` |
| 의존 (U3) | Edge `cronHandler`(비밀 헤더)·`_lib/deps`·`invoke_edge_function`·Vault `cron_secret` |
| 의존 (U4) | `PushPort`·`setPushPort`, `NotifyStep`, `SettingsView`(알림 스위치) |
| 의존 (U5) | `buildFeed`(노출·정렬 → `_shared`로 옮김), 피드 화면(안내 띠 자리), 이동 경로 K8 |
| 코드 위치 | 공용 `supabase/functions/_shared/push/`·`_shared/feed/`, Edge `supabase/functions/dispatch/`·`_lib/push-store.ts`, Next `src/server/handlers/push.ts`·`src/server/db/push-repository.ts`, 화면 `src/features/pwa/`, 정적 `public/sw.js`·`public/icons/`, 앱 정보 `src/app/manifest.ts` |
| 테스트 | Vitest(예시·PBT), Deno check, pgTAP, Playwright E2E(로컬 Supabase) |

### 계획 단계 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 아이콘 원본 사진 | **저장소에 넣지 않는다.** `scripts/render-icons.mjs <사진 경로>`가 PC의 사진을 읽어 PNG만 `public/icons/`에 만든다. 자르기 값(중심·크기)은 스크립트에 기록 | 사진 공개 여부 답을 받지 못함 — 안전한 쪽. 아이콘 PNG는 앱이 쓰므로 어차피 공개된다. 원본도 넣어도 된다고 하시면 그때 추가 |
| U5 피드 로직 이동 | `src/server/feed/build.ts`의 노출·카드 공급유형·정렬 핵심을 `_shared/feed/visible.ts`(Deno 호환 import)로 옮기고, U5 `buildFeed`는 그것을 감싼다. U5 테스트는 그대로 통과해야 함 | 피드와 알림이 같은 코드 (US-10) |
| CI 임시 VAPID | `db-and-e2e`가 실행마다 `npm run vapid:generate -- --env`로 임시 키를 만들어 `.env.local`에 넣는다 | 운영 키를 CI에 두지 않음 |

---

## Part A. 공용 순수 로직 (`_shared`, Deno·Node 공용)

- [ ] **Step 1. 웹 푸시 기본** `_shared/push/base64url.ts`, `vapid.ts`(키 가져오기·ES256 JWT·Authorization 헤더 — P-12·15), `encrypt.ts`(RFC 8291 aes128gcm, 임시 키·salt 주입 가능), `endpoint.ts`(`isAllowedPushEndpoint`·`validateSubscription`·`endpointHash` — BR-U6-50~52, P-14·16) — US-03·10
- [ ] **Step 2. 계획·문구** `_shared/feed/visible.ts`(U5에서 옮김, U5 `build.ts` 수정), `_shared/push/plan.ts`(`planDevice` — BR-U6-03·05·06), `payload.ts`(`buildPayload`·`testPayload` — BR-U6-30~36·65) — US-10·11
- [ ] **Step 3. 보내기·실행기** `send.ts`(`sendPush`: TTL·Urgency·시간 제한·재시도 1번·결과 분류 — BR-U6-40~43, NFR-U6-02·10), `settle.ts`(P-6), `ports.ts`(`DispatchStore`·`PushTransport`·`Clock`), `dispatch.ts`(`runDispatch`: 대상 → 묶음 읽기 → 다시 계산 → 작업 풀 5 → claim·send·record/release → 시간 예산 → 집계 — P-1·3·5·9·10·11) — US-10
- [ ] **Step 4. 예시 테스트** `_shared/push/__tests__/`: **RFC 8291 부록 A 시험 값 바이트 비교**, VAPID JWT 서명 검증(공개 키), 허용 호스트·키 길이, 문구(1건·2건·한쪽만·24글자 자르기), 이동 주소, 결과 분류(201·404·410·429·500·400·네트워크·시간 초과), business-logic-model §1.1 예시(3기기), 기준선 뒤 0건, 모두 실패 → 되돌림
- [ ] **Step 5. 속성 기반 테스트** `push.pbt.test.ts` + 생성기 + **메모리 `DispatchStore`·가짜 푸시 서비스 시뮬레이터**: P-U6-1~10 (domain-entities §7), 1,000대 시간 측정(P-13, 결과 기록)

## Part B. DB

- [ ] **Step 6. 마이그레이션** `supabase/migrations/0008_push.sql`: 칸(`devices.last_push_on`·`push_baseline_at`, `notification_log.kind`, `push_subscriptions.failing_since`), 표(`push_test_log`, `dispatch_runs`) + RLS·권한, 함수 7개(`dispatch_candidates`, `dispatch_device_rows`, `claim_daily_push`, `release_daily_push`, `record_push_result`, `save_push_subscription`, `try_test_push`) + `run_cleanup_push`, cron `dispatch-hourly`·`cleanup-push` (logical-components §3)
- [ ] **Step 7. pgTAP** `supabase/tests/push.test.sql`: claim 두 번째 null·release 조건, record 트랜잭션(기록·성공·실패 시각·만료 삭제·기준선 유지), 저장(옮기기·5개 제한·기준선 한 번), 시험 한도, 정리(실패 7일·보낼 일 없던 구독은 남음), 권한(anon 차단), cron 2개

## Part C. Edge Function

- [ ] **Step 8. `dispatch`** `_lib/push-store.ts`(`DispatchStore` Deno 구현), `_lib/env.ts`에 VAPID 값, `supabase/functions/dispatch/index.ts`(`cronHandler` → `runDispatch` → `dispatch_runs`), `supabase/config.toml`(`verify_jwt = false`), deno check. **1,000건 암호화 CPU 시간 측정 스크립트**(`scripts/measure-push-cpu.ts`, Deno) — 결과를 code-summary에 (Q2=A)

## Part D. Next API

- [ ] **Step 9. API** `src/server/db/push-repository.ts`, `src/server/handlers/push.ts`(`POST /api/push/subscribe` 4KB·검사·저장, `POST /api/push/test` 한도·보내기·결과 반영, `GET /api/push/key` — 미설정이면 503 `PUSH_NOT_CONFIGURED`), 라우트 3개, `deps.ts`, 오류 코드(`TOO_MANY_TESTS`·`NO_SUBSCRIPTION`·`PUSH_NOT_CONFIGURED`), 핸들러 테스트(401·400·413·409·429·503·로그에 주소·키 없음) — US-03

## Part E. 브라우저

- [ ] **Step 10. 설치 요건** `public/sw.js`(push·notificationclick·pushsubscriptionchange, 캐시 없음 — P-18·19·22), `src/app/manifest.ts`(이름·아이콘·색), `layout.tsx` iPhone 메타·`apple-touch-icon`, `next.config` `sw.js` 헤더(`no-cache`), `scripts/render-icons.mjs` → `public/icons/` PNG(192·512·maskable·180), 임시 SVG 정리 — US-01
- [ ] **Step 11. 화면 순수 로직** `src/features/pwa/model/`: `installPlatform`, `isStandalone`, `shouldShowInstallHint`(7일), `deniedHelp`, `safeClickUrl`(sw와 같은 규칙 — sw는 같은 함수를 복사하지 않고 테스트로 두 구현이 같은지 확인), 공개 키 변경 감지 + 예시 테스트
- [ ] **Step 12. 알림 연결** `PwaProvider`(SW 등록, 설치 상태·`beforeinstallprompt`, `setPushPort` 구현: supported·needs_install·denied·subscribe — P-20·21, 앱 열 때 구독 다시 저장·SW 메시지 — P-22), U4 `push-port.ts`에 `needs_install`, `NotifyStep`·`SettingsView` 결과 연결(BR-U6-61·63·81), `layout.tsx` — US-03
- [ ] **Step 13. 안내 화면** `src/features/pwa/ui/`: `InstallHintBanner`(U5 피드 위), `InstallGuide`(대화 상자·초점), `IosInstallSteps`(SVG 그림 3장 + 글), `AndroidInstall`, `DeniedHelp`, `InstallSection`·`TestPushButton`(설정) — US-01·03

## Part F. 스크립트·E2E·문서·검증

- [ ] **Step 14. 스크립트·CI** `scripts/generate-vapid.mjs`(`npm run vapid:generate`: 화면에 3값 출력, `--env` 옵션은 CI용으로 `.env.local`에 덧붙임), `.github/workflows/e2e.yml`에 임시 VAPID, `.env.example` 갱신
- [ ] **Step 15. E2E** `e2e/pwa.spec.ts`: manifest·SW 등록, 설치 안내 띠(닫기 → 7일), 설정의 설치 칸, 알림 켜기(Chromium: 권한 허용 흉내 → 구독 저장 → 서버 행 확인), 시험 알림(푸시 서비스 요청 가로채기 → 200 결과 문구), 거부 안내, `/api/push/key`, axe. iPhone(WebKit)은 `needs_install` 안내 확인
- [ ] **Step 16. 문서** README("알림과 설치 (U6)"), `aidlc-docs/construction/U6-pwa-push/code/setup-guide-u6.md`(운영 반영 ①~⑧, 키 교체, 되돌리기, 확인 쿼리), `code-summary.md`
- [ ] **Step 17. 검증**: typecheck·lint·test(+PBT seed 반복)·build·deno check, 로컬 Supabase pgTAP·E2E(Android·iPhone), 커밋 (push는 사용자 확인 후)

## 스토리 추적

| 스토리 | Step |
|---|---|
| US-01 설치 | 10, 11, 13, 15 |
| US-03 알림 허용 | 1, 6, 9, 12, 13, 15 |
| US-10 하루 1번 알림 | 1, 2, 3, 4, 5, 6, 7, 8 |
| US-11 알림 눌러 보기 | 2, 10, 11 |
