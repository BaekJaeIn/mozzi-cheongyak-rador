# U2 eligibility-engine — 변경 요청 2 코드 요약

> 계획: `construction/plans/U2-eligibility-engine-change-2-code-generation-plan.md` · 설계: functional-design 변경 2 절

## 새 파일

| 파일 | 내용 |
|---|---|
| `supabase/functions/_shared/domain/regions.ts` | 수도권 시도·시군구 목록(`CAPITAL_SIDO`, `CAPITAL_SIGUNGU`), `isCapitalSido`·`isCapitalSigungu`, 시도 이름 정규화(`normalizeSido`·`findSido`, profile.ts에서 옮김) |
| `supabase/functions/_shared/domain/profile-migrate.ts` | `migrateProfile`(v1→v2, BR-U2-C1~C5), `parseProfile`(옮긴 뒤 검사) |
| `supabase/functions/_shared/eligibility/area.ts` | `regionMatches`, `inInterestArea`(BR-U2-C10~C12), `parseNoticeRegions`(DB jsonb 읽기) |
| `supabase/migrations/0009_regions.sql` | `notices.regions jsonb not null default '[]'` + 배열 제약 + GIN 색인 |
| `supabase/tests/regions.test.sql` | pgTAP 5개 |
| `eligibility/__tests__/change2.test.ts` | 예시 18개 (옮기기·엄마/아빠 통장·관심 지역 4장면·검사·정리) |
| `eligibility/__tests__/change2.pbt.test.ts` | PBT P-C2-1~7 |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `domain/profile.ts` | 스키마 버전 2, `SavingsOwner`·`savings.owner`, `RegionPick`·`prefs.regions`, `isValidRegionPicks`·`normalizeRegionPicks`, 검사(명의 규칙·관심 지역 1곳 이상·지구 0개 허용) |
| `eligibility/types.ts` | `NoticeForJudgement.regions`, `NoticeRegion`, `inDistrict` 주석(뜻 = 관심 지역 안) |
| `eligibility/engine.ts` | `inDistrict = inInterestArea(notice, prefs)` |
| `eligibility/criteria/savings.ts`·`messages.ts` | 배우자 명의 사유 (BR-U2-C8) |
| `security/profile-codec.ts` | 버전 1 저장본도 `parseProfile`로 옮겨 읽음 |
| `_lib/db/repositories.ts`, `src/server/db/notice-repository.ts` | 공고 `regions` 읽기 |
| `src/features/profile/model/regions.ts` | 수도권 목록을 공용 모듈에서 가져옴 |
| `src/features/profile/model/convert.ts` | 프로필 v2 (`owner` "self", `regions` []) — 화면은 U4 변경 2 |
| `src/features/profile/model/storage.ts` | 기기 저장본 `parseProfile` (버전 1 옮겨 읽기) |
| `src/server/handlers/profile-settings.ts` | API 입력 `parseProfile` (옛 화면의 버전 1도 받음) |
| 테스트 픽스처·생성기 | 프로필 v2, 관심 시군구·공고 지역 생성기 |

## 호환

- 기기·서버·API가 모두 버전 1을 읽어 옮기므로 이 Unit만 배포해도 동작이 깨지지 않는다
- 0009는 칸 추가만 — 값이 모두 빈 배열이면 판정은 이전과 같다(P-C2-6)
- `inDistrict`·`in_district` 이름은 유지

## 검증

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (FC_SEED 11·222·3333) | 642/642 × 3 |
| pgTAP (0009 적용) | 125/125 (regions.test.sql 5개 추가) |
| 로컬 E2E | 59 통과 + 3 건너뜀 — E2E가 기기에 넣는 프로필이 **버전 1(통장 없음)** 이라 옮겨 읽기·서버 전송까지 실제로 확인됨 |
