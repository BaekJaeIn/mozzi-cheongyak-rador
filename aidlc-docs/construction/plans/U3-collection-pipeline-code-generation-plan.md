# U3 collection-pipeline — 코드 생성 계획

> **이 계획이 U3 Code Generation의 유일한 기준이다.** 단계 순서대로 실행하고, 끝난 단계는 바로 [x]로 표시한다.

---

## 1. Unit 맥락

| 항목 | 내용 |
|---|---|
| 담당 | US-10·12·13·15의 데이터 (주 스토리 없음) |
| 의존 | U1(스키마·RPC·Repository 인터페이스·공용 코드), U2(분류·매칭·요건 확정·판정 재계산·기준 데이터) |
| 제공 | 매일 수집 `collect`, 매시간 분석 `analyze`, Deno Repository 구현(U6 `dispatch`가 재사용) |
| 설계 | functional-design(BR-U3-01~82 + 변경 메모), nfr-requirements(NFR-U3-01~26), nfr-design(P-U3-*, L-U3-1~11), infrastructure-design(cron·CRON_SECRET·CPU 대응) |

## 2. cheongYak-radar에서 가져오는 것 (tech-stack-decisions 표)

| 원본 | 가져와서 | 바꿀 점 |
|---|---|---|
| `collectors/apply-home.ts` | `collect/collectors/applyhome.ts` + `_shared/collect/parsers/applyhome.ts` | 지역 필터 경기·인천, 파싱을 순수 함수로 분리, RawNotice 형식 |
| `collectors/lh.ts` | `collect/collectors/lh.ts` + `_shared/collect/parsers/lh.ts` | 지역 필터 경기·인천, 상세에서 **첨부파일(공고문 PDF) 추출 추가**, 시간 상한·동시 4건 |
| `collectors/parsers.ts`(GH·날짜 부분), `collectors/gh.ts` | `_shared/collect/parsers/gh.ts`, `collect/collectors/gh.ts` | 상세 페이지 첨부 링크 추출 추가 |
| `analyze.ts`(Gemini 호출부) | `_lib/gemini.ts` | 스키마를 U2 `Requirements`·요약으로, 사고 예산·출력 상한 유지 |
| `mock.ts` | 참고만 | 3기 신도시 공고로 새로 작성 |

**참고**: cheongYak-radar는 공고문 PDF를 다루지 않았고, 실제 응답 샘플 파일도 없다 → Step 12에서 실제 응답을 캡처해 파서·첨부 추출을 확정한다.

## 3. 실행 단계

### Part A. 순수 코드 (`supabase/functions/_shared/collect/`, Node·Deno 공용)

- [x] **Step 1. 수집 도메인**
  - [x] 1.1 `types.ts`: `RawNotice`, `NormalizedNotice`, `NoticeGroup`, `NoticeBundle`, `NoticeExtraction`, `CollectRunRecord`
  - [x] 1.2 `dates.ts`: 원천 날짜 → IsoDate (BR-U3-10)
  - [x] 1.3 `normalize.ts`: RawNotice → NormalizedNotice (BR-U3-11~15·20·21), 지구 후보 판별(BR-U3-22)
  - [x] 1.4 `scope.ts`(BR-U3-40), `block-key.ts`(BR-U3-30), `grouping.ts`(BR-U3-31~34), `content-hash.ts`(BR-U3-50)
  - [x] 1.5 `extraction.ts`: Gemini 응답 검증, 주택형 만들기(BR-U3-63~66), `prompt.ts`: 지시문·응답 스키마(BR-U3-62·63, P-U3-S3)
  - [x] 1.6 `bundle.ts`: 묶음(+추출) → `upsert_notice_bundle` 입력, 바뀐 공고는 표준 요건(P-U3-R4)
  - [x] 1.7 `pdf-locator.ts`: 첨부 목록에서 공고문 PDF 고르기 (BR-U3-60)
- [x] **Step 2. 파서** (`_shared/collect/parsers/`): `applyhome.ts`, `lh.ts`(목록·상세 일정·첨부), `gh.ts`(카드·대기열·상세 첨부)
- [x] **Step 3. 오케스트레이터** (의존성 주입형 순수 TS, NFR-U3-24)
  - [x] 3.1 `collect-orchestrator.ts`: 소스 격리·시간 예산·상태 조회·변경분 저장·재계산·기록 (기능 설계 §2 + 변경 메모)
  - [x] 3.2 `analyze-orchestrator.ts`: 예약 → PDF → 추출 → 저장/해제 → 재계산 → 기록
  - [x] 3.3 `ports.ts`: Collector·HttpClient·GeminiClient·CollectRepository 인터페이스

### Part B. 테스트

- [x] **Step 4. 생성기·픽스처**: `arbitraries/collect.ts`(원천·정규화 공고, 날짜 문자열 변형, 블록 표기 변형), 가짜 의존성(가짜 Collector·Gemini·메모리 CollectRepository)
- [x] **Step 5. 예시 테스트**: 날짜 형식, 정규화, 블록 키 예시, 묶기 예시(기능 설계 §3), 범위, 해시, 추출 검증(잘린 JSON·스키마 밖 값·isNotice=false), 번들, PDF 고르기, 파서(Step 12 픽스처), 오케스트레이터(소스 실패 격리, 0건 경고, 지구 후보 경고, 두 번째 실행 무변화, AI 3회 실패, 바뀐 공고 되돌림, 시간 예산)
- [x] **Step 6. PBT** (기능 설계 §6의 14개): 날짜 왕복·전체성, 블록 키 변형 불변·왕복, 묶기 교환·분할·단독·멱등, 범위 단조, 해시 불변, 추출 검증 전체성, 번들 불변식, 오케스트레이터 멱등. **상태 기반**: `analyze` 반복(공고 추가·변경·처리 성공/실패·예약 만료) — 모델과 비교 (PBT-06)
- [x] **Step 7. 요약** → `aidlc-docs/construction/U3-collection-pipeline/code/business-logic-summary.md`

### Part C. Deno 실행 코드 (`supabase/functions/`)

- [x] **Step 8. `_lib/`**: `http.ts`(시간 제한·1회 재시도·User-Agent·URL 가리기·PDF 크기 상한), `gemini.ts`(PDF 인라인·구조화 출력·finishReason 확인, base64는 `jsr:@std/encoding`), `guard.ts`(CRON_SECRET 비교·시간 예산), `env.ts`
- [x] **Step 9. `_lib/db/`**: Supabase 클라이언트(`npm:@supabase/supabase-js@2.117.3`), U1·U2 Repository Deno 구현(Profile·Notice·Reference·Judgement — Node 구현과 같은 쿼리), `collect-repository.ts`(상태 조회·번들 저장·예약·해제·기록·지구·표준 요건)
- [x] **Step 10. 함수**: `collect/collectors/{applyhome,lh,gh,mock}.ts`, `collect/index.ts`, `analyze/index.ts`, `supabase/config.toml`에 두 함수 `verify_jwt = false`, `tsconfig.json`·`eslint.config.mjs` 제외 목록에 `analyze` 추가

### Part D. 데이터베이스

- [x] **Step 11. 마이그레이션 `0007_collect_pipeline.sql`**: `notices` 컬럼 3개·대기 인덱스, `upsert_notice_bundle` 보완(요약·상태·시도·PDF 주소, 예약 해제, 바뀐 공고 처리), `collect_state`, `claim_notices_for_analysis`, `release_notice_claim`, cron `collect-daily`·`analyze-hourly`(Vault, 150초), 권한 / pgTAP `supabase/tests/collect.test.sql`(묶음 저장·요약 유지, 예약 겹침 없음·10분 만료·마감 공고 제외, 해제·시도 증가, 상태 조회)

### Part E. 실제 응답 확인

- [ ] **Step 12. 실제 응답 캡처** (**사용자 확인 후 실행**)
  - [ ] 12.1 캡처 스크립트 `scripts/capture-fixtures.mjs`: `.env.local`의 data.go.kr 키로 청약홈 1페이지·LH 목록 1페이지·LH 상세 2건, GH 메인 HTML·상세 1건을 받아 **키·개인정보 없이** `_shared/__tests__/fixtures/collect/`에 저장
  - [ ] 12.2 픽스처로 파서·첨부 추출을 확정하고 파서 테스트 고정. 공고문 PDF를 소스별로 찾을 수 있는지 기록 (RK-U3-2)
  - [ ] 12.3 지구 매칭을 실제 공고 제목으로 확인 → 필요하면 `reference-data.ts`·새 마이그레이션으로 동 키워드 보완 (OI-U2-1)

### Part F. 측정·문서·검증

- [x] **Step 13. CPU 측정** (RK-U3-4): base64 10MB·20MB, 전체 판정 재계산 2,000건 — Node에서 측정해 기록, 한도 근접 시 상한 조정
- [x] **Step 14. 문서**: README(함수 로컬 실행·수동 실행), `code/setup-guide-u3.md`(첫 배포 7단계: 시크릿·Vault·db push·functions deploy·수동 실행 확인), `code/code-summary.md`
- [ ] **Step 15. 검증**: typecheck·lint·test·build, 커밋 (push는 사용자 확인 후 → CI에서 `deno check`·pgTAP)

### Part G. 골든 세트 (배포 후, 사용자 참여)

- [ ] **Step 16. 골든 세트** (BR-U3-80~82, NFR-U2-07): 운영 `collect`·`analyze`가 돈 뒤 실제 공고 5~10건 선택 → AI가 기대 판정 초안 → **사용자가 공고문과 대조 확인** → `_shared/__tests__/golden/` + 예시 테스트. *배포·사용자 확인이 필요하므로 U3 승인 후 별도 진행할 수 있음*

---

## 4. 스토리·요구사항 대응

| 대상 | 단계 |
|---|---|
| FR-1 수집 (FR-1.1 축소 반영) | 2, 3.1, 10 |
| FR-2 지구 매칭 (+ OI-U2-1) | 1.3, 12.3 |
| FR-3 분류, FR-5 판정 반영 | 1.3, 1.5, 3.1, 3.2 |
| FR-6 AI 요약 | 1.5, 3.2, 8 |
| US-13 상세 데이터(일정·세대수), US-15 요약 | 1.3, 1.5, 1.6 |

## 5. PBT 대응

기능 설계 §6 14개 속성 → Step 6. PBT-02(날짜·블록 키 왕복), PBT-03(분할·범위·해시·검증·번들), PBT-04(묶기·오케스트레이터 멱등), PBT-06(analyze 상태 기반), PBT-07(Step 4 생성기), PBT-10(Step 5 예시·Step 12 실제 픽스처·Step 16 골든 세트).
