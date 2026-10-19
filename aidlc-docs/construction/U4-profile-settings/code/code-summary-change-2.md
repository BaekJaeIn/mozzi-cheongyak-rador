# U4 profile-settings — 변경 요청 2 코드 요약

> 계획: `construction/plans/U4-profile-settings-change-2-code-generation-plan.md` · 설계: 기능 설계 변경 2 절 (domain-entities §7, business-rules §9, business-logic-model §8, frontend-components §7)

## 새 파일

| 파일 | 내용 |
|---|---|
| `src/features/profile/model/updates.ts` | 업데이트 안내 기록 `mz.updates`: `WHATS_NEW`(안내 1, 3줄), `initialUpdates`, `pendingFromV1`(BR-U4-C21), `resolveItems`, `markNoticeSeen`, `shouldShowDialog`, `parseUpdates` |
| `src/features/profile/ui/UpdateNotice.tsx` | 피드 위 띠 `UpdateBanner`, "새로 바뀐 점" 창 `WhatsNewDialog`(뒤로 버튼으로 닫힘), 둘을 고르는 `UpdateNotice` |
| `src/app/profile/update/page.tsx` | 짧은 입력 화면 경로 (`ProfileWizard mode="update"`) |
| `model/__tests__/change2.test.ts` | 예시 22개 (통장 명의, 관심 지역 두 화면, 초안 옮기기, 업데이트 기록, 짧은 입력 화면, 부모님 휴대폰 두 경우) |
| `model/__tests__/change2.pbt.test.ts` | P-U4-C1~C7 |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `model/types.ts` | `savingsHas` → `savingsOwner`(나·배우자·두 분 다·없음·모름), `regions` |
| `model/steps.ts` | 화면 `savingsOwner`·`regions`, 관심 지역 필수 = 지구 + 지역 ≥ 1(`regions` 화면에서 확인), 배우자가 없어지면 배우자·두 분 다 명의 지움, 화면 범위 `StepScope`(그룹 / 짧은 입력 `UpdateScope`), `updateSteps`, 그룹 이름 "관심 지역" |
| `model/convert.ts` | 명의 ↔ `savings.has`·`owner`, `prefs.regions`, `mergeUpdate`(통장 그룹·다른 지역만 합침) |
| `model/regions.ts` | `toggleRegion`(전체·하나씩·모두 고르면 전체·상한), `defaultRegions`·`applyRegionDefault`(사는 시군구 미리 고르기), `regionsSummary`, `pickedCount` |
| `model/storage.ts` | 초안 버전 2 + 버전 1 옮기기(`migrateDraft`), `storedProfileSchemaVersion`, `loadUpdates`·`saveUpdates`, 모두 지우기에 `mz.updates` |
| `model/summary.ts` | 통장 요약에 명의(부부일 때), 관심 지역 요약 `districtsSummary` |
| `ProfileProvider.tsx` | `updates` 상태, `markNoticeSeen()`, `saveProfile(profile, resolves)` — 저장 **전** 기록을 읽어 남김 |
| `ui/ProfileWizard.tsx` | `mode="update"`: 열 때 범위 고정, 진행 "새 항목 N/M", [나중에 할게요], 마지막 화면 [저장], 저장 뒤 "내 정보를 저장했어요" 화면. 설정 고치기·처음부터 다시 저장 때 새 항목 빼기. 다른 지역 화면에 들어올 때 미리 고르기 |
| `ui/StepScreen.tsx` | 거주 기간 질문·도움말(FR-C2-19), 통장 명의 질문(배우자 유무별 보기, 두 분 다 안내, 배우자 설명), 통장 화면 제목에 누구 통장, 3기 신도시 안내, 다른 지역 화면 |
| `ui/controls.tsx` | `RegionMultiPicker` (요약 → 시도 3개 → "○○ 전체" + 시군구 목록) |
| `ui/HomeGate.tsx` | 피드 위에 `UpdateNotice`, 처음 실행 안내 ① 문구 |
| `app-chrome/BackNavigation.tsx` | `useBackClose(open, onClose)`: 창이 떠 있으면 뒤로 버튼은 창만 닫음 |
| `app-chrome/back-target.ts` | `/profile/update` → 홈 |
| `e2e/helpers.ts` | 기본 예시 프로필 v2, 엄마 휴대폰 같은 `SAMPLE_PROFILE_V1`, `pressBack` |
| `e2e/profile.spec.ts` | 마법사 흐름에 명의·다른 지역 화면, 처음 설치는 창·띠 없음, 업데이트 안내 4개 시나리오 |
| `supabase/tests/collect-regions.test.sql` | 관심 기기 판정 앞에서 다른 기기 프로필을 트랜잭션 안에서만 지움(E2E가 남긴 "서울 전체" 기기가 섞여 2건 실패하던 것) |

## 설계에서 정하지 않았던 결정 (구현 중)

- **업데이트 기록은 "창을 띄울 때"와 "저장할 때"만 기기에 쓴다.** 읽을 때는 계산만 한다. 계산은 저장된 프로필의 원래 버전으로만 정해지므로 몇 번 해도 같다. 모두 지운 직후 기록이 다시 생기지 않아 처음 설치와 같다(BR-U4-94 테스트 그대로 통과)
- **저장 전에 기록을 먼저 읽는다.** 예전(v1) 사용자가 설정에서 다른 그룹(예: 소득)을 먼저 고쳐 저장하면 프로필이 v2가 되어 "아직 안 한 새 항목"을 다시 계산할 수 없기 때문
- 짧은 입력 화면 저장 뒤에는 "내 정보를 저장했어요" 화면에서 [맞춤 공고 보러 가기]로 피드로 간다 (저장 결과 안내 자리 — 처음부터 다시 입력과 같은 화면)
- PBT가 찾은 경우: 3기 신도시를 하나도 안 고른 사람이 짧은 입력 화면에서 다른 지역을 모두 빼면 저장할 수 없는 프로필이 된다 → 화면이 [저장]을 막는다(BR-U4-C16). 속성도 "막는다"를 확인하도록 맞춤

## U5로 넘기는 것

- 상세 화면 문구 "관심 지구 밖의 공고예요"(`NoticeDetailView`), 피드 정렬의 "관심 지구 먼저"(`handlers/feed.ts`), 카드·상세의 "서울 강서구" 표시

## 검증 (2026-10-19)

| 항목 | 결과 |
|---|---|
| typecheck·lint | 통과 |
| 단위 (FC_SEED 11·222·3333) | 713 / 713 / 713 |
| pgTAP | 150/150 |
| 로컬 E2E (로컬 Supabase) | 67 통과 + 3 건너뜀 |

## 운영 반영 (Build and Test에서 확정)

- DB·Edge Function 바꿈 없음 → push(Vercel 배포)만
- 다른 지역 공고가 실제로 들어오려면 U3 반영(0009·0010, collect·analyze 배포)이 먼저
