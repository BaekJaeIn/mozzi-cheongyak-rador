# U1 setup-data-platform — 논리 컴포넌트

> 비기능 패턴(nfr-design-patterns.md)을 구현하는 논리 컴포넌트. 물리 배치(어느 서비스·지역)는 Infrastructure Design에서 정한다.

---

## 1. 컴포넌트 목록

| ID | 컴포넌트 | 위치 | 역할 | 패턴 |
|---|---|---|---|---|
| L1 | **ApiClient** (`apiFetch`) | 브라우저 `src/features/device/` | 인증 헤더 첨부, 1회 재시도, 401 재등록, 오류 형식 통일 | P-R1 |
| L2 | **DeviceIdentityStore** | 브라우저 | `mz.device` 읽기·쓰기, ID·토큰 생성 | P-S2 |
| L3 | **RouteGuard** (`withDevice`) | Next 서버 `src/server/auth/` | 라우트 핸들러 래퍼: 본문 크기 확인 → 인증 → `lastSeenAt` 갱신 → 핸들러 실행 → 로그 | P-P2, P-S6 |
| L4 | **TokenHasher** | `_shared/security/` | 토큰 생성·해시·상수 시간 비교 (순수, WebCrypto) | P-S2 |
| L5 | **AmountCipher** (C7) | `_shared/security/` | 버전 붙은 AES-GCM (U2에서 구현, U1은 키 로더만) | P-S3 |
| L6 | **ServerEnv** | `src/server/env.ts` (`server-only`) | 비밀 값 로드·검증 (없으면 시작 시 실패) | P-S7 |
| L7 | **SupabaseAdmin** | `src/server/db/client.ts`, `_shared/db/client.ts` | 서버 전용 키 supabase-js 클라이언트 (Node·Deno 각각) | P-S1 |
| L8 | **Repositories** (C17~C20) | `_shared/db/` 인터페이스, Node·Deno 구현 | 엔티티별 조회, 행 ↔ 도메인 변환, 여러 단계 쓰기는 RPC 호출 | P-L2 |
| L9 | **DB 함수(RPC)** | `supabase/migrations/` | 원자적 다단계 쓰기 (아래 §2) | Q4=A |
| L10 | **ReferenceCache** | `src/server/cache/` | 기준 데이터 10분 TTL 캐시, 진행 중 Promise 공유 | P-P1 |
| L11 | **Logger** | `_shared/log/` | 구조화 JSON 로그, 민감 필드 마스킹, requestId | P-S5 |
| L12 | **HealthCheck** | `src/app/api/health/route.ts` | DB 가벼운 조회, `{ ok }` | 관측성 |
| L13 | **KeepaliveWorkflow** | `.github/workflows/keepalive.yml` | 매일 `/api/health` 호출, 실패 시 메일 | NFR-U1-08·09 |
| L14 | **CleanupJob** | 실행 위치는 Infrastructure Design | 일일 정리(기기·공고 따로 실행), 결과 기록 | P-R3, P-R4 |

## 2. DB 함수(RPC) 목록 (Q4=A)

모두 **service_role만 실행 가능**. 각 함수는 하나의 트랜잭션.

| 함수 | 하는 일 | 소유 Unit |
|---|---|---|
| `register_device(p_id, p_token_hash)` | 같은 ID 확인(같은 해시 → `existing`, 다른 해시 → `conflict`) → 최근 1시간 등록 수 확인(≥20 → `rate_limited`) → 삽입 → `created` | U1 |
| `delete_device(p_id)` | 기기 삭제 (연쇄 삭제는 FK `on delete cascade`) | U1 |
| `cleanup_expired_devices(p_before)` | 미접속 기기 삭제, 삭제 수 반환 | U1 |
| `cleanup_expired_notices(p_before_date)` | 보관 기간 지난 공고 삭제, 삭제 수 반환 | U1 |
| `replace_judgements_for_device(p_device_id, p_rows jsonb)` | 기기의 판정 삭제 + 삽입 | U1(틀), U2(사용) |
| `replace_judgements_for_notices(p_notice_ids, p_rows jsonb)` | 공고들의 판정 삭제 + 삽입 | U1(틀), U2(사용) |
| `upsert_notice_bundle(p_bundle jsonb)` | 원천 공고 + 대표 공고 + 주택형 + 지구 연결을 한 번에 | U1(틀), U3(사용·보완) |
| `save_device_profile(p_device_id, p_profile jsonb)` | 프로필 저장 + `profileVersion` 증가, 새 버전 반환 | U1(틀), U4(사용) |

"틀"은 U1에서 함수 시그니처와 기본 구현을 만들고, 사용하는 Unit이 필요하면 새 마이그레이션으로 보완한다는 뜻이다 (계약 K1·K2).

## 3. 호출 관계

```text
[브라우저]
 DeviceBootstrap -> L2 DeviceIdentityStore -> L1 ApiClient -> POST /api/device
 각 화면          -> L1 ApiClient (헤더 첨부, 1회 재시도, 401 재등록)

[Next 서버]
 route.ts -> L3 RouteGuard -> L4 TokenHasher
                           -> L8 Repositories -> L7 SupabaseAdmin -> PostgREST / L9 RPC
          -> L10 ReferenceCache -> L8
          -> L11 Logger
 L6 ServerEnv <- L3, L5, L7

[Supabase Edge Function / 예약 작업 (U3·U6)]
 L8 Repositories(Deno) -> L7 SupabaseAdmin(Deno) -> L9 RPC

[외부]
 L13 KeepaliveWorkflow -> L12 HealthCheck -> L7
```

## 4. 요구사항 대응

| 요구사항 | 컴포넌트 |
|---|---|
| NFR-U1-03·04 성능 | L3, L4, L10 |
| NFR-U1-05·12 오프라인 우선 | L1, L2 |
| NFR-U1-08·09 중지 방지·인지 | L12, L13 |
| NFR-U1-11 멱등 | L9, L14 |
| NFR-U1-13 RLS | L7, L9 |
| NFR-U1-14 토큰 | L4 |
| NFR-U1-15 암호화 키 | L5, L6 |
| NFR-U1-16 비밀 값 | L6 |
| NFR-U1-17 로그 금지 항목 | L11 |
| NFR-U1-18 본문 크기 | L3 |
| RK-U1-1 등록 남용 | L9 `register_device` 한도 |

## 5. PBT 준수 요약 (이 단계)

새 순수 로직: 재시도 판단(`shouldRetry(status|error)`), 마스킹(`redact(obj)`), 캐시 TTL 판단. 다음 속성을 U1 Code Generation의 PBT 대상에 추가한다 (PBT-01 보완).

| 대상 | 속성 | 범주 |
|---|---|---|
| `redact` | 결과에 금지 키의 원래 값이 어떤 깊이에도 남지 않는다 | Invariant |
| `redact` | `redact(redact(x)) = redact(x)` | Idempotence |
| `shouldRetry` | 408을 뺀 4xx는 항상 false, 408·5xx·네트워크 오류는 항상 true | Invariant |

Blocking finding 없음.
