# U4 profile-settings — 변경 요청 2 코드 생성 계획

> 근거: U4 기능 설계 변경 2 (domain-entities §7, business-rules §9 BR-U4-C1~C37, business-logic-model §8, frontend-components §7, 2026-10-19 승인)
> 원칙: 서버·DB는 바꾸지 않는다(U2에서 v1·v2 모두 받음). 기기의 옛 저장값(프로필 v1, 초안 v1)을 깨지 않고 읽는다. 피드 화면(U5) 안의 창·띠 자리만 이 Unit에서 붙이고, 공고 지역 표시는 U5에서 한다.

## 단계

- [x] **Step 1 — 마법사 답·화면** `src/features/profile/model/types.ts`·`steps.ts`
  - `savingsHas` → `savingsOwner`(`self`·`spouse`·`both`·`none`·UNKNOWN), `regions` 답
  - 화면 `savingsOwner`, `regions` 추가(`districts` 다음), `districts`는 필수 아님·`regions`는 필수(지구 + 지역 ≥ 1, BR-U4-C16·C17)
  - `pruneHidden`: 배우자 없으면 `spouse`·`both` 지움(BR-U4-C6)
  - 그룹 이름 "관심 지역", `updateSteps(pending, before, answers)` (BR-U4-C31·C32)
- [x] **Step 2 — 변환** `convert.ts`
  - `toProfile`·`fromProfile`: 통장 명의 표(domain-entities §7.2), `prefs.regions`
  - `mergeUpdate(current, edited, pending)` — 통장 그룹·`regions`만 합침 (BR-U4-C34)
  - `hasBlankFields`에 맞춤
- [x] **Step 3 — 다른 지역 고르기** `regions.ts`
  - `toggleRegion`(전체·하나씩·모두 고르면 전체로, BR-U4-C13·C14), `defaultRegions(residence)`(BR-U4-C11), `regionsSummary`(BR-U4-C15)
- [x] **Step 4 — 기기 저장** `storage.ts`
  - 초안 버전 2 + 버전 1 옮기기(domain-entities §7.3)
  - 저장된 프로필 원래 버전 읽기, `clearAllPersonal`에 `mz.updates`
- [x] **Step 5 — 업데이트 기록** `model/updates.ts` (새)
  - `WHATS_NEW`(안내 번호 1, 3줄), `initialUpdates`, `pendingFromV1`(BR-U4-C21), `resolve`, `shouldShowDialog`, 읽기·쓰기
  - `ProfileProvider`에 `updates`·`markNoticeSeen`·`resolveItems` 연결, 설정 고치기·처음부터 다시 저장 때 항목 빼기(BR-U4-C36)
- [x] **Step 6 — 요약 문구** `summary.ts`: 통장 명의, "관심 지역" 요약 (BR-U4-C18)
- [x] **Step 7 — 화면: 마법사**
  - `StepScreen`: 통장 명의 보기(배우자 유무별), "두 분 다" 안내·배우자 설명(BR-U4-C4·C5), 통장 화면 제목에 누구 통장(BR-U4-C3), 거주 기간 문구·도움말(BR-U4-C1)
  - `DistrictCards` 안내 문구(BR-U4-C10), `RegionMultiPicker`(새, `controls.tsx`)
  - 처음 실행 안내 문구(BR-U4-01 고침)
- [x] **Step 8 — 화면: 짧은 입력 화면** `src/app/profile/update/page.tsx` + `ProfileWizard mode="update"`
  - 진행 "새 항목 1/2", [나중에 할게요], 마지막 [저장] → 합치기 → 저장 → `pending` 비움 → 홈 (BR-U4-C30~C35)
- [x] **Step 9 — 화면: 창·띠** `src/features/profile/ui/WhatsNewDialog.tsx`·`UpdateBanner.tsx`, 피드(`FeedView`)에 연결
  - 창 한 번·열 때 기록, 뒤로 버튼으로 닫기(`BackNavigation` 닫기 대상), `pending` 비면 [확인] 하나 (BR-U4-C22~C27)
- [x] **Step 10 — 테스트**
  - 예시: 통장 명의 ↔ 프로필, 초안 v1 옮기기, 처음 기록 3경우(없음·v1·v2)·부모님 휴대폰 2경우, `updateSteps`, `toggleRegion`, 요약
  - PBT `profile-model.pbt.test.ts`: P-U4-C1~C7, 답 생성기에 `savingsOwner`·`regions`
  - 기존 테스트의 `savingsHas`·관심 지구 기대값 맞춤
  - E2E `e2e/profile.spec.ts`(+ 필요하면 `e2e/update.spec.ts`): v1 프로필 기기 → 창 → 짧은 입력 → 저장 → 띠 없음 / [나중에] → 띠 남음 / 처음 설치는 창 없음 / 다른 지역 고르기 / 쉬운 모드 가로 스크롤·axe
- [x] **Step 11 — 검증과 문서**
  - typecheck·lint·단위(seed 바꿔 3회)·pgTAP·로컬 E2E(로컬 Supabase 값으로)
  - `aidlc-docs/construction/U4-profile-settings/code/code-summary-change-2.md`, 로컬 커밋 (push는 확인 후)

## 배포 메모 (Build and Test에서 확정)

- DB·Edge Function 바꿈 없음. Vercel 배포(push)만으로 반영
- U3의 0009·0010과 collect·analyze 배포가 먼저 되어야 다른 지역 공고가 실제로 들어온다(화면은 그 전에도 동작 — 다른 지역을 골라도 공고가 아직 없을 뿐)
