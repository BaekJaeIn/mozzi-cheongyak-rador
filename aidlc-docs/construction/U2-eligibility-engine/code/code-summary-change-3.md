# U2 eligibility-engine — 변경 요청 3 코드 요약

> 계획: `construction/plans/U2-eligibility-engine-change-3-code-generation-plan.md` · 설계: 기능 설계 변경 3 (domain-entities, business-rules §11, business-logic-model §7)

## 새 파일

| 파일 | 내용 |
|---|---|
| `eligibility/routes.ts` | `ApplyRoute`, `routesFor(가구 종류, 공급유형)`, 공공/민영, 표준·공고 요건 고르기 (BR-U2-D10·D13) |
| `eligibility/criteria/marriage.ts` | 혼인 7년·예비신혼 (D20~D22), `addYears` |
| `eligibility/criteria/first-time.ts` | 생애최초: 주택 소유 이력·소득세 5년·혼인 또는 자녀 (D35) |
| `eligibility/__tests__/legacy/` | **변경 3 전 판정 엔진 고정본**(테스트 전용) — P-C3-1 노부부 불변 비교 기준 |
| `eligibility/__tests__/change3.test.ts` | 예시 16개 (옮기기, 신청 방법 표, 신혼희망타운 분류, P3 예시, 혼인 경계, 소득 140/160·추첨·우선, 배우자 통장, 생애최초, 자녀 보너스) |
| `eligibility/__tests__/change3.pbt.test.ts` | P-C3-1~6 + 생성기 점검 |
| `supabase/migrations/0012_household_kind.sql` | `newlywed_hope_town` 공급유형 시드 |
| `supabase/tests/household-kind.test.sql` | pgTAP 4개 (시드, v3 프로필 저장) |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `domain/profile.ts` | v3: `householdKind`, `NewlywedInfo`, `SavingsInfo`, `money.spouseMonthlyIncome`, 검증(신혼은 배우자·신혼 정보 필수, 노부부는 신혼 정보 없음, 배우자 소득은 신혼만) |
| `domain/profile-migrate.ts` | v1 → v2 → v3 (노부부, 멱등) |
| `domain/requirements.ts` | `marriage`, `firstTime`, `income.overLottery`·`priorityPercent`·`priorityDualIncomePercent` + 검증 |
| `domain/supply-types.ts` | `newlywed_hope_town` 코드·라벨·분류(공공분양보다 먼저) |
| `eligibility/reference-data.ts` | 신혼희망타운 표준 요건, `STANDARD_ROUTE_REQUIREMENTS`(원문 확인 값만, 나머지 unknown) |
| `eligibility/types.ts` | `CriterionKey` + marriage·firstTime, `RouteJudgement`, `UnitJudgement.routes`, `UnitForJudgement.routeRequirements` |
| `eligibility/engine.ts` | 노부부 = `judgeOwnType`(변경 3 전 코드 + 혼인·생애최초 요건 키가 있을 때만 평가), 신혼 = 신청 방법별 판정·최선, 표준 요건 꼬리, `childBonus` |
| `eligibility/criteria/income.ts` | 추첨(확인 필요)·우선공급 안내 — 새 요건 칸이 있을 때만 |
| `eligibility/criteria/savings.ts` | `evaluateCoupleSavings`(본인·배우자 통장 중 최선, `savingsBy`) — 노부부 `evaluateSavings` 결과 그대로 |
| `eligibility/messages.ts` | `MSG_NEWLYWED`, 새 행동 문구 |
| `security/profile-codec.ts` | 서버 저장본 v1·v2·v3 읽기, 배우자 월소득 암호화 |
| `feed/visible.ts` | 새 조건 키, 저장 판정의 `routes` 읽기 |
| `src/features/profile/model/convert.ts` | 마법사 저장 = v3 노부부 (신혼 화면은 U4) |
| `src/features/notice/model/display.ts`·`judgement.ts` | 새 조건 이름(혼인·생애최초) — 정식 화면은 U5 |
| 테스트 픽스처·생성기·기존 기대값 | 프로필 v3, `newlywedProfileArb`, 시드 비교에 0012, 버전 기대값 |

## 설계에서 정하지 않았던 결정 (구현 중)

- **서버 저장본 읽기가 v2를 거부하던 문제**를 고쳤다: 버전을 3으로 올리면서 `decodeProfile`이 "지금 버전 또는 1"만 받게 되어, 운영 서버에 있는 부모님 v2 프로필을 읽지 못할 뻔했다 → 1·2·3을 모두 받음
- **배우자 월소득 암호문은 `data.money.encSpouseMonthlyIncome`** 에 둔다(계획은 DB 칸 추가). `device_profiles` 칸·`save_device_profile` RPC를 바꾸지 않아도 되고 암호화는 같다
- **자녀 보너스**: 모든 공고에 같은 점수를 더하면 순서가 바뀌지 않아, 신혼 특공·신혼희망타운으로 신청할 수 있는 공고에만 더한다(BR-U2-D42 고침)
- **노부부 경로에도 혼인·생애최초 평가**를 넣었다: 기존 요건에는 키가 없어 결과가 그대로이고(P-C3-1 통과), 신혼희망타운 공고가 노부부에게 "확인 필요"로 보이지 않고 미충족이 된다
- 신청 방법별 표준 요건은 코드 상수(`STANDARD_ROUTE_REQUIREMENTS`)로 둔다 — 공급유형 표준처럼 DB 시드로 옮기는 것은 공고 추출(U3)이 신청 방법 요건을 채우게 된 뒤 판단

## 검증 (2026-10-20)

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (FC_SEED 11·222·3333) | 746 / 746 / 745 — seed 3333에서 U6 P-13(발송 시간 시뮬레이션)이 5,013ms로 5초 상한을 넘김, 단독 2회 통과 (이번 변경과 무관, 알려진 흔들림) |
| P-C3-1 노부부 불변 | seed 3개 통과 — 노부부 판정 = 변경 3 전 엔진 |
| pgTAP | 156/156 (0012 포함) |
| 로컬 E2E | 71 통과 + 3 건너뜀 — 기본 예시 프로필은 일부러 v2(부모님 휴대폰과 같은 상태)로 두어 옮겨 읽기 회귀 확인 |

## 운영 반영 (Build and Test에서)

- 0012 → (U3에서 `newlywed_hope_town` 분류를 쓰는 collect 배포) → 앱 push. 0012 전에 collect를 배포하면 외래 키 오류가 날 수 있다
- **함수 먼저, 앱 나중**: 새 앱(push)이 프로필을 v3로 저장하면, 아직 배포 안 된 Edge Function(`dispatch`·`collect`의 재계산)은 v3를 읽지 못한다(옛 `decodeProfile`). 순서: 0012 → `collect`·`analyze`·`dispatch` 배포 → push
