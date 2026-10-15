# U3 collection-pipeline — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U3-collection-pipeline-code-generation-plan.md`
> 세부: [business-logic-summary.md](business-logic-summary.md) · 배포: [setup-guide-u3.md](setup-guide-u3.md)

## 1. 생성·변경 파일

| 영역 | 파일 |
|---|---|
| 수집 로직 (`_shared/collect/`, 순수) | Step 1~7: `types`, `dates`, `block-key`, `scope`, `content-hash`, `normalize`, `grouping`, `pdf-locator`, `prompt`, `extraction`, `bundle`, `ports`, `collect-orchestrator`, `analyze-orchestrator`, `mock-data`, `parsers/{html,applyhome,lh,gh}` |
| 수집 로직 (Step 8~10 추가) | `collectors.ts`(청약홈·LH·GH·목업 Collector, HTTP 주입), `gemini-request.ts`(요청 만들기·응답 해석), `guard.ts`(CRON_SECRET 비교), `stored.ts`(DB 행 → BundleBase·상태·기록 행) |
| HTTP (`_shared/http/`) | `fetch.ts`(시간 제한·1회 재시도(네트워크·408·429·5xx, 2초)·크기 상한·URL 가리기·PDF 시그니처) |
| Deno 전용 (`_lib/`) | `env.ts`, `http.ts`(User-Agent, PdfFetcher), `gemini.ts`(base64 `jsr:@std/encoding`, Extractor), `guard.ts`(POST·Bearer 확인, 실행 ID, 오류 500), `deps.ts`(조립), `db/{client,repositories,collect-repository}.ts` |
| 함수 | `supabase/functions/collect/index.ts`, `supabase/functions/analyze/index.ts` |
| DB | `supabase/migrations/0007_collect_pipeline.sql`, `supabase/tests/collect.test.sql`(23건) |
| 설정 | `supabase/config.toml`(두 함수 `verify_jwt = false`), `tsconfig.json`·`eslint.config.mjs`(analyze 제외), `scripts/deno-check.mjs`(`--no-lock`, deno 없으면 npm 배포본), `.env.example` |
| 변경 | `_shared/domain/profile.ts`(`findSido`) |
| 문서 | `README.md` "수집·분석 함수" 절, 배포 절 |

### 설계 대비 조정

| 설계 | 실제 | 이유 |
|---|---|---|
| Collector를 `collect/collectors/*.ts`(Deno)에 | `_shared/collect/collectors.ts`(HTTP 주입) | 쪽 넘김·시간 상한·상세 실패 격리·대기열을 Vitest로 검사 (NFR-U3-24) |
| `_lib/http.ts`·`gemini.ts`·`guard.ts`에 판단 로직 | 판단은 `_shared`(`http/fetch.ts`, `gemini-request.ts`, `guard.ts`), `_lib`은 Deno 환경·조립만 | 같은 이유. `_shared`는 표준 Web API만 사용 |
| `collect_state(p_dedup_keys text[])` | `collect_state(p_keys jsonb)` — (소스, 번호) 목록 | 오케스트레이터는 원천 번호로 바뀜을 판단. 많은 키도 URL 길이 제한 없이 |
| `release_notice_claim(id, failed, reason)` | `(id, failed)` | 실패 사유는 실행 기록(`collect_runs.warning`)에 남김 |
| (없음) | `invoke_edge_function(name)` DB 함수 | cron 두 개가 같은 Vault 읽기·호출을 공유, Vault 값이 없으면 `collect_runs`에 기록 |
| Gemini 사고 예산 | `thinkingBudget: 1024`, `maxOutputTokens: 8192`, `STOP` 외 종료는 실패 (`MAX_TOKENS`는 `invalid_json`) | P-U3-R6 |

## 2. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 없음 |
| `npm run lint` | ✅ 오류·경고 없음 |
| `npm test` | ✅ 38개 파일, **329개 테스트** 통과 (U1·U2 210 + U3 119), 서로 다른 seed로 반복 확인 |
| `npm run deno:check` | ✅ `_shared`·`_lib`·`collect`·`analyze` 전체 (deno 2.5.6) |
| `npm run build` | ✅ 성공 |
| DB 함수 (로컬 대체 확인) | ✅ Docker가 없어 PGlite(WASM Postgres)에 cron·Vault·pg_net 대역을 두고 0002~0007 적용 + pgTAP 파일 실행: `collect` 23/23, `rpc` 25/25, `reference` 9/9, `security` 31/32(실패 1건은 대역용 임시 테이블의 RLS — 실제 DB와 무관). **실제 pgTAP은 push 후 CI `db-and-e2e`에서 확인** |

### CPU 측정 (Step 13, RK-U3-4) — deno 2.5.6, 이 PC

| 작업 | 시간 (중앙값 / 최대) | 한도 2초 대비 |
|---|---|---|
| PDF base64 10MB | 45 / 64 ms | 충분 |
| PDF base64 20MB | 85 / 103 ms | 충분 |
| base64 + 요청 JSON 20MB | 115 / 135 ms | 충분 |
| 판정 재계산 2,000건 × 기기 1~2대 (메모리 저장소) | 137~205 ms | 충분 (DB 왕복은 CPU 시간 아님) |

→ PDF 상한 20MB 유지. 운영 CPU 사용량은 첫 배포 후 대시보드 로그로 다시 확인.

## 3. 테스트 추가 (Step 8~11)

| 파일 | 내용 |
|---|---|
| `collect/__tests__/http-gemini.test.ts` | 재시도 6가지, URL 가리기, 크기 상한 3가지(선언·스트림), PDF 시그니처, Gemini 요청(인라인 PDF·스키마·프로필 없음)·응답(사고 요약 제외·코드 펜스·실패 6가지), CRON 인증 6가지 |
| `collect/__tests__/collectors.test.ts` | 청약홈(쪽·키 인코딩·첫 쪽 실패·시간 없음), LH(목록+상세·상세 실패 격리·오류 봉투·키 비노출), GH(첨부·대기열·상세 실패), 목업 연결 |
| `collect/__tests__/stored.test.ts` | 저장 공고 → BundleBase(대표 원천 PDF 우선, 옛 소스 제외), 첨부 검증, 상태·기록 행 |
| `supabase/tests/collect.test.sql` | 저장·상태 조회, AI 필드 유지, 옛 공고 삭제, 예약 순서·겹침 없음·10분 만료·한도, 해제 2가지, cron 2개, Vault 없음 기록, anon 차단 |

## 4. 남은 일

| 단계 | 내용 | 필요 |
|---|---|---|
| Step 12 | 실제 응답 캡처 → 파서·첨부 추출·지구 키워드 확정 (RK-U3-2) | **사용자 확인** (data.go.kr 키 사용) |
| Step 15 | push → CI(`deno check`, pgTAP 0007) | **사용자 확인** |
| 배포 | setup-guide-u3.md 1~7단계 | 사용자 작업 |
| Step 16 | 골든 세트 (운영 수집·분석 후) | 사용자 대조 확인 |
