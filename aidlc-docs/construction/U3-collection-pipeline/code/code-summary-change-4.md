# U3 collection-pipeline — 변경 요청 4 코드 요약

> 계획: `construction/plans/U3-collection-pipeline-change-4-code-generation-plan.md` · 설계: 기능 설계 변경 4 (domain-entities "변경 요청 4", business-rules §12, business-logic-model "변경 요청 4")

## 새 파일

| 파일 | 내용 |
|---|---|
| `collect/place-names.ts` | 지구 이름 → 시군구: 시도별 시군구 앞부분(2글자 이상, 긴 것 먼저), 낱말 처음만, "광역시" 제외 (BR-U3-E4·E5) |
| `collect/audience-words.ts` | 대상 낱말 표(E20), 서식·양식 첨부 빼기(E3), 목록은 모든 항목이 대상일 때만(E24) |
| `collect/__tests__/change4.test.ts` | 예시 35개 — 실제 원천 조각(LH dsSbd·dsCtrtPlc, GH sr7150·sr7155 HTML, 청약홈 화성특례시), 신고 9건, PDF 고르기, 실패 이유, 해시 판 |
| `collect/__tests__/change4.pbt.test.ts` | P-U3-E1~E7 |
| `supabase/migrations/0016_collect_audiences.sql` | `audiences_ai`·`ai_last_error` 칸(+제약), `summary_status`에 `skipped`, `upsert_notice_bundle`(audiences 보존·AI 대상·실패 이유), `release_notice_claim`·`release_reanalysis`에 실패 이유, 다시 분석 판 3 |
| `supabase/tests/collect-audiences.test.sql` | pgTAP 10개 |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `collect/regions.ts` | `withoutSpecialCity` — "화성특례시" → 화성시 (E1) |
| `collect/parsers/lh.ts` | 상세 `dsSbd[].LCT_ARA_ADR` → `locationTexts` (접수처 `dsCtrtPlc`는 안 씀) |
| `collect/parsers/gh.ts` | `parseGhDetailInfo`: "공급정보" 표의 소재지·주택형 칸 (접수처 표·본사 주소 안 씀) |
| `collect/collectors.ts` | LH·GH 상세 결과를 원천 공고에 싣기 |
| `collect/normalize.ts` | 지역 = 원천 ∪ 공급 위치 칸 ∪ 지구 ∪ 지구 이름, 대상 = 제목·공급유형 낱말 ∪ 주택형 목록 ∪ 공고문 첨부 목록 |
| `collect/content-hash.ts` | `NORMALIZE_VERSION = 4` + 위치·단서 글 → 배포 뒤 첫 수집에서 모두 다시 저장 (E40) |
| `collect/bundle.ts`·`types.ts` | 묶음 대상(합집합), `audiences_ai`·`ai_last_error`·`skipped` |
| `collect/collect-orchestrator.ts` | 공고문 PDF가 없으면 `skipped` (E31) |
| `collect/pdf-locator.ts` | 확장자·경로 .pdf만 — "공고문(PDF) …xlsx" 버그 (E30) |
| `collect/prompt.ts`·`extraction.ts` | AI 추출 `audiences` (E22) |
| `collect/gemini-request.ts` | 기본 모델 **`gemini-3.5-flash`**, 출력 한도 16,384 (E33, 측정은 아래) |
| `collect/analyze-orchestrator.ts`·`ports.ts` | `ANALYSIS_VERSION = 3`, 성공 시 `audiences_ai`·실패 이유 지움, 실패 시 `failureReason`(코드: 설명, 쿼리 지움, 200자) |
| `_lib/db/collect-repository.ts`·`__tests__/collect-fakes.ts` | 실패 이유 전달. 가짜 저장소의 분석 대상 고르기를 SQL처럼 넓게(E42) |
| `domain/audiences.ts` + U2 저장소 2곳 | `judgementAudiences` — AI 값이 비어 있지 않으면 AI, 아니면 제목 값 (E23) |
| `db/types.ts` 등 | `SummaryStatus`에 `skipped` |

## Gemini 모델 측정 (2026-10-25, 새 무료 키)

같은 큰 공고문(경기행복주택 추가모집, 1.7MB·5.8만 토큰):

| 모델 | 결과 |
|---|---|
| gemini-2.5-flash | 404 — 새 사용자에게 제공 안 함 |
| gemini-3.8-flash | 503(수요 폭주) 또는 130~225초 — 호출 60초·함수 150초 한도에 안 맞음 |
| gemini-3.5-flash-lite | 35초, 주택형을 1개로 뭉침 |
| **gemini-3.5-flash** (출력 16,384) | **31초**, 주택형 5개(대학생·청년·신혼부부·고령자·주거급여수급자)·대상·공급 위치 15곳 정확. 출력 8,192에서는 한 번 JSON이 잘림 |

## 로컬 실제 수집·분석 확인 (로컬 Supabase, 운영 DB 안 건드림)

- collect: 실제 원천 4곳 → 40건 저장. 신고 9건: 연천BIX 연천군·dormitory / 동탄 95·99 화성시(skipped) / 경기남부 일반 매입임대 경기·low_income / 시흥하중 시흥시·newlywed / 구리갈매 구리시 / 시흥거모 시흥시 / 창업특화주택 경기·startup. GH 특화형 매입임대는 부천·김포·의왕, 대상 없음
- analyze: 큰 공고문이 3.8-flash로 60초 초과 → `ai_last_error`에 "gemini_error: network …(timeout)" 기록 확인 → 3.5-flash로 바꾼 뒤 다시 분석 성공, `audiences_ai` 저장·실패 이유 지움
- 판정 다시 계산의 기기 실패 508건은 E2E가 남긴 로컬 시험 기기(다른 암호화 키) — 운영과 무관

## 알아 둘 점

- 모델 응답이 가끔 덜 채워진다: 인천계양 A17은 한 번은 주택형 1개·요약 없음, 다시 호출하면 주택형 3개·요약 정상. 분석 판 3으로 저장되면 다시 분석하지 않는다(지금 규칙)
- "(인천,부천)"처럼 다른 시도의 지명은 찾지 않는다(시도 집합을 늘리지 않음, P-U3-E2) — 그 공고는 소득 계층 공고라 대상으로 빠진다
- 빌드가 Next.js 보안 취약점 경고로 첫 실행을 멈춘다(다시 실행하면 진행) — 이번 범위 밖

## 검증 (2026-10-25)

- typecheck·lint·deno check 통과
- 단위 914개 통과 (3회)
- pgTAP 202개 통과 (0015·0016 로컬 적용)
- 로컬 E2E 89 통과·3 건너뜀(알림 권한 — 전과 같음)
