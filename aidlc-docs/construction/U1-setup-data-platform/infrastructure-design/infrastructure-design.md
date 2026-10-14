# U1 setup-data-platform — 인프라 설계

> 근거: U1 인프라 계획 답변 (Q1=A 운영 1개 + 로컬 개발, Q2=A GitHub 연동 자동 배포·미리보기 끔, Q3=A 마이그레이션·함수 수동 배포, Q4=A pg_cron 직접 실행 KST 04:00, Q5=A Vercel 기본 주소)

---

## 1. 환경

| 환경 | 구성 | 용도 |
|---|---|---|
| **로컬 개발** | Supabase CLI 로컬 스택(`supabase start`, **Docker Desktop 필요**) + `next dev` + `supabase functions serve` | 개발·통합 테스트·E2E. 실제 가족 데이터 없음 |
| **운영** | Supabase 프로젝트(무료, `ap-northeast-2`) + Vercel 프로젝트(Hobby, `icn1`, `main` 자동 배포) | 실제 사용 |
| CI | GitHub Actions (DB 없이 단위·PBT. E2E는 로컬 Supabase를 Actions 안에서 띄움) | 테스트 |

**사전 조건**: 이 PC에는 현재 Docker가 설치되어 있지 않다 (2026-10-14 확인). **U1 Code Generation 전에 Docker Desktop 설치**가 필요하다. 설치가 어려우면 Q1을 B(스테이징 Supabase 프로젝트)로 바꿀 수 있다.

## 2. 논리 컴포넌트 → 실제 서비스 매핑

| 논리 컴포넌트 | 실제 서비스 · 위치 |
|---|---|
| L1 ApiClient, L2 DeviceIdentityStore | 브라우저 (Vercel이 서빙하는 정적 JS) |
| L3 RouteGuard, L6 ServerEnv, L10 ReferenceCache, L12 HealthCheck | **Vercel Functions** (Node.js 런타임, `icn1`) |
| L4 TokenHasher, L5 AmountCipher, L11 Logger | 코드 라이브러리 (`_shared`), Vercel Functions·Supabase Edge Functions 안에서 실행 |
| L7 SupabaseAdmin, L8 Repositories | supabase-js → **Supabase PostgREST** (HTTPS) |
| L9 DB 함수(RPC) | **Supabase PostgreSQL** 함수 (마이그레이션으로 생성) |
| L13 KeepaliveWorkflow | **GitHub Actions** 예약 워크플로 |
| L14 CleanupJob | **Supabase pg_cron** → SQL 함수 직접 실행 (Q4=A) |
| 로그 | Vercel 함수 로그, Supabase 로그, `collect_runs` 테이블 |

## 3. 데이터베이스

| 항목 | 설계 |
|---|---|
| 확장 | `pgcrypto`(UUID 기본값), `pg_cron`(정리 작업), `pg_net`(U3·U6 함수 호출용, U1에서 미리 켬), `supabase_vault`(U3·U6 시크릿) |
| 스키마 | `public` 하나. 테이블 13개(E1~E13), FK `on delete cascade` |
| 권한 | 모든 테이블 RLS 켬, `anon`·`authenticated`의 테이블·시퀀스·함수 권한 `revoke all`. RPC는 `grant execute ... to service_role`만 |
| 마이그레이션 | `supabase/migrations/NNNN_*.sql`, 번호 순서, 재실행 안전 (P-R3) |
| 백업 | 무료 플랜이라 시점 복구(PITR) 없음 → **위험한 마이그레이션 전에 `supabase db dump`로 수동 백업** (deployment-architecture.md §4) |

## 4. 예약 작업 (pg_cron)

pg_cron 시각은 **UTC** 기준이다.

| 작업 이름 | 시각 (KST) | cron (UTC) | 실행 | 소유 Unit |
|---|---|---|---|---|
| `cleanup-devices` | 매일 04:00 | `0 19 * * *` | `select cleanup_expired_devices(now() - interval '180 days')` + 결과를 `collect_runs`에 기록 | U1 |
| `cleanup-notices` | 매일 04:05 | `5 19 * * *` | `select cleanup_expired_notices(current_date - 365)` + 기록 | U1 |
| (자리) `collect-daily` | U3에서 결정 (OI-4) | | Vault의 URL·키로 `net.http_post` → `collect` | U3 |
| (자리) `dispatch-hourly` | 매시 정각 | `0 * * * *` | Vault의 URL·키로 `net.http_post` → `dispatch` | U6 |

- 두 정리 작업을 따로 등록해 실패를 격리한다 (P-R4)
- 등록은 마이그레이션에서 `cron.unschedule(이름) where exists` 후 `cron.schedule` (재실행 안전)
- **Vault 규칙**: Edge Function을 부르는 cron은 URL과 서버 키를 `vault.decrypted_secrets`에서 읽는다. `ALTER DATABASE ... SET app.settings`는 Supabase에서 권한 오류(42501)로 쓸 수 없다 (cheongYak-radar 교훈)

## 5. 환경 변수 · 시크릿

| 이름 | 값 | Vercel | Supabase Function 시크릿 | Vault | GitHub | 로컬 `.env.local` | 도입 Unit |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| `SUPABASE_URL` | 프로젝트 URL | ✅ | (자동 제공) | | | ✅ (로컬 값) | U1 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키 | ✅ | (자동 제공) | ✅ (U3·U6 cron용) | | ✅ | U1 |
| `AMOUNT_ENC_KEY_V1` | AES-256 키 (base64url 32바이트) | ✅ | ✅ | | | ✅ (운영과 같은 키) | U1 등록, U2 사용 |
| `AMOUNT_ENC_KEY_CURRENT` | `1` | ✅ | ✅ | | | ✅ | U1 |
| `APP_URL` | 운영 주소 | | | | ✅ (변수) | | U1 (keepalive) |
| `DATA_GO_KR_API_KEY`, `GEMINI_API_KEY` | 기존 키 재사용 (D4) | | ✅ | | | ✅ | U3 |
| `collect_url`, `dispatch_url` | 함수 URL | | | ✅ | | | U3, U6 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 푸시 키 | ✅(공개키만 `NEXT_PUBLIC_`) | ✅ | | | ✅ | U6 |

- **브라우저에 노출되는 값은 VAPID 공개키 하나뿐** (NFR-U1-16)
- `.env.example`에 이름만 적고 값은 비운다
- 운영 암호화 키와 로컬 개발 키는 **같은 값**을 쓴다 (2026-10-14 사용자 결정 — 1인 운영이라 키 관리를 하나로 줄임). 받아들인 위험: 로컬 `.env.local`이 새면 운영 암호문도 풀린다. 완화: 키를 비밀번호 관리자에 백업, `.env.local`은 커밋·공유 금지, 필요 시 키 교체 절차로 운영만 `V2`로 분리 가능
- GitHub에는 Supabase 접근 토큰을 두지 않는다 (Q3=A 수동 배포)

## 6. 네트워크

| 항목 | 설계 |
|---|---|
| 주소 | `https://<프로젝트명>.vercel.app` (Q5=A). 프로젝트명은 첫 구축 때 정하고 **이후 바꾸지 않는다** (PWA 설치·푸시 구독이 주소에 묶임) |
| 브라우저 → 서버 | Vercel 주소의 `/api/*`만. 브라우저는 Supabase 주소로 직접 요청하지 않음 |
| 서버 → DB | Vercel 함수(`icn1`) → Supabase(`ap-northeast-2`) HTTPS, 같은 서울 지역 |
| CORS | 같은 출처라 별도 설정 없음. `/api/*`는 다른 출처 요청을 허용하지 않음 |

## 7. 일시 중지 방지 확인 (NFR-U1-08)

| 단계 | 내용 |
|---|---|
| 동작 | keepalive 워크플로 → `GET /api/health` → Vercel 함수 → Supabase PostgREST 조회. **API 요청이 매일 발생** |
| 확인 방법 | 운영 시작 후 **2주 동안** Supabase 대시보드에서 프로젝트 상태(일시 중지 경고 메일 유무)를 확인한다. 경고가 오면 방식을 보완한다 (예: 호출 빈도 증가) |
| 인지 | 중지되면 health가 실패 → GitHub 실패 메일 (NFR-U1-09) |
