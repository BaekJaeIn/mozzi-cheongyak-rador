# U4 profile-settings — 변경 요청 3 코드 생성 계획

> 근거: U4 기능 설계 변경 3 (domain-entities §8, business-rules §10 BR-U4-D1~D62, business-logic-model §9, frontend-components §8, 2026-10-20 승인)
> 원칙: 서버·DB는 바꾸지 않는다(U2에서 v3 검증·배우자 소득 암호화 끝남). 노부부 화면·저장 값은 가구 종류 화면 하나 말고 그대로(P-U4-D1). 안내 번호는 올리지 않는다.

## 단계

- [x] **Step 0 — 노부부 비교용 사본** `src/features/profile/model/__tests__/legacy/` 에 지금 `steps.ts`·`convert.ts`(+ 필요한 의존) 사본 — P-U4-D1 비교 대상
- [x] **Step 1 — 마법사 답·화면** `types.ts`·`steps.ts`
  - 새 답 키(domain-entities §8.2), 화면 `householdKind`·`marriage`·`marriageDate`·`children`·`neverOwned`·`incomeTax`·`spouseSavings*`·`spouseIncome`
  - 보이는 조건에 가구 종류(신혼: 가구 구성·`spouseEarns`·`welfare` 안 보임, BR-U4-D10·D11·D17·D22), `householdKind`는 setup 모드에서만
  - `GroupId`에 `kind`·`marriage`, `groupOrder(kind)`, 생년월일·혼인 날짜 범위(BR-U4-D12·D13)
  - `pruneHidden`: 혼인 상태 바뀌면 날짜 지움, 가구 종류별 키 지우기(P-U4-D6)
- [x] **Step 2 — 변환** `convert.ts`
  - `toProfile`·`fromProfile` 신혼 표(통장 명의 → 본인·배우자 통장, 소득 합계, 자녀 → 가구원 수, 생애최초), 노부부는 `householdKind: "senior"`·`newlywed: null`
  - `switchKind(answers, kind)` (domain-entities §8.4), 그룹 고치기 합치기에 `marriage` 그룹
- [x] **Step 3 — 기기 저장·업데이트 기록** `storage.ts`·`updates.ts`
  - 초안 v3 + v2 옮기기(`householdKind: "senior"`), 처음 기록 "버전 2 이상"(BR-U4-C21 고침)
- [x] **Step 4 — 요약 문구** `summary.ts`: 결혼·자녀, 신혼 집·통장·소득 요약, 소득 합계 안내(BR-U4-D32·D51)
- [x] **Step 5 — 화면: 마법사** `StepScreen.tsx`·`controls.tsx`·`ProfileWizard.tsx`
  - `HouseholdKindChoice`, 혼인 날짜(연·월 / 연·월·일), 자녀·생애최초 보기·도움말, 배우자 통장 화면(제목 앞말), [소득 없어요], 신혼 문구(배우자·집·자산·통장 "두 분 다" 안내)
  - `redo` 모드 `switchTo`(초안 저장 안 함, 가구 종류 화면 없음), `/profile/setup?redo=1&kind=`
  - 확인 화면: 가구 종류 줄, 종류별 그룹
- [x] **Step 6 — 화면: 설정** `SettingsView.tsx`: "가구 종류" 줄 + `KindChangeDialog`(뒤로 = 그만두기), `groupOrder(kind)`, 저장 뒤 `pending` 비움(BR-U4-D46)
- [x] **Step 7 — 테스트**
  - 예시 `change3.test.ts`: 신혼 화면 표(사례 2개 화면 수 29·25), 답 ↔ 프로필 표, `switchKind` 예시 3개, 초안 v2 옮기기, 요약 문구, 노부부 화면 수 23
  - PBT `change3.pbt.test.ts`: P-U4-D1~D6, 신혼 답 생성기
  - 기존 테스트 기대값(첫 화면·진행 분모, 프로필 v3 필드)
  - E2E: 신혼 처음 입력 끝까지 → 피드, 노부부 경로 가구 종류 화면, v2 프로필 기기 — 창·띠 없음·설정 "노부부·어르신", 종류 바꾸기 [그만두기]·[바꾸기 → 저장], 쉬운 모드 가로 스크롤·axe
- [x] **Step 8 — 검증과 문서**
  - typecheck·lint·단위(seed 3회)·pgTAP·로컬 E2E(로컬 Supabase 값)
  - `aidlc-docs/construction/U4-profile-settings/code/code-summary-change-3.md`, 로컬 커밋 (push는 확인 후)

## 배포 메모 (Build and Test에서)

- 앱(push)은 U2·U3 함수 배포와 0012·0013 뒤에 — 서버가 v3 프로필과 신혼 판정을 먼저 알아야 한다
- 신혼 판정 표시(신청 방법별 이유)는 U5에서. U4만 배포하면 신혼 가구도 피드는 보이지만 이유는 주택형 기준 하나
