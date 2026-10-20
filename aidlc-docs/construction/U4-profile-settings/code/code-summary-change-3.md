# U4 profile-settings — 변경 요청 3 코드 요약

> 계획: `plans/U4-profile-settings-change-3-code-generation-plan.md` (Step 0~8 완료, 2026-10-20)
> 설계: functional-design domain-entities §8, business-rules §10 (BR-U4-D1~D62), business-logic-model §9, frontend-components §8

## 바뀐 파일

| 파일 | 내용 |
|---|---|
| `src/features/profile/model/types.ts` | 새 답 키(`householdKind`, 결혼·자녀, 생애최초, 배우자 통장, `spouseIncome`), `kindOf`·`isNewlywed` |
| `src/features/profile/model/steps.ts` | 화면 10개 추가(`householdKind`·`marriage`·`marriageDate`·`children`·`neverOwned`·`incomeTax`·`spouseSavings*`·`spouseIncome`), 가구 종류별 보이는 조건, 그룹 `marriage`·`groupOrder(kind)`·`KIND_LABELS`, 범위 `"full"`(가구 종류 화면 없음), `birthYears`·`marriageYears`, `hasSpouse`는 신혼 가구면 항상 참 |
| `src/features/profile/model/convert.ts` | `toProfile` 노부부/신혼 분리(신혼: 부부·2+자녀, 명의 → 본인·배우자 통장, 소득 합계, 생애최초, 복지 없음), `fromProfile` 신혼 답, `switchKind`, `hasBlankFields` 신혼 항목 |
| `src/features/profile/model/storage.ts` | 초안 v3, v1·v2 → v3 옮기기(노부부) |
| `src/features/profile/model/summary.ts` | 결혼·자녀 요약, 신혼 집·통장·소득 요약 |
| `src/features/profile/model/amount.ts` | 금액 칸 `spouseIncome`·`spouseDepositManwon` |
| `src/features/profile/model/updates.ts` | 주석만 (안내 번호 1 그대로, v2 이상은 안내 없음) |
| `src/features/profile/ui/StepScreen.tsx` | 가구 종류 보기, 혼인·자녀·생애최초·배우자 통장·배우자 소득 화면, 신혼 문구·안내 |
| `src/features/profile/ui/controls.tsx` | 날짜 고르기에 `precision`(연·월)·`allowFuture`·`labels`·`describe`, 금액 입력에 `zeroButton`([소득 없어요]) |
| `src/features/profile/ui/ProfileWizard.tsx` | 첫 화면 가구 종류, redo `switchTo`(가구 종류 바꾸기), 확인 화면 가구 종류 줄·종류별 그룹·소득 합계 안내 |
| `src/app/profile/setup/page.tsx` | `?redo=1&kind=newlywed` |
| `src/features/settings/SettingsView.tsx` | "가구 종류" 줄 + 확인 창(뒤로 = 그만두기), 종류별 그룹 |

## 테스트

| 파일 | 내용 |
|---|---|
| `model/__tests__/legacy/steps.ts`·`convert.ts` | 변경 3 전 사본 — P-U4-D1 비교 대상 |
| `model/__tests__/change3.test.ts` (25) | 화면 목록(신혼 29·25), 변환 표, `switchKind` 예시, 초안 v3, 요약 문구, 생년월일·혼인 범위 |
| `model/__tests__/change3.pbt.test.ts` (7) | P-U4-D1~D6 |
| `model/__tests__/arbitraries.ts` | `newlywedAnswersArb` |
| 기존 테스트 | 화면 수·진행 표시 +1(가구 종류), 초안 버전 3 |
| `e2e/profile.spec.ts` (+4 × 2기기) | 신혼 처음 입력 → 서버 v3 저장·설정 그룹, 부모님 v2 기기 그대로, 가구 종류 바꾸기(그만두기·뒤로·저장 전 나가기·저장), 큰 글씨 신혼 화면 |

## 만들면서 찾은 것

- **신혼 답에서 배우자 생년월일이 지워지던 문제**: 신혼 가구는 가구 구성 화면이 안 보여서 `pruneHidden`이 `householdType`을 지웠고, 그 뒤 "배우자 있음" 판단이 거짓이 돼 배우자 생년월일까지 지웠다. 왕복 속성(P-U4-D3)은 같은 값으로 지워져 통과했고 P-U4-D6이 잡았다. `hasSpouse`를 신혼 가구면 항상 참으로, 부부 값은 지우기 뒤에 넣도록 고침 + 예시 테스트 추가
- 설정 요약에서 집 "모름"이 "집 있음 · 확인 필요"로 보이던 실수(함수로 옮기며 첫 줄 빠뜨림) — 기존 테스트가 잡아 고침

## 검증 (2026-10-20)

| 항목 | 결과 |
|---|---|
| typecheck·lint | 통과 |
| 단위 (seed 11·22·33) | 802 / 802 / 802 |
| pgTAP | 168/168 |
| 로컬 E2E (로컬 Supabase) | 79 통과, 3 건너뜀 |

## 배포 메모

- 서버·DB 바꿈 없음. 앱 push는 0012·0013 → collect·analyze·dispatch 배포 뒤에(서버가 v3·신혼 판정을 먼저 알아야 함)
- 신청 방법별 판정 이유 표시는 U5
