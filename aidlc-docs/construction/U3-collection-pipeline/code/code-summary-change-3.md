# U3 collection-pipeline — 변경 요청 3 코드 요약

> 계획: `construction/plans/U3-collection-pipeline-change-3-code-generation-plan.md` · 설계: U3 기능 설계 §11 (BR-U3-D1~D33), U2 보완 BR-U2-D50~D53

## 새 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/0013_reanalysis.sql` | 신혼·생애최초 물량 공급유형 3개 시드, `notices.analysis_version`·`reanalysis_attempts`·`reanalyzed_at`, `upsert_notice_bundle`(0010 + 분석 판), `claim_notices_for_reanalysis`(하루 5건, 같은 공고 하루 한 번), `release_reanalysis`(요약 보존) |
| `supabase/tests/reanalysis.test.sql` | pgTAP 12개 |
| `collect/__tests__/change3.test.ts` | 예시 20개 (분류 10경우, 신혼 물량 줄 판정·합치기·노부부 미충족, 추출 새 칸, forNewlywed 선택, 다시 분석 성공·실패·하루 상한) |
| `collect/__tests__/change3.pbt.test.ts` | P-U3-D1~D4 |
| `eligibility/__tests__/legacy/supply-types.ts` | 변경 3 전 분류 고정본 (P-U3-D1 비교) |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `domain/supply-types.ts` | 새 코드 3개, 분류 순서 BR-U3-D1 (무순위·고령자복지 → 신혼희망타운 → 임대+신혼 → 신혼부부 → 생애최초 → 기존) |
| `eligibility/reference-data.ts` | 새 코드 표준 요건 (신청 방법 표준과 같은 값) |
| `eligibility/routes.ts` | `NEWLYWED_ONLY_ROUTE`, 노부부는 신청 방법 없음, `mergeRequirements`(표준 ⊕ 공고), 공고 키는 표준 꼬리 없음 |
| `eligibility/engine.ts`·`messages.ts` | 노부부 + 신혼 물량 줄 → 미충족 "신혼부부·생애최초 대상 물량이에요" |
| `collect/prompt.ts` | 신혼 물량 별도 지시, 새 칸 6개, `summary.forNewlywed` |
| `collect/extraction.ts`·`types.ts` | 혼인·예비신혼·생애최초·우선·추첨 변환, forNewlywed 선택 |
| `collect/analyze-orchestrator.ts`·`bundle.ts`·`ports.ts`·`_lib/db/collect-repository.ts` | 새 공고 먼저 → 남는 몫 다시 분석, 실패 보존, 판 2 저장, 기록에 다시 분석 수 |
| `src/server/feed/build.ts`·`api-types.ts` | 상세 요약에 `forNewlywed`(있을 때) |
| 테스트 | 가짜 저장소(분석 판·다시 분석), 시드 비교에 0013, 공급유형 13개, P-C3-1을 기존 공급유형으로 한정, "모름 프로필" 속성에서 신혼 전용 물량 제외, **P-13 테스트 제한 시간 60초** |

## 설계에서 정하지 않았던 결정 (구현 중)

- **같은 공고는 하루에 한 번만 다시 분석**: 하루 5건을 "오늘 다시 분석한 공고 수"로 세면, 실패한 공고를 10분 뒤 다시 집을 때 AI 호출이 5번을 넘었다(테스트가 잡음, 10회) → 오늘 이미 시도한 공고는 내일까지 대상에서 뺌
- **P-13 흔들림의 원인**: 테스트 안의 예산 검사는 45초인데 테스트 도구 기본 제한 시간이 5초라 부하가 있으면 예산 안이어도 잘렸다 → 제한 시간 60초
- 신혼 물량 줄을 AI가 요건 없이 뽑으면 저장 단계에서 표준 요건이 채워져, 엔진은 그 값을 공고 값으로 본다("일반적인 기준" 꼬리가 안 붙음). 작은 표시 차이라 그대로 둠
- 신혼 물량 줄의 표준은 공공 값(공고문이 덮어씀) — 줄만으로 공공/민영을 알 수 없음

## 검증 (2026-10-20)

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (FC_SEED 11·222·3333) | 770 / 770 / 770 |
| pgTAP | 168/168 (0012·0013 포함) |
| 로컬 E2E | 71 통과 + 3 건너뜀 |
| 통합 스모크 | 13/13 — 처음엔 포트 3123에 남아 있던 예전 앱 서버(이전 확인 때 것)로 돌아 다시 띄워 재실행, 통과 |

## 운영 반영 (Build and Test에서)

- 0012·0013 → `collect`·`analyze`·`dispatch` 배포 → push (새 공급유형은 외래 키, 함수가 v3 프로필을 읽어야 함)
- 다시 분석은 배포 다음 analyze 실행부터 하루 5건
