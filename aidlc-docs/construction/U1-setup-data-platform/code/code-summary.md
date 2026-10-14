# U1 setup-data-platform — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U1-setup-data-platform-code-generation-plan.md`
> 세부: [business-logic-summary.md](business-logic-summary.md) · [repository-summary.md](repository-summary.md) · [api-summary.md](api-summary.md) · [frontend-summary.md](frontend-summary.md) · [setup-guide.md](setup-guide.md)

## 1. 버전 (2026-10-14 `npm view`로 확인해 고정)

| 패키지 | 버전 | 비고 |
|---|---|---|
| next / eslint-config-next | 16.4.0 | Q1=B 최신 안정 |
| react / react-dom | 19.3.0 | |
| typescript | **6.0.3** | 최신은 7.0.2(Go 네이티브 컴파일러)지만, Next.js·ESLint가 쓰는 TypeScript JS API와의 호환을 우선해 6.x 최신을 선택. 생태계가 7을 지원하면 다시 검토 |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | CSS 기반 설정(`@theme inline`) |
| @supabase/supabase-js | 2.117.3 | |
| supabase (CLI) | 2.120.0 | |
| vitest | 5.0.4 | |
| fast-check / @fast-check/vitest | 4.10.2 / 0.5.0 | PBT-09 |
| @playwright/test / @axe-core/playwright | 1.64.1 / 4.13.0 | |
| eslint | 10.12.0 | flat config |
| @types/node | 24.19.2 | Node 24 LTS에 맞춤 (최신 26.x 대신) |

**npm audit**: 운영 의존성 취약점 0건. 개발 의존성에 `braces` 관련 high 5건(`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` 경유). 배포 산출물에는 포함되지 않는다. 상위 패키지 업데이트 때 다시 확인한다.

## 2. 생성 파일 (애플리케이션 코드, 워크스페이스 루트)

| 영역 | 파일 |
|---|---|
| 설정 | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.global-setup.ts`, `vitest.setup.ts`, `vitest.server-only-stub.ts`, `playwright.config.ts`, `vercel.json`, `.nvmrc`, `.env.example`, `.gitignore`(보강), `supabase/config.toml` |
| `_shared` 순수 코드 | `supabase/functions/_shared/{encoding/base64url, security/token, security/auth-headers, domain/dates, domain/retention, log/logger, http/retry, http/errors, db/types, db/mappers, db/repositories}.ts` |
| `_shared` 테스트 | `__tests__/arbitraries/index.ts`, `security/__tests__/{token.test, token.pbt.test, auth-headers.pbt.test}.ts`, `domain/__tests__/{retention.test, retention.pbt.test}.ts`, `log/__tests__/{logger.test, logger.pbt.test}.ts`, `http/__tests__/retry.pbt.test.ts`, `db/__tests__/mappers.pbt.test.ts` |
| 서버 | `src/server/{env, deps}.ts`, `src/server/http/respond.ts`, `src/server/auth/route-guard.ts`, `src/server/cache/{ttl-cache, reference-cache}.ts`, `src/server/db/{client, device-repository, reference-repository}.ts`, `src/server/handlers/{register-device, health}.ts` |
| 서버 테스트 | `src/server/__tests__/helpers.ts`, `src/server/db/__tests__/{fake-db, device-repository.test}.ts`, `src/server/auth/__tests__/route-guard.test.ts`, `src/server/handlers/__tests__/{register-device, health}.test.ts`, `src/server/cache/__tests__/{ttl-cache.test, ttl-cache.pbt.test}.ts` |
| API 라우트 | `src/app/api/device/route.ts`, `src/app/api/health/route.ts` |
| 화면 | `src/app/{layout.tsx, globals.css, page.tsx, icon.svg}`, `src/app/bookmarks/page.tsx`, `src/app/settings/page.tsx`, `src/features/app-chrome/{AppHeader, BottomNav, ErrorMessage, Placeholder}.tsx`, `src/features/app-chrome/constants.ts`, `src/features/device/{identity-store, api-client}.ts`, `src/features/device/{DeviceBootstrap, BootError}.tsx`, `public/icons/` |
| 화면 테스트 | `src/features/device/__tests__/{identity-store, api-client}.test.ts`, `src/features/app-chrome/__tests__/bottom-nav.test.ts`, `e2e/app-shell.spec.ts` |
| DB | `supabase/migrations/{0001_extensions, 0002_schema, 0003_security, 0004_rpc, 0005_cron_cleanup}.sql`, `supabase/seed.sql`, `supabase/tests/{security, rpc}.test.sql` |
| CI·스크립트 | `.github/workflows/{ci, e2e, keepalive}.yml`, `scripts/deno-check.mjs` |
| 문서 | `README.md` |

## 3. 검증 결과 (Step 18)

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 없음 |
| `npm run lint` | ✅ 오류 없음 |
| `npm test` | ✅ 18개 파일, 97개 테스트 통과 (예시 기반 + PBT), seed 출력·재현 확인 |
| `npm run build` | ✅ 성공 (`/api/device`, `/api/health` 동적, 화면 3개 정적) |
| 빌드 서버 스모크 테스트 | ✅ (버그 1건 발견·수정 후) 헬스 503(환경 변수 없음), 등록 400·413·500 형식, `lang="ko"`, 로그에 토큰 없음 |
| `npm run deno:check` | ⏸ 이 PC에 Deno 없음 → CI(`ci.yml`)에서 확인 |
| `npm run db:test` (pgTAP 53건) | ⏸ Docker 없음 → Docker 설치 후 또는 `e2e.yml`(CI)에서 확인 |
| `npm run e2e` | ⏸ Docker 없음 → Docker 설치 후 또는 `e2e.yml`에서 확인 |

## 4. 설계 대비 변경·결정

| # | 내용 | 반영 문서 |
|---|---|---|
| CG-1~4 | 계획에서 정한 조정 (Deno Repository 위치, Cipher·manifest 범위, 복사 파일 없음) | 계획 §3 |
| CG-5 | TypeScript 6.0.3 선택 | 위 §1 |
| CG-6 | `collect_runs.deleted_count` 컬럼 추가 (정리 작업 삭제 수) | domain-entities.md E13 |
| CG-7 | RLS `force` 사용 안 함 (pg_cron 정리가 소유자 권한으로 실행되어야 함) | `0003_security.sql` 주석 |
| CG-8 | 핸들러 의존성 지연 생성 (스모크 테스트 버그) | api-summary.md |
| CG-9 | PBT seed 출력을 global setup으로 이동, `test.prop`은 블록 본문 규칙 | business-logic-summary.md, repository-summary.md, README |
| CG-10 | GitHub 예약 워크플로 60일 자동 꺼짐 위험 기록 | keepalive.yml, setup-guide.md |

## 5. 스토리 대응

| 스토리 | 상태 |
|---|---|
| US-02 (기기 등록 부분) | ✅ 앱 시작 시 자동 등록, 재방문 시 무요청, 재등록 흐름. "시작하기" 안내 화면은 U4 |
| US-19 기여 (디자인 토큰·쉬운 모드 배율) | ✅ 토큰·`data-mode` 준비. 전환 UI는 U4 |
| US-20 기여 (연쇄 삭제) | ✅ FK cascade + `delete_device` RPC. API·화면은 U4 |
| US-01·03·08 기여 | ✅ 아이콘 자리, 구독 테이블, `save_device_profile` 틀 |

## 6. PBT 준수 (Code Generation)

| 규칙 | 상태 | 근거 |
|---|---|---|
| PBT-02 왕복 | ✅ | 인증 헤더, 엔티티 7종 행 변환, addDays/diffDays |
| PBT-03 불변식 | ✅ | 토큰 검증, 보관 단조성·경계, 공고 상태, redact 미노출, shouldRetry, 캐시 TTL |
| PBT-04 멱등 | ✅ | redact. 정리 작업 멱등은 pgTAP(`rpc.test.sql`)에서 확인 (Docker 후 실행) |
| PBT-05 오라클 | N/A | 비교할 참조 구현 없음 |
| PBT-06 상태 기반 | N/A | U1에 상태 기계형 컴포넌트 없음 (캐시는 예시 테스트 + TTL 속성으로 확인) |
| PBT-07 생성기 품질 | ✅ | `_shared/__tests__/arbitraries/` 공용 도메인 생성기 |
| PBT-08 shrinking·재현 | ✅ | shrinking 기본값, seed 출력·`FC_SEED` 재현, CI seed echo, retry 0 |
| PBT-09 프레임워크 | ✅ | fast-check + @fast-check/vitest, package.json에 포함 |
| PBT-10 보완 관계 | ✅ | 핵심 경계는 예시 테스트(`*.test.ts`)로 고정, 속성은 `*.pbt.test.ts`로 분리 |
