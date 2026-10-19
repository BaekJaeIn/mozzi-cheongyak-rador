# U3 collection-pipeline — 논리 컴포넌트

---

## 1. 컴포넌트 목록

| ID | 컴포넌트 | 위치 | 역할 | 패턴 |
|---|---|---|---|---|
| L-U3-1 | **Collectors** (applyhome, lh, gh, mock) | `collect/collectors/` (Deno) | 소스 조회 → `RawNotice[]` (파싱은 L-U3-2 호출) | P-U3-R1·R2 |
| L-U3-2 | **Parsers** | `_shared/collect/parsers/` (순수) | 청약홈 JSON, LH 목록·상세 JSON, GH 메인 HTML·대기열 감지 | NFR-U3-22 |
| L-U3-3 | **Normalizer / Scope / BlockKey / Grouping / ContentHash** | `_shared/collect/` (순수) | BR-U3-10~51 | |
| L-U3-4 | **ExtractionValidator / BundleBuilder / Prompt** | `_shared/collect/` (순수) | Gemini 응답 검증, 주택형·요건 확정, RPC 번들, 프롬프트·스키마 | P-U3-S3 |
| L-U3-5 | **HttpClient** | `_lib/http.ts` (Deno) | 시간 제한, 1회 재시도, User-Agent, URL 가리기, PDF 크기 상한 | P-U3-R2·P4·S2 |
| L-U3-6 | **GeminiClient** | `_lib/gemini.ts` (Deno) | PDF 인라인 + 구조화 출력 호출, finishReason 확인 | P-U3-R6 |
| L-U3-7 | **Deno Repositories** | `_lib/db/` (Deno) | U1·U2 인터페이스 구현(Profile·Notice·Reference·Judgement) + 수집 전용(상태 조회, 번들 저장, 예약·해제, 실행 기록) | CG-1 |
| L-U3-8 | **CollectOrchestrator** | `collect/orchestrator.ts` | 수집 흐름 (기능 설계 §2 + 변경 메모), 의존성 주입 | P-U3-R1·R4·R5·P1 |
| L-U3-9 | **AnalyzeOrchestrator** | `analyze/orchestrator.ts` | 예약 → PDF → 추출 → 저장 → 재계산 | P-U3-R3·R6·P1 |
| L-U3-10 | **FunctionGuard** | `_lib/guard.ts` | 서버 키 확인, 시작 시각·시간 예산 | P-U3-S1·P1 |
| L-U3-11 | **DB 함수·컬럼** | `supabase/migrations/0007_*.sql` | 아래 §2 | |

오케스트레이터(L-U3-8·9)는 Collector·HttpClient·GeminiClient·Repository를 **주입받는 순수 TS**로 작성해 `_shared/collect/`에 둘 수 있게 한다 → Vitest로 통합 테스트 (NFR-U3-24). Deno 진입점(`index.ts`)은 실제 구현을 조립만 한다.

## 2. DB 변경 (`0007_collect_pipeline.sql`)

| 대상 | 변경 |
|---|---|
| `notices` | `ai_attempts int not null default 0`, `ai_source_url text`, `ai_claimed_at timestamptz` + 대기 공고 인덱스(`summary_status`, `apply_end`) |
| `upsert_notice_bundle(jsonb)` | 번들에 `summary`, `summary_status`, `ai_attempts`, `ai_source_url`이 있으면 저장(없으면 기존 값 유지), `ai_claimed_at`을 비움. 새 공고는 `summary_status = 'pending'` |
| `collect_state(p_dedup_keys text[])` (신규) | 묶음 키별 `notice_id`, `summary_status`, `ai_attempts`, 원천 공고별 `content_hash` 반환 (P-U3-P2) |
| `claim_notices_for_analysis(p_limit, p_now)` (신규) | P-U3-R3 |
| `release_notice_claim(p_notice_id, p_failed boolean, p_reason text)` (신규) | 예약 해제, 실패면 `ai_attempts + 1`·`summary_status = 'failed'` |
| 권한 | 모두 service_role만 |

## 3. 호출 관계

```text
pg_cron (매일)  -> collect/index.ts -> FunctionGuard
                    -> CollectOrchestrator
                         -> Collectors (HttpClient) -> Parsers
                         -> Normalizer -> Scope -> matchDistricts(U2) -> Grouping -> ContentHash
                         -> Repos.collectState -> 변경·신규만 BundleBuilder(표준 요건) -> Repos.upsertBundle
                         -> JudgementService.recomputeAll (U2, Deno Repos 주입)
                         -> Repos.recordRun

pg_cron (매시)  -> analyze/index.ts -> FunctionGuard
                    -> AnalyzeOrchestrator
                         -> Repos.claim (≤2)
                         -> 공고마다: 첨부에서 PDF 찾기 -> HttpClient(≤20MB) -> GeminiClient -> ExtractionValidator
                                     -> BundleBuilder(추출 + resolveRequirements) -> Repos.upsertBundle
                                     (실패 -> Repos.release(failed))
                         -> 처리 1건 이상이면 JudgementService.recomputeAll
                         -> Repos.recordRun
```

## 4. PBT 준수 요약 (이 단계)

| 항목 | 반영 |
|---|---|
| PBT-01 보완 | 예약: "동시에 두 번 claim해도 겹치는 공고가 없다", "10분 지난 예약은 다시 고를 수 있다" — DB 함수라 pgTAP 예시 테스트로, 오케스트레이터 쪽은 메모리 Repository로 PBT |
| PBT-06 | `analyze` 반복 실행(공고 추가·변경·처리·실패)을 상태 기반 테스트 후보로 Code Generation 계획에 포함 |

Blocking finding 없음.

---

## 5. 변경 요청 2 (2026-10-18)

### 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| RegionResolver (새) | `_shared/collect/regions.ts` | 공고 지역 판별·정리·묶음 합집합·AI 고치기·인천 옛 구 (P-U3-C6) |
| ShCollector (새) | `_shared/collect/collectors.ts` + `parsers/sh.ts` | SH 목록·상세 파싱, 상세 줄이기 (P-U3-C5) |
| CollectGroups | `_shared/collect/collect-orchestrator.ts` | 묶음별 수집기·예산, 재계산 시점 (P-U3-C1·C2) |
| Normalizer | `normalize.ts` | `regions` 채우기, 지역 없으면 버림(BR-U3-C2) |
| Bundler | `bundle.ts` | 묶음 지역 합집합(BR-U3-C7), 대표 우선순위에 sh |
| Extraction | `prompt.ts`·`extraction.ts` | `supplySigungu` 스키마·검증 |
| AnalyzeOrchestrator | `analyze-orchestrator.ts` | 추출 뒤 `regions_ai` 저장 |
| 공고 읽기 | `_lib/db/repositories.ts`, `src/server/db/notice-repository.ts`·`feed-repository.ts` | `regions_ai ?? regions` |
| collect 함수 | `functions/collect/index.ts` | 요청 본문 `group` 읽기 |

### DB 변경 (`0010_collect_regions.sql`)

| 변경 | 내용 |
|---|---|
| 칸 | `notices.regions_ai jsonb` (null 허용, 배열 검사) |
| 제약 | `source_notices.source`·`notices.primary_source` 검사에 `sh` |
| RPC | `upsert_notice_bundle`: `notice.regions` 저장(regions_ai 유지) · 분석 저장 경로에 `regions_ai` |
| 함수 | `notice_in_any_interest(uuid, timestamptz)` (P-U3-C3), `claim_notices_for_analysis` 대상 조건 추가 |
| Edge 호출 | `invoke_edge_function(p_name text, p_body jsonb default '{}')` — 본문 전달 |
| cron | `collect-daily` 본문 `{"group":"api"}`, 새 `collect-crawl` 20:10 UTC 본문 `{"group":"crawl"}` |
| 권한 | 새 함수 service_role만 (기존 원칙) |

### 호출 관계 (바뀐 부분)

```text
pg_cron 20:00 ─▶ collect {group:api}  ─▶ 청약홈·LH ─▶ 정규화+지역 ─▶ 묶기 ─▶ 저장 ─▶ (저장분 있으면) recomputeAll
pg_cron 20:10 ─▶ collect {group:crawl}─▶ GH·SH(상세 줄이기) ─▶ … ─▶ 저장 ─▶ recomputeAll
pg_cron 매시30 ─▶ analyze ─▶ claim(마감 전·대기·관심 지역 안) ─▶ Gemini ─▶ 요건·요약·regions_ai 저장 ─▶ recomputeAll
```

### PBT 준수 요약 (이 단계)

PBT-02~08 대상은 RegionResolver·SH 파서(순수 함수)로 분리해 두었다(P-U3-C6). SQL·TS 관심 지역 일치는 공유 표 테스트로. Blocking finding 없음.
