# U3 collection-pipeline — 변경 요청 2 코드 요약

> 계획: `construction/plans/U3-collection-pipeline-change-2-code-generation-plan.md` · 설계: 기능 설계 §10, NFR 요구·설계 변경 2 절

## 새 파일

| 파일 | 내용 |
|---|---|
| `_shared/collect/regions.ts` | 지역 판별(`resolveRegions`), 정리(`mergeRegions`), 지구 지역, 인천 옛 구(`incheonNewGu`·`matchCapitalSigungu`), AI 고치기(`applyAiRegions`) |
| `_shared/collect/parsers/sh.ts` | SH 게시판 목록·상세·첨부(`innoFD.do`) 파서, 제외어, 정상 화면 판별, 제목의 서울 구 |
| `supabase/migrations/0010_collect_regions.sql` | `notices.regions_ai`, `upsert_notice_bundle`(regions·regions_ai), `interest_area_match`, `notice_in_any_interest`, `claim_notices_for_analysis` 관심 지역 조건, `analysis_backlog`, `invoke_edge_function(name, body)`, cron `collect-daily`(api)·`collect-crawl`(crawl) |
| `supabase/tests/collect-regions.test.sql` | pgTAP 25개 (지역 저장·AI 지역 유지, **관심 지역 공유 표 12쌍**, 90일 기기, 분석 대상, 권한, cron) |
| `collect/__tests__/sh.test.ts` | 실제 SH 화면 사본 + 수집기 흐름(상세 줄이기·15건·1초·두 게시판 순서·차단·0건) 12개 |
| `collect/__tests__/regions.test.ts` | 예시 10개 + PBT P-U3-C1~C4·C7 |
| `collect/__tests__/interest-table.test.ts` | SQL 공유 표를 읽어 U2 `inInterestArea`로 확인 (P-U3-C5) |
| `__tests__/fixtures/collect/real-sh-*.html` | SH 목록 2·상세 2 (2026-10-19, 표·첨부 부분만, 전화번호·이메일 가림) |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `collect/types.ts` | 원천 `sh`, `NormalizedNotice.regions`, 번들 `notice.regions`·`regions_ai`, `NoticeExtraction.supplySigungu` |
| `collect/normalize.ts` | 지역 채우기 |
| `collect/collect-orchestrator.ts` | 지역 없으면 버림 + "지역 판별 실패" 경고, 묶음(`COLLECT_GROUPS`, `group` 옵션), 재계산 시점(api는 저장분 있을 때만), 예산 LH 55초·SH 35초, SH에 저장 제목 넘기기 |
| `collect/bundle.ts`·`grouping.ts`·`stored.ts` | 묶음 지역 합집합, 대표 우선순위에 sh, 저장 공고 지역 읽기 |
| `collect/collectors.ts` | `shCollector` (목록 먼저 → 상세 최근 순·최대 15건·1초 간격·남은 시간 10%), 목업에 sh |
| `collect/parsers/applyhome.ts`·`lh.ts` | 시도 필터에 서울 |
| `collect/prompt.ts`·`extraction.ts`·`analyze-orchestrator.ts` | `supplySigungu` 스키마·검증, 분석 저장에 `regions_ai` |
| `collect/mock-data.ts` | SH 목업 공고(서울 강서구) |
| `domain/district-matcher.ts` | `DistrictRule.sido`(선택) |
| `ports.ts`, `_lib/db/collect-repository.ts` | `knownTitles`, `sourceTitles(source)` |
| `_lib/deps.ts`, `functions/collect/index.ts` | SH 수집기 연결, 요청 본문 `group` |
| `_lib/db/repositories.ts`, `src/server/db/notice-repository.ts` | 판정용 공고 지역 = `regions_ai ?? regions` |
| 테스트 가짜·생성기·기존 테스트 | 관심 지역 가짜(기본: 3기 신도시 지구만 고른 기기), 수도권 범위 기대값, `sh` 원천 |

## 설계에 없던 결정 (구현 중)

- **SH 오래된 글 컷오프 120일** (`SH_STALE_DAYS`): 분양 게시판 모집공고 목록에 2021~2023년 글이 남아 있고 목록에는 마감일이 없어서, 등록 120일 지난 글은 모집이 끝난 것으로 본다
- **SH는 두 게시판 목록을 먼저 다 읽고 상세는 최근 등록 순**: 실제 실행에서 임대 상세가 시간을 다 써 분양 게시판을 건너뛰는 것을 확인해 순서를 바꿨다
- 첨부 다운로드 주소는 사이트의 첨부 컴포넌트 설정(innorix.config.js)과 같은 형식 — 실제로 PDF가 내려오는 것을 1KB 범위 요청으로 확인

## 실제 확인 (2026-10-19)

| 항목 | 결과 |
|---|---|
| SH 실제 수집 1회 (로컬) | 요청 17회, 33.1초(예산 35초), 모집공고 14건 + 다음 실행 6건, 제외 2건. 고덕강일 분양 포함 |
| SH 상세 일정 | 본문에 "접수기간 :"이 있는 글은 일정을 읽고(5건), 없는 글은 AI 추출로 채움 |
| SH 시군구 | 제목에 구 이름이 있는 글은 구까지(서초·성북·은평·강동), 나머지는 서울까지만 → 관심 지역 안이면 AI가 고침 |

## 검증

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (FC_SEED 11·222·3333) | 683 / 682 / 683 — seed 222에서 U6 발송 시간 시뮬레이션(P-13) 1건이 전체 병렬 실행 부하로 시간 초과, 단독 2회 통과 (이번 변경과 무관) |
| pgTAP | 150/150 (0009·0010 적용) |
| 로컬 E2E | 59 통과 + 3 건너뜀 |
| 통합 스모크(로컬 함수, 목업 수집) | 13/13 |

## 운영 반영 (Build and Test에서 확정)

1. `supabase db push` — 0009·0010 (칸·함수 추가, cron 두 묶음으로 바뀜)
2. `supabase functions deploy collect analyze` (dispatch는 판정 공용 코드라 함께 배포 권장)
3. 다음 날 05:00·05:10 실행 기록에 `group` api·crawl, SH 요청 수 확인
