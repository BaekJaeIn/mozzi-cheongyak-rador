# U2 eligibility-engine — 변경 요청 2 코드 생성 계획

> 근거: U2 기능 설계 변경 2(domain-entities·business-rules §10·business-logic-model §6, 2026-10-17 승인)
> 원칙: 이 Unit만 배포해도 앱이 깨지지 않게 한다(프로필 버전을 올리면 기기·서버 양쪽이 버전 1도 읽어야 함). 화면 변경은 U4, 공고 지역 판별은 U3.

## 단계

- [x] **Step 1 — 공용 지역 데이터** `supabase/functions/_shared/domain/regions.ts`
  - `CAPITAL_SIDO`, `SIGUNGU_BY_SIDO`(지금 `src/features/profile/model/regions.ts`의 수도권 목록을 옮김), `isCapitalSido`, `isCapitalSigungu`
  - `normalizeSido`·`findSido`는 `profile.ts`에서 이 파일로 옮기고 `profile.ts`는 다시 내보냄(사용처 그대로)
  - `src/features/profile/model/regions.ts`는 수도권 목록을 이 파일에서 가져옴 (화면 목록과 판정 목록이 하나)
- [x] **Step 2 — 프로필 버전 2** `domain/profile.ts`
  - `PROFILE_SCHEMA_VERSION = 2`, `SavingsOwner`, `savings.owner`, `RegionPick`, `prefs.regions`
  - `validateProfile`: owner 검사(배우자 없는 가구의 spouse·both 거부, has≠true면 null), regions 검사(수도권·목록 안·중복 없음·시·도 전체와 그 시·도의 시군구 동시 금지), **관심 지역 개수 = 지구 + 시군구 ≥ 1** (지구 0개 허용)
- [x] **Step 3 — 옮기기** `domain/profile-migrate.ts`
  - `migrateProfile(input: unknown): unknown` — 버전 1 → 2 (BR-U2-C1~C5), 버전 2·모르는 값은 그대로(검사는 `validateProfile`이)
  - `parseProfile(input) = validateProfile(migrateProfile(input))` 를 함께 내보냄
- [x] **Step 4 — 서버 저장 형식** `security/profile-codec.ts`
  - `decodeProfile`: 저장 버전 1이면 옮긴 뒤 검사 (서버 DB에 남은 버전 1 프로필, BR-U2-C6)
  - `encodeProfile`: 버전 2 그대로 (owner·regions는 data JSON)
- [x] **Step 5 — 판정**
  - `eligibility/types.ts`: `NoticeForJudgement.regions: NoticeRegion[]`
  - `eligibility/area.ts`(새): `inInterestArea(notice, prefs)` (BR-U2-C10~C12, C14)
  - `eligibility/engine.ts`: `inDistrict` 계산을 `inInterestArea`로, 주석에 뜻 확장
  - `eligibility/criteria/savings.ts` + `messages.ts`: 배우자 명의 사유 (BR-U2-C8·C9)
- [x] **Step 6 — DB 마이그레이션** `supabase/migrations/0009_regions.sql`
  - `notices.regions jsonb not null default '[]'` + 배열 검사 제약 (값은 U3가 채움, 지금은 모두 빈 배열 → 기존 동작과 같음)
  - pgTAP `supabase/tests/regions.test.sql`: 칸·기본값·제약
- [x] **Step 7 — 공고 읽기** (판정 재계산이 공고 지역을 받도록)
  - Deno `_lib/db/repositories.ts`, Node `src/server/db/notice-repository.ts`: `regions` 선택·매핑, 잘못된 값은 빈 배열로
- [x] **Step 8 — 기기·API 호환 (최소)** — U4 화면이 바뀌기 전에도 동작하게
  - `src/features/profile/model/convert.ts`: 마법사 답 → 프로필 v2 (`owner`: 통장 있음이면 "self", `regions: []`)
  - `src/features/profile/model/storage.ts`: 기기에 저장된 버전 1 프로필을 읽을 때 `parseProfile`(옮기기 포함)
  - `src/server/handlers/profile-settings.ts`: 받은 프로필을 `parseProfile`로 (열려 있던 옛 화면이 버전 1을 보내도 받음)
- [x] **Step 9 — 테스트**
  - 예시: 옮기기 3경우, 엄마(배우자 명의)·아빠(본인 명의) 같은 판정, 배우자 명의 사유, 관심 지역 4장면(경기 전체·경기도 일원·강서구만+부천 대장·지구만), 검증 실패 경우들, codec 버전 1 복호화
  - PBT `eligibility/__tests__/change2.pbt.test.ts`: P-C2-1~7, 프로필 arbitrary를 버전 2로(owner·regions 생성기 추가)
  - 기존 테스트의 프로필 픽스처를 버전 2로 맞춤
- [x] **Step 10 — 검증과 문서**
  - typecheck·lint·deno check·단위(seed 바꿔 3회)·pgTAP·로컬 E2E
  - `aidlc-docs/construction/U2-eligibility-engine/code/code-summary-change-2.md`

## 배포 메모 (Build and Test에서 확정)

- 0009는 칸 추가만이라 먼저 적용해도 옛 코드가 깨지지 않는다
- 서버가 버전 1·2를 모두 읽으므로 Edge Function과 Vercel 배포 순서에 묶이지 않는다
