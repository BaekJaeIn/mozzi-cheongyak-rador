# U2 eligibility-engine — 변경 요청 4 코드 생성 계획

> 근거: U2 기능 설계 변경 4 (domain-entities "변경 요청 4", business-rules §12 BR-U2-E1~E30, business-logic-model §8, 2026-10-25 승인)
> 원칙: 바뀌는 결과는 BR-U2-E30 두 곳(대상 막힘·시·도까지만 지역)과 신혼 가구의 고령자 확인 주택형뿐 — 변경 전 엔진을 테스트용으로 고정해 비교한다. 이 Unit만 배포해도 앱이 깨지지 않게(`audiences`가 없으면 빈 배열). 지역·대상 값 채우기는 U3.

## 단계

- [x] **Step 1 — 변경 전 엔진 고정** `eligibility/__tests__/legacy/change3/` — 지금 커밋의 engine·routes·area·supply-types를 복사(테스트 전용, P-C4-5 비교 기준)
- [x] **Step 2 — 관심 지역** `eligibility/area.ts`
  - `regionMatches`: 공고 시·도까지만이면 관심 시·도 전체일 때만 (BR-U2-E1). `orderRegions`는 같은 함수 사용(E4)
  - 기존 테스트(change2·place PBT)의 "경기도 일원 + 성남시만 → 노출" 기대를 "숨김"으로 바꿈
- [x] **Step 3 — 신청 대상 타입·표·사유**
  - `domain/audiences.ts`(새): `NoticeAudience`, `NOTICE_AUDIENCES`(표 순서), `AUDIENCE_ALLOWED`, `audienceBlocked`, `parseAudiences`(형식 틀린 값 버림, 중복 제거)
  - `eligibility/types.ts`: `NoticeForJudgement.audiences`, `CriterionKey`에 `audience`
  - `eligibility/messages.ts`: `AUDIENCE_MSG` (domain-entities 표)
- [x] **Step 4 — 공급유형** `domain/supply-types.ts`, `eligibility/routes.ts`
  - `happy_unknown`·`national_rental_unknown` 코드·라벨, 분류: 국민임대·행복주택 + 고령자/어르신 → `*_senior`, 아니면 `*_unknown` (E20)
  - `routesFor`: 신혼 — `*_unknown` → rental_newlywed, `*_senior` → [] (E22). 노부부 — own_type 그대로
- [x] **Step 5 — 엔진** `eligibility/engine.ts`
  - `judgeNotice`: 대상 막힘이면 모든 주택형 미충족 + `audience` 조건(첫 막힌 대상), 신혼은 `routes: []` (E10~E12)
- [x] **Step 6 — DB·읽기** `supabase/migrations/0015_audiences.sql`
  - `notices.audiences text[] not null default '{}'` (+ 값 검사 제약), `supply_type_standards`에 두 줄(고령자 줄 요건 복사)
  - 공고 판정 입력 읽기에 `audiences`: `_lib/db/repositories.ts`(Deno), `src/server/db/notice-repository.ts`(Node), 메모리 저장소·fixtures
  - `upsert_notice_bundle`은 U3에서(이번엔 칸만)
  - pgTAP: 칸·기본값·제약·새 시드
- [x] **Step 7 — 화면 호환 (최소)** — `CriterionKey` 키 표
  - `feed/visible.ts` `CRITERION_KEYS`에 `audience`(저장된 판정 읽기)
  - `src/features/notice/model/display.ts` 조건 이름 "신청 대상", `judgement.ts` 설정 그룹 없음(null)
- [x] **Step 8 — 테스트**
  - 예시: 9건 시나리오(business-logic-model §8.1, 지역·대상 채운 상태), 경기 전체 + 시·도까지만 → 보임, 부천시만 → 숨김, 행복주택 청년·신혼·고령자 → 두 가구 보임, 은빛주택 → 부모님 보임·신혼 숨김, 분류 표
  - PBT `eligibility/__tests__/change4.pbt.test.ts`: P-C4-1~6 (공고 생성기에 `audiences` 추가)
  - 기존 테스트 기대값 정리(행복주택·국민임대 제목 분류 → `*_unknown`)
- [x] **Step 9 — 검증과 문서**
  - typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E(피드 회귀)
  - `aidlc-docs/construction/U2-eligibility-engine/code/code-summary-change-4.md`, 로컬 커밋 (운영 반영은 Build and Test)
