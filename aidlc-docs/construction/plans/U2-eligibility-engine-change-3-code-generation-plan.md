# U2 eligibility-engine — 변경 요청 3 코드 생성 계획

> 근거: U2 기능 설계 변경 3 (domain-entities·business-rules §11 BR-U2-D1~D43·business-logic-model §7, 2026-10-20 승인)
> 원칙: **노부부 판정 불변**(BR-U2-D2) — senior 경로 코드는 건드리지 않고, 변경 전 엔진을 테스트용으로 고정해 비교한다. 이 Unit만 배포해도 앱이 깨지지 않게(기기·서버 모두 v1·v2·v3 읽기). 화면은 U4, 공고 추출은 U3.

## 단계

- [x] **Step 1 — 변경 전 엔진 고정** `eligibility/__tests__/legacy/` — 지금 커밋의 engine·criteria·scoring을 복사(테스트 전용, P-C3-1 비교 기준)
- [x] **Step 2 — 프로필 v3** `domain/profile.ts`, `domain/profile-migrate.ts`
  - `householdKind`, `NewlywedInfo`(혼인·날짜·자녀·집 가진 적·소득세 5년·배우자 통장), `money.spouseMonthlyIncome`
  - 검증(BR-U2-D3: 신혼은 배우자 필요, senior는 newlywed null), 옮기기 v1·v2 → v3 (멱등)
- [x] **Step 3 — 요건·공급유형**
  - `domain/requirements.ts`: `marriage`, `firstTime`, `income.overLottery` + 검증
  - `domain/supply-types.ts`: `newlywed_hope_town` 코드·라벨·분류 규칙(공공분양보다 먼저, BR-U2-D14)
- [x] **Step 4 — 신청 방법·표준 요건** `eligibility/routes.ts`(새), `reference-data.ts`
  - `ApplyRoute`, `routesFor(kind, supplyType)`, 공공/민영 구분, `STANDARD_ROUTE_REQUIREMENTS`(확인된 값만, 나머지 unknown — BR-U2-D41)
- [x] **Step 5 — 조건 평가**
  - `criteria/marriage.ts`(BR-U2-D20~22), `criteria/first-time.ts`(D35·36)
  - `criteria/income.ts`: 신혼 합계·맞벌이·추첨·우선공급 안내(D23~26) — senior 경로 결과는 그대로
  - `criteria/savings.ts`: 본인·배우자 통장 중 최선 + `savingsBy`(D30·31)
  - `messages.ts`: 새 사유·행동 문구, "일반적인 기준이에요" 꼬리(D40)
- [x] **Step 6 — 엔진** `eligibility/engine.ts`, `types.ts`
  - `RouteJudgement`, `UnitJudgement.routes`(신혼만), 주택형 = 최선 방법(D11·D12), senior는 지금 함수 그대로
  - `UnitForJudgement.routeRequirements`(U3가 채움, 지금은 없음 → 표준)
  - `scoring.ts`: 자녀 보너스(D42, 신혼만)
- [x] **Step 7 — 서버 저장·DB** `supabase/migrations/0012_household_kind.sql`
  - `supply_type_standards`에 `newlywed_hope_town` 시드, `device_profiles.enc_spouse_monthly_income` 칸, `save_device_profile`이 새 칸 저장
  - `security/profile-codec.ts`: 배우자 소득 암호화·복호화, v3 저장
  - 판정 저장(`judgements.detail`)은 jsonb라 `routes`가 그대로 들어감 — 형식 검증(`parseJudgementDetail`)에 routes 읽기 추가(없으면 무시)
  - pgTAP: 새 시드·칸·RPC
- [x] **Step 8 — 기기·API 호환 (최소)** — U4 화면이 바뀌기 전에도 동작
  - `convert.ts`: 마법사 답 → v3 (`householdKind: "senior"`, `newlywed: null`), `storage.ts`·핸들러는 `parseProfile`(v3 옮기기 포함)
  - 업데이트 안내: v2 → v3 옮기기로는 새 항목이 없으므로 안내 기록에 영향 없음(U4 `pendingFromV1`은 v1만) — 테스트로 확인
- [x] **Step 9 — 테스트**
  - 예시: 옮기기, 신혼 정의 4경우, 맞벌이·추첨·우선 안내, 배우자 통장, 생애최초, 신청 방법 표, P3 예시(business-logic-model §7.1), 신혼희망타운 분류
  - PBT `eligibility/__tests__/change3.pbt.test.ts`: P-C3-1~6 (프로필 생성기에 newlywed 추가)
  - 기존 테스트 기대값을 v3에 맞춤(senior 결과는 그대로여야 함)
- [x] **Step 10 — 검증과 문서**
  - typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E(부모님 흐름 회귀)
  - `aidlc-docs/construction/U2-eligibility-engine/code/code-summary-change-3.md`, 로컬 커밋

## 배포 메모 (Build and Test에서)

- 0012는 칸·시드 추가만. 서버가 v1~v3를 모두 읽으므로 함수·앱 배포 순서에 묶이지 않지만, `newlywed_hope_town` 분류를 쓰는 collect는 0012 뒤에 배포(외래 키)
