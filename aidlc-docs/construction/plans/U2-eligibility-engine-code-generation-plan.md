# U2 eligibility-engine — 코드 생성 계획

> **이 계획이 U2 Code Generation의 유일한 기준이다.** 단계 순서대로 실행하고, 끝난 단계는 바로 [x]로 표시한다.
> 워크스페이스 루트: `d:\백재인\스터디\silverCheongYak-radar`. 애플리케이션 코드는 루트, 문서는 `aidlc-docs/`.

---

## 1. Unit 맥락

| 항목 | 내용 |
|---|---|
| 담당 | 판정 규칙 제공 (주 스토리 없음). 기여: US-04·06·07·08·10·12·14·18 |
| 의존 | U1 (K1 스키마, K2 Repository 인터페이스, `_shared` 공용 코드, ServerEnv) |
| 제공 계약 | K4 도메인 타입, K5 노출 조건, K6 재계산 API(`recomputeForDevice`, `recomputeAll`) |
| 설계 문서 | functional-design (BR-U2-01~84), nfr-requirements (NFR-U2-01~24), nfr-design (P-U2-*, L-U2-1~10) |
| 범위 밖 | 화면·API 라우트(U4·U5), Deno Repository 구현(U3), 골든 세트(U3 마지막, NFR-U2-07) |

## 2. 재사용

cheongYak-radar `supabase/functions/collect/recommend/{matcher,scorer,weights}.ts`는 **구조만 참고**하고 코드는 새로 작성한다 (신혼부부 규칙이라 내용이 다름, unit-of-work.md).

## 3. 실행 단계

### Part A. 도메인 (`supabase/functions/_shared/domain/`)

- [x] **Step 1. 도메인 코드**
  - [x] 1.1 `profile.ts`: `HouseholdProfile` v1 타입, `PROFILE_SCHEMA_VERSION`, `ageAt`(만 나이, 2/29 규칙), `householdMembers`, `normalizeSido`, `AreaBand`·`areaBandOf`, `validateProfile`(범위·형식, BR-U2-72)
  - [x] 1.2 `requirements.ts`: `Requirements` 타입, `validateRequirements`(AI 추출 JSON 형식 검증)
  - [x] 1.3 `supply-types.ts`: 코드·라벨 표, `classifySupplyType` (BR-U2-10~19)
  - [x] 1.4 `district-matcher.ts`: `matchDistricts` (BR-U2-01~06)
  - [x] 1.5 `requirement-resolver.ts`: `resolveRequirements` (BR-U2-20~28)

### Part B. 판정 엔진 (`supabase/functions/_shared/eligibility/`)

- [x] **Step 2. 엔진 코드**
  - [x] 2.1 `types.ts`: `Verdict`, `CriterionResult`(+`userValue`, `code`), `UnitJudgement`, `NoticeJudgement`, `NoticeForJudgement` (`EligibilityReference`는 engine.ts)
  - [x] 2.2 `messages.ts`: 사유·행동 문구 템플릿 (금액 인자 없음, P-U2-S3), 금액 표기 도우미(기준 값 전용)
  - [x] 2.3 `income-table.ts`: 기준표 조회·비율 계산(반올림), 민영 예치금 표 (BR-U2-43·46)
  - [x] 2.4 `criteria/`: `age.ts`, `homeless.ts`, `income.ts`, `savings.ts`, `asset.ts`(자산·자동차), `residence.ts`, `household.ts`, `welfare.ts`
  - [x] 2.5 `engine.ts`: `judgeUnit`, `judgeNotice`, `combineUnit`, `combineNotice`, 기준일 결정 (BR-U2-30~59)
  - [x] 2.6 `visibility.ts`: `isVisible` (K5)
  - [x] 2.7 `scoring.ts`: `score`, `compareFeedItems` (BR-U2-60~65)

### Part C. 보안 (`supabase/functions/_shared/security/`)

- [x] **Step 3. 암호화·코덱**
  - [x] 3.1 `amount-cipher.ts`: `createKeyring`(버전별 non-extractable 키), `encryptAmount`, `decryptAmount`, 형식 검증 (BR-U2-70~72)
  - [x] 3.2 `profile-codec.ts`: `encodeProfile`, `decodeProfile` (BR-U2-73)

### Part D. 재계산 서비스 (`supabase/functions/_shared/services/`)

- [x] **Step 4. JudgementService**
  - [x] 4.1 `judgement-service.ts`: `recomputeForDevice`, `recomputeAll` (주입: Repository들, keyring, asOf, logger), 결과 요약 (BR-U2-80~84, P-U2-R1~R4)
  - [x] 4.2 `_shared/db/repositories.ts` 인터페이스 갱신 (logical-components §2)

### Part E. 테스트

- [x] **Step 5. 공용 생성기** (`_shared/__tests__/arbitraries/`)
  - [x] 5.1 `householdProfileArb`(부분적으로 null 포함), `fullProfileArb`, `requirementsArb`, `noticeWithUnitsArb`, `referenceArb`
- [x] **Step 6. 예시 기반 테스트** (`*.test.ts`)
  - [x] 6.1 도메인: 만 나이(생일 전후·2/29), 분류 표 전체, 지구 매칭(대장동 성남 오매칭 방지, 여러 지구), 요건 확정 표 BR-U2-20~28 각 경우
  - [x] 6.2 판정 핵심 시나리오 9개 (business-logic-model §4·§5): 행복주택 예시, 64/65세 경계, 2인 소득 경계 6,452,897원, 세대주=다른 가족, 수급자 + 소득 초과, 공공분양 60㎡ 초과 소득 미적용, 민영 예치금 구간, 기준표 없는 연도, 분류 실패
  - [x] 6.3 암호화(형식·모르는 버전·위조 거부), 코덱(스키마 버전 오류), 점수·정렬 예시
  - [x] 6.4 재계산 서비스: 프로필 없음, 복호화 실패 격리, stale 건너뜀, 요약 수
- [x] **Step 7. 속성 기반 테스트** (`*.pbt.test.ts`, business-logic-model §5의 24개)
  - [x] 7.1 나이 3개, 정보 부족 불변식(BR-U2-33), 정보 감소 단조성, 금액·나이 단조성
  - [x] 7.2 **가구 대칭성** (본인·배우자·세대주 맞바꿈)
  - [x] 7.3 합성 교환법칙·오라클, 노출 오라클
  - [x] 7.4 지구 매칭 불변식 2개, 분류 전체성, 요건 확정 멱등·키 보존
  - [x] 7.5 면적 구간 분할·단조, 점수 범위, 정렬 전순서(입력 순서 무관)
  - [x] 7.6 암호화 왕복·암호문 다름, 코덱 왕복
  - [x] 7.7 **사유에 내 금액 없음** (NFR-U2-11)
  - [x] 7.8 재계산 멱등, 기기 실패 격리, **상태 기반 테스트**(fc.commands: 프로필 저장·공고 추가/삭제·재계산·오래된 재계산, 모델 = 전체 다시 계산 + 버전 규칙) (PBT-06)
- [x] **Step 8. 비즈니스 로직 요약** → `aidlc-docs/construction/U2-eligibility-engine/code/business-logic-summary.md`

### Part F. Repository (Node)

- [x] **Step 9. Node 구현** (`src/server/db/`)
  - [x] 9.1 `profile-repository.ts`: `get`, `listDeviceIdsWithProfile`, `save`(RPC, U4용 준비)
  - [x] 9.2 `notice-repository.ts`: `listRetainedWithUnits`(임베딩 조회), `getById`
  - [x] 9.3 `reference-repository.ts`: `loadEligibilityReference` 추가
  - [x] 9.4 `judgement-repository.ts`: `replaceForDevice(deviceId, version, rows)` → `saved` / `stale`
  - [x] 9.5 `src/server/security/keyring.ts`: ServerEnv → Keyring 어댑터 (인스턴스당 1회)
  - [x] 9.6 `src/server/deps.ts`: `judgementService()` 조립 (U4가 사용)
- [x] **Step 10. Repository 테스트**: fake-db로 조회 형태·행 변환·RPC 결과(-1 → stale)
- [x] **Step 11. Repository 요약** → `.../code/repository-summary.md`

### Part G. 데이터베이스

- [x] **Step 12. 마이그레이션** `supabase/migrations/0006_eligibility_reference.sql`
  - [x] 12.1 `districts.area_keywords` 추가 + 6개 지구 시드
  - [x] 12.2 `income_asset_thresholds` 컬럼·체크 변경 + 2026 시드 (출처 주석)
  - [x] 12.3 `supply_type_standards` 9건 시드 (출처 주석)
  - [x] 12.4 `replace_judgements_for_device(uuid, integer, jsonb)` 교체(행 잠금·버전 비교), 옛 시그니처·`replace_judgements_for_notices` 삭제, 권한
- [x] **Step 13. DB 테스트**
  - [x] 13.1 `supabase/tests/rpc.test.sql` 판정 저장 부분을 새 시그니처로 갱신 + 버전 경우 3개
  - [x] 13.2 `supabase/tests/reference.test.sql`: 지구 6개·키워드, 2026 기준표 15행, 공급유형 9개, 표준 요건 JSON이 엔진 형식 검증과 맞는지(키 존재)
  - [x] 13.3 실행은 GitHub Actions `db-and-e2e` — 통과 (run 38580354762, 2026-10-14)

### Part H. 문서·검증

- [x] **Step 14. 문서**
  - [x] 14.1 README: "연간 갱신"(기준표·표준 요건, NFR-U2-18), "암호화 키 교체"(절차 + 확인 SQL, NFR-U2-14)
  - [x] 14.2 `.../code/code-summary.md` (파일 목록, 결정, 검증 결과, PBT 준수)
- [x] **Step 15. 검증**
  - [x] 15.1 `npm run typecheck`, `npm run lint`
  - [x] 15.2 `npm test` (seed 출력, 성능 목표 NFR-U2-01~02를 Vitest 벤치 대신 테스트 안 시간 측정으로 확인)
  - [x] 15.3 `npm run build`
  - [x] 15.4 커밋 (push는 사용자 확인 후) → CI(`ci`, `db-and-e2e`)로 deno check·pgTAP 확인 — 커밋 완료, push·CI 대기

---

## 4. 스토리 · 규칙 대응

| 스토리 | 단계 |
|---|---|
| US-04·06·07 (입력 항목·면적 구간·지구) | 1.1, 1.4, 2.7 (마법사 화면은 U4) |
| US-08·18 (저장 후 판정 반영) | 4.1, 9.4, 9.6, 12.4 |
| US-10·12 (노출·정렬) | 2.5, 2.6, 2.7 |
| US-14 (판정 이유) | 2.2, 2.4 |

## 5. PBT 대응

PBT-01 속성 24개 → Step 7 (7.1~7.8). PBT-02 왕복(7.6), PBT-03 불변식(7.1~7.5·7.7), PBT-04 멱등(7.4·7.8), PBT-05 오라클(7.3), PBT-06 상태 기반(7.8), PBT-07 생성기(Step 5), PBT-08 seed(U1 설정 승계), PBT-10 예시 테스트(Step 6).
