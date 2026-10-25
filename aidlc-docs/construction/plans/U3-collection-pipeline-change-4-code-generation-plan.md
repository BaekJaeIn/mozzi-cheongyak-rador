# U3 collection-pipeline — 변경 요청 4 코드 생성 계획

> 근거: U3 기능 설계 변경 4 (domain-entities "변경 요청 4", business-rules §12 BR-U3-E1~E42, business-logic-model "변경 요청 4", 2026-10-25 승인)
> 원칙: 잘못 넣기보다 못 찾기(NFR-C4-1) — 실제 원천 응답 조각(fixtures)으로 9건을 고정한다. 옛 DB(0016 전)에서도 함수가 깨지지 않게 새 칸은 있을 때만 보낸다. 운영 반영은 Build and Test.

## 단계

- [x] **Step 1 — 시 이름 정리** `collect/regions.ts` `matchCapitalSigungu`: 낱말의 "특례" 빼고 맞춤 (E1)
- [x] **Step 2 — 지구 이름 → 시군구** `collect/place-names.ts`(새): 시도별 시군구 앞부분 사전(2글자 이상, 긴 것 먼저), 낱말 처음 규칙, "광역시" 제외 (E4·E5)
- [x] **Step 3 — 신청 대상 낱말** `collect/audience-words.ts`(새): 낱말 표 → `NoticeAudience[]` (E20·E21), 공고문 첨부만 고르는 함수(서식·양식 등 제외, E3)
- [x] **Step 4 — 원천 위치 글·단서 글**
  - `types.ts`: `RawNotice.locationTexts?`·`hintTexts?`, `NormalizedNotice.locationTexts`·`hintTexts`·`audiences`
  - `parsers/lh.ts` `parseLhDetail`: `dsSbd[].LCT_ARA_ADR` → `locationTexts` (`dsCtrtPlc` 안 씀)
  - `parsers/gh.ts`: 상세 "공급정보" 표의 소재지 → `locationTexts`, 주택형 칸 → `hintTexts` (표 밖 글 안 씀)
  - `collectors.ts`: LH·GH 상세 결과를 원천 공고에 싣기
  - `normalize.ts`: 지역 = 원천 ∪ 위치 글 ∪ 지구 ∪ 단서 글 지구 이름(E2), 대상 = 제목·단서 글(E20)
- [x] **Step 5 — 해시·묶음·저장 형식**
  - `content-hash.ts`: `NORMALIZE_VERSION = 4` 입력 (E40)
  - `bundle.ts`·`types.ts NoticeBundle`: `audiences`, PDF 없으면 `summary_status: "skipped"` (E31)
  - `stored.ts`: 저장된 원천 읽기 호환
- [x] **Step 6 — PDF 고르기** `pdf-locator.ts` `isPdf`: 확장자·경로 .pdf만 (E30)
- [x] **Step 7 — AI 추출·분석**
  - `prompt.ts`·`extraction.ts`: `audiences`(9개 값, 누구나 [], 모름 null) 스키마·검증 (E22)
  - `gemini-request.ts`: 기본 모델 ~~`gemini-3.8-flash`~~ → **`gemini-3.5-flash`**·출력 16,384 (측정으로 고침, code-summary-change-4 "Gemini 모델 측정"), `GEMINI_MODEL` 환경 변수는 이미 있음 (E33), 오류 설명에 HTTP 상태
  - `analyze-orchestrator.ts`: 성공 시 `audiences_ai`, 실패 시 `ai_last_error`(200자, 쿼리 문자열 제거) (E32), `ANALYSIS_VERSION = 3` (E34)
  - `ports.ts`·`_lib/db/collect-repository.ts`·메모리 저장소: `releaseClaim(id, failed, error?)`
- [x] **Step 8 — DB** `supabase/migrations/0016_collect_audiences.sql`
  - `notices.audiences_ai text[] null`(+ 값 제약), `ai_last_error text null`, `summary_status`에 `skipped`
  - `upsert_notice_bundle`: `audiences`·`audiences_ai`·`ai_last_error` (키가 없으면 그대로), `release_notice_claim`: 실패 이유
  - pgTAP
- [x] **Step 9 — 판정 입력 대상 고르기** (U2 저장소): `audiences_ai`가 비어 있지 않으면 그것, 아니면 `audiences` (E23) — Deno·Node 둘 다
- [x] **Step 10 — 테스트**
  - 예시: 신고 9건(실제 응답 조각: LH 상세 dsSbd·dsCtrtPlc, GH sr7150 소재지·본사 주소, 청약홈 화성특례시), 특화형 매입임대 "부천. 김포", "공고문(PDF) …xlsx" 안 고름, 청약홈 단독 skipped, 402 → ai_last_error
  - PBT `collect/__tests__/change4.pbt.test.ts`: P-U3-E1~E7
  - 기존 테스트 기대값 정리(해시·분석 판·스키마)
- [x] **Step 11 — 검증과 문서**
  - typecheck·lint·deno check·단위(3회)·pgTAP·로컬 E2E
  - 로컬 함수로 collect 1회(로컬 Supabase, mock 아님 — 원천 실제 호출) → 신고 공고의 지역·대상 확인. 운영 DB는 건드리지 않음
  - `aidlc-docs/construction/U3-collection-pipeline/code/code-summary-change-4.md`, 로컬 커밋
