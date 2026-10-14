# U1 setup-data-platform — 코드 생성 계획

> **이 계획이 U1 Code Generation의 유일한 기준(single source of truth)이다.** 단계 순서대로 실행하고, 끝난 단계는 바로 [x]로 표시한다.
> 워크스페이스 루트: `d:\백재인\스터디\silverCheongYak-radar` (Greenfield). 애플리케이션 코드는 루트에, 문서는 `aidlc-docs/`에만 둔다.

---

## 1. Unit 맥락

| 항목 | 내용 |
|---|---|
| 담당 스토리 | US-02(기기 등록 부분). 기여: US-01(아이콘 자리), US-03(구독 테이블), US-08(device_profiles·RPC 틀), US-19(디자인 토큰), US-20(연쇄 삭제·`delete_device`) |
| 의존 | 없음 (첫 Unit) |
| 제공 계약 | K1 DB 스키마, K2 Repository 인터페이스, K3 기기 인증 헤더 |
| 소유 엔티티 | E1~E13 전체 구조 (값 시드는 U2) |
| 경계 | 판정·암호화 로직(U2), 수집(U3), 화면 기능(U4~U6)은 만들지 않음. `DELETE /api/device`는 U4 |

## 2. 사전 점검 결과 (2026-10-14)

| 도구 | 상태 | 영향 |
|---|---|---|
| Node.js | 24.19.0 (Active LTS) | OK |
| npm | 11.17.0 | OK |
| Supabase CLI | 2.120.0 (`npx supabase`) | OK |
| git | 2.56.0 | OK |
| **Docker** | **없음** | 로컬 Supabase(`supabase start`), DB 테스트(pgTAP), E2E 실행 불가 → Step 15·18의 해당 항목은 **Docker 설치 후 사용자 실행 또는 Build and Test로 넘김** |
| GitHub CLI(`gh`) | 없음 | 저장소 생성은 사용자가 웹에서 (Step 19) |

## 3. 설계 문서 대비 조정 사항 (이 계획에서 확정)

| # | 조정 | 이유 |
|---|---|---|
| CG-1 | Repository **인터페이스와 행 변환(mapper)**만 `_shared/db/`에 두고, **Deno 구현은 `supabase/functions/_lib/db/`**(U3에서 생성), Node 구현은 `src/server/db/` | `_shared`는 npm 패키지 import 금지 규칙(tech-stack §4). supabase-js를 쓰는 구현은 `_shared`에 둘 수 없음. unit-of-work.md의 `_shared/db/` "Deno 구현" 표기를 이렇게 정정 |
| CG-2 | AmountCipher(L5)는 U2에서 구현. U1은 환경 변수 이름과 `ServerEnv` 검증만 | U2 범위 |
| CG-3 | `manifest.json`·서비스워커는 U6. U1은 `public/icons/` 자리와 앱 이름만 | U6 범위 |
| CG-4 | cheongYak-radar에서 **복사하는 파일 없음**. `BottomNav.tsx`, `src/lib/supabase/admin.ts`는 **참고만** 하고 새로 작성 | 최신 Next·Tailwind 차이(tech-stack §8), 로그인 제거 |

---

## 4. 실행 단계

### Part A. 프로젝트 셋업

- [x] **Step 1. 프로젝트 구조·설정 파일** (Greenfield)
  - [x] 1.1 최신 안정 버전 확인: `npm view <pkg> version` (next, react, react-dom, typescript, tailwindcss, @tailwindcss/postcss, @supabase/supabase-js, vitest, fast-check, @fast-check/vitest, @playwright/test, @axe-core/playwright, eslint, eslint-config-next, server-only, @types/*)
  - [x] 1.2 `package.json` (버전 고정, `engines`, scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `e2e`, `deno:check`, `db:reset`, `db:test`)
  - [x] 1.3 `tsconfig.json` (strict, `@/*`, `@shared/*`, `allowImportingTsExtensions`, `supabase/functions/_shared` 포함·나머지 functions 제외)
  - [x] 1.4 `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vercel.json`(regions `icn1`)
  - [x] 1.5 `vitest.config.ts` + `vitest.setup.ts` (FC_SEED·FC_NUM_RUNS 읽기, seed 출력, `fc.configureGlobal`)
  - [x] 1.6 `playwright.config.ts` (모바일 뷰포트 2종, `e2e/`)
  - [x] 1.7 `.nvmrc`, `.env.example`, `.gitignore` 보강(`.env*` 유지, `supabase/.temp` 등)
  - [x] 1.8 `npx supabase init` → `supabase/config.toml` (프로젝트 ID `mojjine-alimi`)
  - [x] 1.9 `npm install`

### Part B. 비즈니스 로직 (`_shared`, 순수 함수)

- [x] **Step 2. 비즈니스 로직 생성**
  - [x] 2.1 `supabase/functions/_shared/security/token.ts`: `generateDeviceId`, `generateToken`, `hashToken`, `verifyToken`(상수 시간), `isValidDeviceId`, `isValidToken` (BR-U1-01·02·06·07)
  - [x] 2.2 `supabase/functions/_shared/security/auth-headers.ts`: `buildAuthHeaders`, `parseAuthHeaders` (K3)
  - [x] 2.3 `supabase/functions/_shared/domain/retention.ts`: `isDeviceExpired`, `noticeRetentionBaseDate`, `isNoticeExpired`, `noticeStatus` (BR-U1-13·14, E3 파생값)
  - [x] 2.4 `supabase/functions/_shared/log/logger.ts`: `redact`, `createLogger`(JSON 한 줄, deviceId 8자리) (P-S5)
  - [x] 2.5 `supabase/functions/_shared/http/retry.ts`: `shouldRetry` (P-R1)
  - [x] 2.6 `supabase/functions/_shared/http/errors.ts`: `ApiError` 코드 목록(`AUTH_MISSING`, `DEVICE_UNKNOWN`, `TOKEN_MISMATCH`, `TOO_MANY_REGISTRATIONS`, `PAYLOAD_TOO_LARGE`, `BAD_REQUEST`, `NETWORK`, `SERVER`)과 쉬운 한국어 메시지 (BR-U1-20)
- [x] **Step 3. 비즈니스 로직 테스트** (예시 기반 + PBT, PBT-02~08·10)
  - [x] 3.1 공용 생성기 `supabase/functions/_shared/__tests__/arbitraries/` (`deviceId`, `token`, `dateAround`, `noticeSchedule`, `logPayload`)
  - [x] 3.2 `token.test.ts` + `token.pbt.test.ts` (검증 성공 불변식, 다른 토큰 실패, 생성값 형식 통과)
  - [x] 3.3 `auth-headers.pbt.test.ts` (왕복)
  - [x] 3.4 `retention.test.ts`(365일·180일 경계 예시) + `retention.pbt.test.ts` (시간 단조성, status 정확히 하나, applyEnd 없으면 closed 아님)
  - [x] 3.5 `logger.test.ts` + `logger.pbt.test.ts` (금지 키 미노출, redact 멱등)
  - [x] 3.6 `retry.pbt.test.ts` (408 제외 4xx false, 408·5xx·네트워크 true)
- [x] **Step 4. 비즈니스 로직 요약** → `aidlc-docs/construction/U1-setup-data-platform/code/business-logic-summary.md`

### Part C. Repository 계층

- [x] **Step 5. Repository 생성**
  - [x] 5.1 `supabase/functions/_shared/db/types.ts`: 엔티티 도메인 타입(E1~E13) + 행 타입
  - [x] 5.2 `supabase/functions/_shared/db/mappers.ts`: `toRow`/`fromRow` (Device, DeviceProfileStored, Notice, HousingUnit, Judgement, PushSubscription)
  - [x] 5.3 `supabase/functions/_shared/db/repositories.ts`: 인터페이스 (DeviceRepository, NoticeRepository, ReferenceDataRepository, JudgementRepository) (CG-1)
  - [x] 5.4 `src/server/db/client.ts` (서버 전용 supabase-js, `server-only`)
  - [x] 5.5 `src/server/db/device-repository.ts` (`register` → RPC `register_device`, `findAuth`, `touch`, `deleteAll` → RPC `delete_device`)
  - [x] 5.6 `src/server/db/reference-repository.ts` (지구·공급유형 라벨 조회, 나머지는 U2)
- [x] **Step 6. Repository 테스트**
  - [x] 6.1 `mappers.pbt.test.ts` (엔티티별 `fromRow(toRow(x)) = x`, PBT-02)
  - [x] 6.2 `device-repository.test.ts` (supabase 클라이언트 가짜 객체로 RPC 결과 4종 매핑)
- [x] **Step 7. Repository 요약** → `.../code/repository-summary.md`

### Part D. API 계층 (Next 서버)

- [x] **Step 8. API 생성**
  - [x] 8.1 `src/server/env.ts` (`server-only`, 필수 값 검증) (L6)
  - [x] 8.2 `src/server/http/respond.ts` (`{ code, message }` 응답, requestId 헤더)
  - [x] 8.3 `src/server/auth/route-guard.ts`: `withDevice(handler, { maxBodyBytes })` (본문 크기 → 인증 → touch(1시간) → 로그) (L3)
  - [x] 8.4 `src/server/cache/reference-cache.ts`: 10분 TTL + 진행 중 Promise 공유 (L10)
  - [x] 8.5 `src/app/api/device/route.ts`: `POST` 등록 (201 created / 200 existing / 409 conflict / 429 / 400 / 413) (BR-U1-02~05, P-S4)
  - [x] 8.6 `src/app/api/health/route.ts`: `GET` (L12)
- [x] **Step 9. API 테스트**
  - [x] 9.1 `route-guard.test.ts` (헤더 없음·기기 없음·토큰 불일치·성공·touch 간격·본문 초과)
  - [x] 9.2 `device/route.test.ts` (응답 6종)
  - [x] 9.3 `reference-cache.test.ts` (TTL, 동시 요청 1회 읽기) + `reference-cache.pbt.test.ts` (TTL 판단 단조성)
  - [x] 9.4 `health/route.test.ts`
- [x] **Step 10. API 요약** → `.../code/api-summary.md`

### Part E. 프론트엔드 (AppChrome·기기 준비)

- [x] **Step 11. 프론트엔드 생성**
  - [x] 11.1 `src/app/globals.css`: 디자인 토큰 CSS 변수(`--scale`, 글씨·터치 영역), Tailwind 테마 연결 (NFR-U1-26)
  - [x] 11.2 `src/app/layout.tsx`: `lang="ko"`, 메타데이터(앱 이름), DisplayModeRoot(기본 normal), DeviceBootstrap, AppHeader, BottomNav
  - [x] 11.3 `src/features/app-chrome/`: `AppHeader.tsx`, `BottomNav.tsx`(48px, 색+굵기), `ErrorMessage.tsx`
  - [x] 11.4 `src/features/device/`: `identity-store.ts`(L2), `api-client.ts`(`apiFetch`: 헤더·1회 재시도·401 재등록·`onReRegistered` 훅) (L1), `DeviceBootstrap.tsx`, `BootError.tsx`
  - [x] 11.5 자리 페이지: `src/app/page.tsx`, `src/app/bookmarks/page.tsx`, `src/app/settings/page.tsx` ("준비 중" 안내, U4·U5에서 교체)
  - [x] 11.6 `public/icons/` 자리 (임시 아이콘 SVG)
- [x] **Step 12. 프론트엔드 테스트**
  - [x] 12.1 `identity-store.test.ts` (생성·보관·손상 값 처리)
  - [x] 12.2 `api-client.test.ts` (헤더 첨부, 5xx 1회 재시도, 4xx 재시도 없음, 401 재등록 후 1회 재요청, 네트워크 오류 메시지)
  - [x] 12.3 `e2e/app-shell.spec.ts` (첫 실행 등록 → 하단 메뉴 3개 이동 → axe 위반 0건) *(실행은 Docker 설치 후)*
- [x] **Step 13. 프론트엔드 요약** → `.../code/frontend-summary.md`

### Part F. 데이터베이스

- [x] **Step 14. 마이그레이션 스크립트** (`supabase/migrations/`)
  - [x] 14.1 `0001_extensions.sql` (pgcrypto, pg_cron, pg_net, supabase_vault)
  - [x] 14.2 `0002_schema.sql` (E1~E13 테이블·제약·FK cascade·인덱스)
  - [x] 14.3 `0003_security.sql` (RLS 켜기, anon·authenticated 권한 회수, 기본 권한 변경)
  - [x] 14.4 `0004_rpc.sql` (RPC 8개: `register_device`(한도 20/시간), `delete_device`, `cleanup_expired_devices`, `cleanup_expired_notices`, `replace_judgements_for_device`, `replace_judgements_for_notices`, `upsert_notice_bundle`(틀), `save_device_profile`; service_role 실행 권한만)
  - [x] 14.5 `0005_cron_cleanup.sql` (`cleanup-devices` `0 19 * * *`, `cleanup-notices` `5 19 * * *`, 결과 `collect_runs` 기록, 재실행 안전)
- [x] **Step 15. DB 테스트** (`supabase/tests/*.test.sql`, pgTAP)
  - [x] 15.1 `security.test.sql` (anon·authenticated로 모든 테이블 조회·쓰기 실패, RPC 실행 실패)
  - [x] 15.2 `rpc.test.sql` (`register_device` 4가지 결과, 연쇄 삭제, 정리 함수 경계값)
  - [ ] 15.3 *(실행은 Docker 설치 후 `npm run db:test`)* — 미실행, Build and Test로 넘김

### Part G. 문서·배포 산출물

- [x] **Step 16. CI·배포 산출물**
  - [x] 16.1 `.github/workflows/ci.yml` (install → typecheck → lint → deno check → test, `FC_SEED` 생성·echo)
  - [x] 16.2 `.github/workflows/e2e.yml` (`workflow_dispatch`, main push: Supabase 로컬 스택 → build → Playwright)
  - [x] 16.3 `.github/workflows/keepalive.yml` (매일, `vars.APP_URL`/api/health)
- [x] **Step 17. 문서**
  - [x] 17.1 `README.md` (소개, 요구 도구, 로컬 실행, scripts, 환경 변수, 테스트·PBT seed 재현법)
  - [x] 17.2 `aidlc-docs/construction/U1-setup-data-platform/code/setup-guide.md` (첫 구축 순서: Docker → GitHub → Supabase → 시크릿 → Vercel → keepalive, 사용자가 할 일 체크리스트)
  - [x] 17.3 `aidlc-docs/construction/U1-setup-data-platform/code/code-summary.md` (생성 파일 목록, 버전, 스토리 대응)

### Part H. 검증

- [x] **Step 18. 로컬 검증 (AI 실행)**
  - [x] 18.1 `npm run typecheck`
  - [x] 18.2 `npm run lint`
  - [x] 18.3 `npm test` (단위 + PBT, seed 출력 확인)
  - [x] 18.4 `npm run build`
  - [x] 18.5 `deno check`: Deno 없음 → CI에서 확인하는 것으로 기록
  - [x] 18.6 Docker 필요 항목(`db:reset`, `db:test`, `e2e`)은 **실행하지 않음**으로 기록하고 Build and Test 단계로 넘김
- [ ] **Step 19. 외부 구축 (사용자 작업, setup-guide.md 기준)**
  - [ ] 19.1 Docker Desktop 설치
  - [ ] 19.2 GitHub 저장소 생성 → AI가 로컬 `git init`·첫 커밋 준비 (push는 사용자 확인 후) — 저장소 생성·init·첫 커밋(5819cde) 완료, push 확인 대기
  - [ ] 19.3 운영 Supabase 프로젝트 생성·`supabase link`·`db push`
  - [ ] 19.4 Vercel 프로젝트 생성·환경 변수·첫 배포 (원하시면 Vercel 연동 도구로 AI가 도움)
  - [ ] 19.5 keepalive 수동 실행 1번

---

## 5. 스토리 대응

| 스토리 | 단계 |
|---|---|
| US-02 (기기 등록) | Step 2.1·2.2, 8.5, 11.4, 12.2, 14.4 |
| US-19 기여 (디자인 토큰) | Step 11.1·11.2 |
| US-20 기여 (연쇄 삭제) | Step 14.2·14.4, 15.2 |
| US-01·03·08 기여 (테이블·RPC 틀·아이콘 자리) | Step 11.6, 14.2·14.4 |

## 6. PBT 대응 (PBT-01에서 식별한 속성 → 테스트 단계)

| 속성 | 단계 |
|---|---|
| 토큰 검증 불변식 2개, 생성값 형식 | 3.2 |
| 인증 헤더 왕복 | 3.3 |
| 보관 판단 단조성·경계, 공고 상태 | 3.4 |
| redact 불변식·멱등 | 3.5 |
| shouldRetry 불변식 | 3.6 |
| 행 변환 왕복 | 6.1 |
| 정리 작업 멱등 | 15.2 (DB 테스트, Docker 필요) |
| 캐시 TTL 단조성 | 9.3 |
