# U3 collection-pipeline — 변경 요청 2 코드 생성 계획

> 근거: U3 변경 2 기능 설계(BR-U3-C1~C20), NFR 요구(NFR-U3-C1~C15), NFR 설계(P-U3-C1~C6, logical-components §5)
> 원칙: 배포 순서에 묶이지 않게 — 0010은 칸·함수 추가 위주, 함수 본문 없이 부르면 지금처럼 전체 수집

## 단계

- [x] **Step 1 — 지역 판별 (순수)** `_shared/collect/regions.ts`
  - `resolveRegions`, `mergeRegions`(정리 규칙: 중복 제거, 같은 시도에 시군구 값이 있으면 null 항목 제거), `incheonNewGu`(동 목록 — 행정안전부 자료와 대조), `applyAiRegions`, `matchCapitalSigungu`(시+구 → 시, 옛 인천 구)
  - 지구 → 지역(BR-U3-C8): 활성 지구 규칙의 시도·첫 시군구
- [x] **Step 2 — 정규화·묶기·범위**
  - `types.ts`: `CollectSource`에 `sh`, `NormalizedNotice.regions`
  - `normalize.ts`: `regions` 채우기 / `collect-orchestrator.ts`: 지역 없으면 버림 + 실패 수·제목 경고(BR-U3-C2·C3)
  - `bundle.ts`: 묶음 지역 합집합, 대표 우선순위 LH·GH·SH > 청약홈, 저장 묶음에 `regions`
  - `parsers/applyhome.ts`·`parsers/lh.ts`: 시도 필터에 서울
- [x] **Step 3 — SH 수집기** `parsers/sh.ts` + `collectors.ts`
  - 실제 SH 목록·상세 HTML 사본을 `__tests__/fixtures/collect/real-sh-*.html`로 저장(공개 공고, 개인정보 없음)
  - 목록 파싱(분류 1·2, 모집공고, 2쪽, 글번호·제목·등록일), 제외어(BR-U3-C11), 상세 파싱(본문 날짜·PDF 첨부·시군구), 대기열·차단 감지
  - 상세 줄이기(P-U3-C5): `collect_state`로 저장 상태 → 새 글·제목 바뀐 글만, 1초 간격, 최대 15건, 남은 시간 10% 미만이면 멈춤
- [x] **Step 4 — 묶음 호출·예산·재계산** (P-U3-C1·C2)
  - `COLLECT_GROUPS`, `SOURCE_BUDGET_MS`(LH 55초, SH 35초), `runCollect(opts.group)`, 재계산 시점
  - `functions/collect/index.ts`: 요청 본문 `group`, 실행 기록 warning에 묶음 이름
- [x] **Step 5 — AI 공급 위치** (BR-U3-C9)
  - `prompt.ts`: `supplySigungu` 스키마·규칙 한 줄 / `extraction.ts`: 검증
  - `analyze-orchestrator.ts`: 추출 뒤 `applyAiRegions` → 저장 묶음에 `regions_ai`
- [x] **Step 6 — DB 마이그레이션** `supabase/migrations/0010_collect_regions.sql`
  - `notices.regions_ai`, `sh` 원천 제약, `upsert_notice_bundle`(regions 저장, regions_ai는 분석 저장 때만), `notice_in_any_interest`, `claim_notices_for_analysis` 조건, `invoke_edge_function(name, body)`, cron 두 묶음, 권한
  - pgTAP `supabase/tests/collect-regions.test.sql`: 칸·제약·저장(regions_ai 유지)·관심 지역 표 12쌍·90일 기기·claim 대상·권한
- [x] **Step 7 — 공고 지역 읽기 통일** `regions_ai ?? regions`
  - Deno `_lib/db/repositories.ts`, Node `src/server/db/notice-repository.ts` (피드 표시는 U5)
- [x] **Step 8 — 테스트**
  - 예시: 지역 판별(서울·경기 시+구·인천 옛 구·통합 공고·지구 지역), SH 실제 HTML, 묶음 호출·재계산 시점, AI 지역 고치기, 관심 지역 공유 표(TS 쪽 — pgTAP과 같은 표)
  - PBT `collect/__tests__/regions.pbt.test.ts`: P-U3-C1~C4·C6·C7, 원천 공고 생성기에 서울·SH·인천 옛 구 주소
  - 기존 테스트·목업 데이터(`mock-data.ts`)에 `regions`
- [x] **Step 9 — 검증**
  - typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E
  - 로컬 `collect`(목업)·SH 실제 1회 실행(로컬 함수, 요청 수 확인)·`analyze` 대상 SQL 확인
- [x] **Step 10 — 문서**
  - `U3-collection-pipeline/code/code-summary-change-2.md`
  - 운영 반영 안내 초안(0009·0010 적용 → collect·analyze 함수 배포 → cron 확인) — Build and Test에서 확정
