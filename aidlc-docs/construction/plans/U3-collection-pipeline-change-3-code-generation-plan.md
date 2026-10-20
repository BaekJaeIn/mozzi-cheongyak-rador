# U3 collection-pipeline — 변경 요청 3 코드 생성 계획

> 근거: U3 기능 설계 변경 3 (business-rules §11 BR-U3-D1~D33, domain-entities·business-logic-model 변경 3 절), U2 보완 BR-U2-D50~D53 (2026-10-20 승인)
> 원칙: 새 공고 분석은 지금과 같은 흐름. 다시 분석은 기존 요약을 지우지 않는다. 노부부 판정은 기존 공급유형에서 그대로(P-C3-1).

## 단계

- [x] **Step 1 — 공급유형 3개 (U2 보완)** `domain/supply-types.ts`, `eligibility/reference-data.ts`, `eligibility/routes.ts`, `eligibility/engine.ts`
  - `newlywed_special_supply`·`first_time_supply`·`rental_newlywed_supply` 코드·라벨·표준 요건(신청 방법 표준 그대로)
  - 분류 순서 BR-U3-D1 (신혼희망타운 → 임대+신혼 → 신혼부부 → 생애최초 → 기존)
  - `routesFor`: 신혼 = 해당 방법 1개, 노부부 = 없음 → 미충족 "신혼부부·생애최초 대상 물량이에요" (BR-U2-D51)
  - 요건 = 표준 ⊕ 공고문(키 단위), 공고 값 조건에는 표준 꼬리 없음 (BR-U2-D52)
- [x] **Step 2 — AI 추출** `collect/prompt.ts`, `collect/extraction.ts`, `collect/types.ts`
  - 지시문(신혼 물량 별도, forNewlywed), 응답 스키마 새 칸 6개 + `summary.forNewlywed`
  - `flatToRequirements`: marriage·firstTime·우선·추첨 (BR-U3-D12), `parseSummary`: forNewlywed 선택 (D21)
- [x] **Step 3 — DB** `supabase/migrations/0013_reanalysis.sql`
  - 공급유형 3개 시드, `notices.analysis_version`·`reanalysis_attempts`·`reanalyzed_at`
  - `upsert_notice_bundle`: `analysis_version` 저장, `claim_notices_for_reanalysis(p_limit, p_now)`(판 1·done·관심 지역 안·마감 전·시도 3회 미만·오늘 5건 상한), `release_reanalysis(p_notice_id)`(실패: 시도 +1, 요약·판 그대로)
  - pgTAP
- [x] **Step 4 — 분석 흐름** `collect/analyze-orchestrator.ts`, `ports.ts`, `_lib/db/collect-repository.ts`, 가짜 저장소
  - 새 공고 먼저 → 남는 몫으로 다시 분석 (BR-U3-D31), 성공: 교체·판 2 (D33), 실패: 보존 (D32), 기록에 다시 분석 수
- [x] **Step 5 — 요약 읽기 호환** `src/server/feed/build.ts`(`readSummary`): `forNewlywed` 있으면 함께 싣기 (화면은 U5)
- [x] **Step 6 — 테스트**
  - 예시: 분류 순서(실제 공고 표기 예), 표준 ⊕ 공고 합치기, 노부부 신혼 물량 미충족, 추출 새 칸·forNewlywed 틀림, 다시 분석 성공·실패·하루 5건
  - PBT: P-U3-D1~D4, P-C3-1을 기존 공급유형으로 한정(BR-U2-D53)
  - 기존 추출·분석 테스트 기대값
- [x] **Step 7 — 검증과 문서**
  - typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E·통합 스모크(목업 분석)
  - `aidlc-docs/construction/U3-collection-pipeline/code/code-summary-change-3.md`, 로컬 커밋

## 배포 메모 (Build and Test에서)

- 0012·0013 → `collect`·`analyze`·`dispatch` 배포 → push. 새 공급유형은 외래 키라 0013이 먼저
- 다시 분석은 배포 다음 analyze 실행부터 하루 5건씩
