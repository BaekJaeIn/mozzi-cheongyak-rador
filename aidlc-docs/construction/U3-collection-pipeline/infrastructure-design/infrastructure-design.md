# U3 collection-pipeline — 인프라 설계

> 근거: U3 인프라 계획 답변 (Q1=A collect 매일 KST 05:00, Q2=A analyze 매시 30분, Q3=A data.go.kr 데이터셋 3개 승인된 키 재사용)
> U1 인프라 규칙(Vault, pg_cron UTC, 수동 배포, 로컬 개발)을 그대로 따른다.

---

## 1. 함수 매핑

| 논리 컴포넌트 | 실제 서비스 | 설정 |
|---|---|---|
| `collect` (L-U3-8) | Supabase Edge Function `collect` | `verify_jwt = false` (아래 §3), 벽시계 예산 90초 |
| `analyze` (L-U3-9) | Supabase Edge Function `analyze` | `verify_jwt = false`, 벽시계 예산 120초 |
| 공용 코드 | `supabase/functions/_shared/`, `_lib/` | 함수 배포 시 함께 번들됨 |
| DB 함수·컬럼 | 마이그레이션 `0007_collect_pipeline.sql` | U1 수동 `db push` |

## 2. 예약 작업 (pg_cron, UTC)

| 작업 | KST | cron (UTC) | 호출 |
|---|---|---|---|
| `cleanup-devices` (U1) | 매일 04:00 | `0 19 * * *` | SQL |
| `cleanup-notices` (U1) | 매일 04:05 | `5 19 * * *` | SQL |
| **`collect-daily`** | **매일 05:00** | **`0 20 * * *`** | `net.http_post(collect_url)` |
| **`analyze-hourly`** | **매시 30분** | **`30 * * * *`** | `net.http_post(analyze_url)` |
| `dispatch-hourly` (U6 예정) | 매시 정각 | `0 * * * *` | |

- 정리(04:00) → 수집(05:00) 순서라 지운 공고를 다시 처리하지 않는다
- 0~4시 알림은 전날 05:00 수집분 기준 (OI-4 결정)
- `net.http_post(..., timeout_milliseconds := 150000)` — 기본 5초로 끊기지 않게 함수 한도에 맞춤
- 등록은 마이그레이션에서 `unschedule where exists` → `schedule` (재실행 안전)

## 3. 함수 호출 인증 (P-U3-S1 보완)

Supabase의 새 API 키(`sb_secret_…`)는 JWT가 아니어서, 플랫폼 JWT 검사나 "서버 키 비교"는 프로젝트 키 형식에 따라 깨질 수 있다. 그래서 **예약 작업 전용 비밀 값**을 쓴다.

| 항목 | 설계 |
|---|---|
| 비밀 값 | `CRON_SECRET` — 무작위 32바이트 base64url |
| 저장 | Supabase Vault(`cron_secret`, cron이 읽음) + 함수 시크릿(`CRON_SECRET`, 함수가 비교) |
| 호출 | `Authorization: Bearer <cron_secret>` |
| 함수 | `verify_jwt = false`, 진입 시 `constantTimeEqual`로 비교, 다르면 401 |
| DB 접근 | 함수 런타임이 자동 제공하는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 사용 |

## 4. 시크릿·Vault (shared-infrastructure §3에 추가)

| 이름 | 위치 | 값 | 비고 |
|---|---|---|---|
| `DATA_GO_KR_API_KEY` | 함수 시크릿 | cheongYak-radar 키 (Q3=A, 15098547·15058530·15057999 승인됨) | **Decoding 키**를 그대로 (cheongYak-radar 주석: 인코딩하지 않음) |
| `GEMINI_API_KEY` | 함수 시크릿 | cheongYak-radar 키 (D4) | 헤더로만 |
| `GEMINI_MODEL` | 함수 시크릿(선택) | 기본 `gemini-2.5-flash` | |
| `CRON_SECRET` | 함수 시크릿 + Vault `cron_secret` | 새로 생성 | §3 |
| `AMOUNT_ENC_KEY_V1`, `AMOUNT_ENC_KEY_CURRENT` | 함수 시크릿 | U1에서 등록 | 재계산이 프로필 복호화 |
| `collect_url`, `analyze_url` | Vault | `https://<ref>.supabase.co/functions/v1/{collect,analyze}` | cron이 읽음 |
| `COLLECT_MOCK` | 로컬 `.env` 만 | `1` | 운영에는 두지 않음 |

## 5. CPU 2초 한도 대응 (RK-U3-4)

| 작업 | CPU 사용 | 대응 |
|---|---|---|
| PDF → base64 (최대 20MB) | 큼 | 직접 만든 루프 대신 `jsr:@std/encoding`의 `encodeBase64`(최적화 구현) 사용. Code Generation에서 10MB·20MB 샘플로 시간 측정, 넘으면 PDF 상한을 낮춤 |
| Gemini 응답 JSON 파싱·검증 | 작음 | — |
| 전체 판정 재계산 (기기 ≤ 10 × 공고 ≤ 2,000) | 중간 | 현재 공고 수(수십~수백)에서는 작음. Code Generation에서 2,000건 기준 측정, 1초를 넘으면 재계산을 별도 함수 호출로 분리 |
| HTML·JSON 파싱 | 작음 | 정규식 파서 |

## 6. 로컬 개발

| 명령 | 내용 |
|---|---|
| `npx supabase functions serve --env-file supabase/.env.local` | 함수 로컬 실행 (`COLLECT_MOCK=1`) |
| `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:54321/functions/v1/collect` | 수동 실행 |
| `npm run db:test` | 0007 pgTAP (예약·해제·상태 조회) |
