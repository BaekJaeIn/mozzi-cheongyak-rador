# U1 setup-data-platform — 기술 스택 결정

> 원칙: Q1=B에 따라 **작성 시점의 최신 안정(stable) 버전**을 쓴다. 정확한 버전 번호는 Code Generation 첫 단계에서 `npm view <pkg> version`으로 확인해 `package.json`에 고정하고, `aidlc-docs/construction/U1-setup-data-platform/code/`에 기록한다.

---

## 1. 런타임 · 프레임워크

| 영역 | 선택 | 이유 · 주의점 |
|---|---|---|
| Node.js | 현재 **Active LTS** | Vercel 함수 런타임과 같은 메이저로 맞춤. `engines`와 `.nvmrc`에 명시 |
| Next.js | **최신 안정 버전** (App Router) | Q1=B. 지원 기간·보안 패치 우선 |
| React | Next.js가 요구하는 버전 | |
| TypeScript | 최신 안정, `strict: true` | NFR-U1-20 |
| Tailwind CSS | 최신 안정 메이저 | 디자인 토큰을 CSS 변수로 연결 (NFR-U1-26). cheongYak-radar(v3)와 설정 방식이 다를 수 있으므로 설정 파일은 복사하지 않고 새로 작성 |
| Supabase JS | `@supabase/supabase-js` v2 최신 | Next 서버(Node)와 Edge Function(Deno) 공용 |
| Supabase CLI | 최신 | 마이그레이션·함수 배포·로컬 개발 |
| Edge Function 런타임 | Supabase 기본 Deno | |
| 패키지 관리 | npm | cheongYak-radar와 동일 |
| 린트 | ESLint (flat config) + Next.js 권장 규칙 | 최신 Next에서 `next lint` 대신 ESLint CLI 직접 실행 |

**cheongYak-radar(Next 14)에서 코드를 가져올 때 확인할 차이** (Q1=B의 결과)
- 라우트 핸들러·페이지의 `params`·`searchParams`가 비동기(Promise)일 수 있음
- `fetch`·라우트 캐시 기본값 차이: 기기별 데이터 API는 항상 `dynamic`(캐시 없음)으로 명시
- 위 차이는 각 Unit의 Code Generation 계획에 "가져올 파일 + 바꿀 점"으로 적는다 (Q-U4)

## 2. Next.js 서버 설정

| 항목 | 결정 |
|---|---|
| 라우트 핸들러 런타임 | **Node.js 런타임** (Edge 런타임 사용 안 함). WebCrypto(`globalThis.crypto.subtle`)와 supabase-js를 그대로 사용 |
| 함수 지역 | `icn1` (NFR-U1-29) |
| 기기 API 캐시 | 모두 `dynamic = 'force-dynamic'` |
| 헬스 체크 | `GET /api/health`: 인증 없음, DB에 `select 1` 수준 조회 1번, 응답 `{ ok: true }`만 (내부 정보 노출 금지) |

## 3. 테스트 (PBT-09 포함)

| 영역 | 선택 | 설정 |
|---|---|---|
| 단위·통합 테스트 | **Vitest** 최신 | `include`: `src/**/*.test.ts`, `supabase/functions/**/*.test.ts` (Deno 전용 API를 쓰지 않는 파일만) |
| 속성 기반 테스트 | **fast-check** + **`@fast-check/vitest`** | 아래 PBT-09 표 |
| E2E | **Playwright** 최신 | `e2e/`, 모바일 뷰포트(Android·iPhone 크기) 2종 |
| 접근성 자동 검사 | **`@axe-core/playwright`** | NFR-U1-27 |

### PBT-09: 프레임워크 선정 근거

| 요구 | fast-check 지원 방식 |
|---|---|
| 도메인 커스텀 생성기 | `fc.record`, `fc.constantFrom`, `fc.date`, `.map/.chain`으로 `HouseholdProfile`·`Notice` 등 생성기 작성 → `_shared/__tests__/arbitraries/`에 모음 (PBT-07) |
| 자동 shrinking | 기본 켜짐. 끄는 옵션 사용 금지 (PBT-08) |
| seed 재현 | `fc.configureGlobal({ seed })`. 실패 시 seed·경로(path)·최소 반례 출력 |
| 테스트 러너 연동 | `@fast-check/vitest`의 `test.prop` / `it.prop` |
| 언어 | TypeScript (프로젝트 유일 언어) |

### PBT seed·실행 설정 (PBT-08)

| 항목 | 값 |
|---|---|
| seed 결정 | 환경 변수 `FC_SEED`가 있으면 그 값, 없으면 실행 시 생성 |
| seed 기록 | Vitest 전역 설정 파일(setup)에서 실행 시작 시 `PBT seed = …`를 출력. CI 단계에서도 `FC_SEED`를 만들어 로그에 echo 후 전달 |
| 실행 횟수 | 로컬 기본 100회, CI 기본 200회 (`FC_NUM_RUNS`로 조정) |
| 재현 | `FC_SEED=<seed> npm test -- <파일>` |

## 4. `_shared` import 설정 (AD-2)

| 항목 | 결정 |
|---|---|
| 경로 별칭 | `@shared/*` → `supabase/functions/_shared/*` (tsconfig `paths`, Vitest `resolve.alias`) |
| 확장자 | `_shared` 안의 상대 import는 **`.ts` 확장자 포함** (Deno 요구). Next 쪽 tsconfig에 `allowImportingTsExtensions: true` (`noEmit`과 함께) |
| tsconfig 범위 | 루트 tsconfig는 `supabase/functions/_shared`는 **포함**하고, 나머지 `supabase/functions/*`(Deno 전역을 쓰는 진입점)는 **제외** |
| 금지 | `_shared`에서 npm 패키지·`Deno.*`·`node:*` import 금지. 예외: WebCrypto(`globalThis.crypto`) |
| 검증 | CI에서 Deno 타입 검사(`deno check`)를 `_shared`와 Edge Function 진입점에 대해 실행 |

## 5. CI (Q2=A)

| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | push, pull_request | 의존성 설치 → `typecheck` → `lint` → `deno check` → `test`(단위 + PBT, `FC_SEED` echo) |
| `e2e.yml` | `workflow_dispatch`, `main` push | 빌드 → Playwright(+ axe) |
| `keepalive.yml` | 매일 1회 `schedule` | `GET {배포 주소}/api/health` → 실패 시 워크플로 실패 (NFR-U1-08·09) |

## 6. 호스팅 · 요금제 · 지역

| 항목 | 결정 |
|---|---|
| Supabase | **무료 플랜** (Q3=A), 지역 `ap-northeast-2` (Q6=A), 새 프로젝트 (D4) |
| Vercel | Hobby (개인·가족 비상업 용도), 함수 지역 `icn1` |
| GitHub | 새 저장소 (NFR-U1-25) |

## 7. 암호화 (Q4=A)

| 항목 | 결정 |
|---|---|
| 알고리즘 | AES-256-GCM (WebCrypto), 무작위 IV 12바이트 |
| 키 보관 | `AMOUNT_ENC_KEY_V{n}` 환경 변수: Vercel + Supabase Function 시크릿에 같은 값 |
| 현재 버전 | `AMOUNT_ENC_KEY_CURRENT = n` |
| 암호문 형식 | `v{n}.{iv b64url}.{ciphertext b64url}` |
| 교체 절차 | 새 버전 키 추가 → CURRENT 변경 → 일일 작업에서 이전 버전 암호문을 새 키로 다시 암호화 → 이전 키 제거 (세부는 NFR Design) |

## 8. cheongYak-radar에서 가져오지 않는 것

| 파일 | 이유 |
|---|---|
| `tailwind.config.ts`, `postcss.config.js` | Tailwind 메이저 버전이 다를 수 있어 새로 작성 |
| `next.config.js` | 최신 Next 설정 형식으로 새로 작성 (내용만 참고) |
| `src/lib/supabase/session.ts`, `middleware.ts`, `login/` | 로그인 없음 (D11) |

(unit-of-work.md의 U1 재사용 후보 중 위 항목은 "참고만"으로 바뀐다)
