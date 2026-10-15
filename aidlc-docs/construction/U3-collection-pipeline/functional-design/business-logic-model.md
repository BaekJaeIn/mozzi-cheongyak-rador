# U3 collection-pipeline — 비즈니스 로직 모델

---

## 1. 모듈 구성

```text
supabase/functions/
  _shared/collect/                 순수 코드 (Node·Deno 공용, Vitest·PBT 대상)
    dates.ts                       원천 날짜 문자열 → IsoDate (BR-U3-10)
    normalize.ts                   RawNotice → NormalizedNotice (BR-U3-11~15·20·21)
    block-key.ts                   블록 키 추출 (BR-U3-30)
    grouping.ts                    묶음 키·대표 선택·병합 (BR-U3-31~34)
    scope.ts                       수집 범위 (BR-U3-40)
    content-hash.ts                변경 감지 해시 (BR-U3-50)
    extraction.ts                  Gemini 응답 검증·주택형 만들기 (BR-U3-63~66)
    bundle.ts                      NoticeGroup + 추출 → NoticeBundle (U1 RPC 형식)
    prompt.ts                      추출 프롬프트·응답 스키마 (BR-U3-62·63)
  _lib/                            Deno 전용 (npm:·Deno.* 사용 가능)
    db/                            Repository Deno 구현 (CG-1) + 수집 전용 조회
    gemini.ts                      Gemini 호출 (PDF 인라인, 구조화 출력, 시간 제한)
    http.ts                        fetch 래퍼 (User-Agent, 시간 제한, 재시도 없음)
  collect/
    index.ts                       Edge Function 진입점 (인증 확인 → 오케스트레이터)
    orchestrator.ts                전체 흐름 (§2)
    collectors/applyhome.ts, lh.ts, gh.ts, mock.ts
    parsers/                       응답·HTML 파서 (순수 함수, cheongYak-radar에서 가져와 고침)
```

## 2. `collect` 흐름 (매일 1회)

```text
0. 호출 확인: Authorization = 서버 키 (pg_cron이 Vault 값으로 호출)
1. runId 생성, today = 한국 날짜
2. 기준 데이터 로드: 지구(활성), 공급유형 표준 요건
3. 소스마다 (격리, BR-U3-01):
     raw[] = collector.collect()            ── 실패 → collect_runs(source, ok=false) 후 다음 소스
     normalized[] = raw.map(normalize).filter(inScope(today)).filter(지구 있음)   (BR-U3-21·40)
     지구 후보 경고 (BR-U3-22), 0건 경고 (BR-U3-71)
     collect_runs(source, ok=true, fetched, …)
4. groups = groupNotices(모든 normalized)                    (BR-U3-31~34)
5. 저장된 해시·AI 상태 조회 (묶음 키·원천 번호로 한 번에)
6. 묶음마다:
     변화 없음 & AI 완료 → 건너뜀                          (BR-U3-51)
     AI 필요 & 이번 실행 AI 상한 안 →
        PDF 찾기 → 내려받기(≤20MB) → Gemini 추출 → 검증    (BR-U3-60~64)
        실패 → ai_attempts+1, summary_status=failed(3회 미만이면 다음 실행 재시도)
     AI 상한 초과 → summary_status=pending                  (BR-U3-67)
     bundle = buildBundle(group, extraction, 표준 요건)        (BR-U3-65·66)
     upsert_notice_bundle RPC (공고 1건 = 트랜잭션 1개, 실패는 그 공고만 기록)
7. U2 judgementService.recomputeAll(today)                    (BR-U3-54)
8. collect_runs(all): 처리·AI 호출·재계산 요약
9. 응답 200 { runId, summary }  (오류여도 소스별 결과가 있으면 200 + 요약)
```

## 3. 대표 공고 묶기 예시 (Q3=A)

| 원천 | 제목 | 지구 | 블록 키 | 모집공고일 | 묶음 키 |
|---|---|---|---|---|---|
| 청약홈 | 하남교산 A2블록 공공분양 | gyosan | A2 | 2026-11-03 | `gyosan\|A2\|2026-11-03` |
| LH | [하남교산] A-2BL 뉴:홈 입주자모집 | gyosan | A2 | 2026-11-03 | `gyosan\|A2\|2026-11-03` |
| GH | 하남교산 행복주택 | gyosan | (없음) | 2026-11-10 | `gh:2026-123` |

→ 앞의 둘은 대표 공고 1개(대표 = LH), GH 공고는 따로.

## 4. 저장 RPC 보완 (U3 마이그레이션)

| 대상 | 변경 |
|---|---|
| `notices` | `ai_attempts int not null default 0`, `ai_source_url text` |
| `upsert_notice_bundle` | `summary`, `summary_status`, `ai_attempts`, `ai_source_url`를 받아 저장(번들에 있을 때만 덮어씀) |
| 조회 | `notice_ai_state(dedup_keys text[])` 또는 PostgREST 조회: 묶음 키별 `summary_status`, `ai_attempts`, 원천 공고 해시 |

## 5. 목업 모드 (FR-1.4, BR-U3-07)

- `COLLECT_MOCK=1` 또는 data.go.kr 키 없음 → Collector 3개 대신 Mock 데이터(지구 6개에 걸친 공고 8건: 묶여야 하는 쌍, 지구 없는 공고, 마감 공고, 블록 없는 공고 포함)
- Gemini 키 없음 → 목업 추출(고정 JSON) 사용
- 로컬 개발·E2E가 실제 외부 호출 없이 전체 흐름을 돈다

## 6. 테스트 가능한 속성 (PBT-01)

| 컴포넌트 | 속성 | 범주 |
|---|---|---|
| 날짜 파서 | 유효한 날짜를 4가지 형식으로 쓰면 모두 같은 IsoDate로 돌아온다 | Round-trip |
| 날짜 파서 | 어떤 문자열이든 예외 없이 IsoDate 또는 null | Invariant |
| 블록 키 | `A2블록`·`A-2BL`·`a2 bl` 등 표기 변형은 같은 키 | Invariant |
| 블록 키 | 키를 다시 블록 표기로 만든 뒤 추출하면 같은 키 (`extract(format(k)) = k`) | Round-trip |
| 묶기 | 입력 순서를 바꿔도 묶음 결과(키·구성원·대표)가 같다 | Commutativity |
| 묶기 | 모든 원천 공고는 정확히 한 묶음에 속한다 (분할) | Invariant |
| 묶기 | 블록 키나 모집공고일이 없는 공고는 혼자 묶음 | Invariant |
| 묶기 | `group(group(x).flatMap(members)) = group(x)` | Idempotence |
| 수집 범위 | 오늘이 늦어지면 범위 안 공고는 줄기만 한다 (단조) | Invariant |
| 해시 | 같은 정규화 내용 → 같은 해시, `raw`만 다르면 같은 해시 | Invariant |
| 추출 검증 | 어떤 JSON이 와도 예외 없이 검증 결과(또는 null)를 낸다. 결과 주택형의 요건은 항상 U2 `validateRequirements` 통과 | Invariant |
| 번들 | 주택형이 최소 1개, 모든 주택형 유형은 정의된 코드, 묶음의 원천 공고 수 = 번들 sources 수 | Invariant |
| 오케스트레이터 | 소스 하나가 예외를 던져도 다른 소스의 공고는 모두 저장된다 | Invariant (예시 + 가짜 소스로) |
| 오케스트레이터 | 같은 원천 데이터로 두 번 실행하면 두 번째는 AI를 부르지 않고 저장도 하지 않는다 | Idempotence |

**예시 기반 테스트로 고정할 것** (PBT-10): cheongYak-radar 실제 응답 샘플로 만든 파서 픽스처(청약홈 JSON, LH 목록·상세 JSON, GH 메인 HTML), §3 묶기 예시, 대기열 화면, 0건 경고, AI 3회 실패, 목업 모드 전체 흐름, 골든 세트(BR-U3-80~82).

---

## 변경 메모 (U3 NFR Requirements Q1=A, 2026-10-14)

§2의 6단계(AI 추출)는 `collect`에서 빼서 **매시간 `analyze` 함수**로 옮긴다.

```text
collect (매일): 1~5, 6'(묶음 저장만 — AI 필요 공고는 summary_status=pending, 기존 요약·추출은 그대로 둠), 7~9
analyze (매시간):
  a. pending(또는 failed & ai_attempts < 3) 공고를 접수 마감이 가까운 순으로 최대 2건 선택 (동시 실행 방지 잠금)
  b. 공고마다 PDF 찾기 → 추출 → 검증 → 묶음 저장(주택형·요건·요약) / 실패 → ai_attempts+1
  c. 처리한 공고가 있으면 U2 recomputeAll (기기 ≤ 10 × 공고 ≤ 2,000, 수 초)
  d. collect_runs 기록
```
자세한 시간 예산은 nfr-requirements.md §1·§2.
