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

---

## 변경 요청 2 (2026-10-18)

### 수집 흐름 변화

```text
소스(청약홈·LH·GH·SH) ─▶ 원천 공고 ─▶ 정규화(시도·시군구·지구) ─▶ 지역 판별(regions, BR-U3-C4~C8)
   ├─ regions 없음 → 버림 + 경고 (BR-U3-C2·C3)
   └─ 있음 → 묶기(지역 합집합) ─▶ 저장(regions, regions_ai 유지) ─▶ 판정 재계산(전체)
```

### 분석 흐름 변화

```text
claim_notices_for_analysis
  └─ 대상 = 마감 전 · 대기/실패<3 · (관심 기기 90일 중 하나라도 관심 지역 안)  ← SQL에서 지구 일치 OR 시군구 일치
Gemini 추출 ─▶ supplySigungu → 시군구 맞추기 ─▶ regions_ai = regions의 null 항목을 고친 값 (BR-U3-C9)
```

관심 지역 판정을 SQL로도 해야 하므로(요약 대상 고르기), SQL 판정과 U2 TS 판정(`inInterestArea`)이 **같은 결과**인지 pgTAP·예시로 맞춘다.

### SH 수집기

```text
목록(분류 1·2, 모집공고, 1~2쪽) ─▶ 제목 제외어 거르기 ─▶ 상세(본문 날짜, PDF 첨부, 본문 시군구) ─▶ 원천 공고
```

### 테스트 가능한 속성 (PBT-01, 변경 2)

| ID | 대상 | 속성 | 종류 |
|---|---|---|---|
| P-U3-C1 | 지역 판별 | 결과의 모든 항목은 수도권 시도이고, 시군구는 공용 목록 안이거나 null | Invariant |
| P-U3-C2 | 지역 판별 | 같은 시도에 시군구 값이 있으면 그 시도의 null 항목은 없다, 중복 없다 (정리 규칙) | Invariant |
| P-U3-C3 | 묶기 | 묶음 지역은 입력 순서와 무관하고, 모든 원천 지역을 포함(정리 후) | Invariant / Commutativity |
| P-U3-C4 | AI 지역 고치기 | 고친 뒤 지역은 고치기 전 지역의 "시도 집합"을 바꾸지 않는다, 이미 정해진 시군구는 그대로 | Invariant |
| P-U3-C5 | 요약 대상 | SQL 관심 지역 판정 = TS `inInterestArea` (무작위 지역·관심 지역 쌍) | Model-based (예시 + pgTAP 표로) |
| P-U3-C6 | SH 목록 파싱 | 제외어가 든 제목은 결과에 없다, 글번호는 중복 없다 | Invariant |
| P-U3-C7 | 인천 옛 구 | 영종 쪽 동이 들어 있는 "중구" 주소는 항상 영종구, "동구"는 항상 제물포구 | Invariant |

---

## 변경 요청 3 (2026-10-20)

```text
analyze 실행
  ① 새 공고 예약 (지금처럼, 관심 지역 안 pending) → 분석 → 판 2로 저장
  ② 남은 몫 = 배치 − ①의 수
     → claim_notices_for_reanalysis(남은 몫) (하루 5건 상한)        BR-U3-D31
     → 같은 분석(PDF + 지시문) → 성공: 주택형·요건·요약 교체, 판 2   BR-U3-D33
                                  실패: 그대로 두고 시도 +1            BR-U3-D32
  ③ 판정 다시 계산 (지금처럼)

분류 (BR-U3-D1): AI 줄 "신혼부부 특별공급" → newlywed_special_supply
  신혼 가구: 신혼 특공 방법 1개, 요건 = 표준 ⊕ 공고문 값                BR-U3-D3·D4
  노부부 가구: 미충족 "신혼부부·생애최초 대상 물량이에요"               BR-U3-D5
```

### 테스트 가능한 속성 (PBT-01)

| # | 속성 | 종류 |
|---|---|---|
| P-U3-D1 | 분류: "신혼희망타운"이 들어간 표기는 항상 newlywed_hope_town, 임대 낱말 + "신혼"은 항상 rental_newlywed_supply, 그 밖 기존 표기(신혼·생애최초 낱말 없음)의 분류는 변경 3 전과 같다 | Invariant |
| P-U3-D2 | 요건 합치기: 결과는 표준과 공고문 키의 합집합이고, 공고문에 있는 키는 공고문 값 그대로 | Invariant |
| P-U3-D3 | 어떤 JSON이 와도 추출 검증은 예외 없이 결과 또는 null, `forNewlywed`가 틀려도 나머지 요약은 살아 있다 | Robustness |
| P-U3-D4 | 다시 분석 실패는 기존 요약·주택형을 바꾸지 않는다 (가짜 저장소) | Invariant |
