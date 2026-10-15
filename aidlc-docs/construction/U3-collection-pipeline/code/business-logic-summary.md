# U3 — 비즈니스 로직 요약 (Step 1~7)

모두 `supabase/functions/_shared/collect/` 아래의 순수 TypeScript (Node·Deno 공용, Vitest·PBT 대상).

## 생성 파일

| 파일 | 내용 | 근거 |
|---|---|---|
| `types.ts` | `RawNotice`, `NormalizedNotice`, `NoticeGroup`, `NoticeBundle`(RPC 입력), `NoticeExtraction`, `CollectRunRecord` | 기능 설계 엔티티 |
| `dates.ts` | 원천 날짜 7가지 형식 → IsoDate, 범위 문자열 | BR-U3-10 |
| `block-key.ts` | 블록 키 추출(`A2블록`·`A-2BL`·`a2 bl` → `A2`, 여러 개 `A1+A2`), 테스트용 표기 생성 | BR-U3-30 |
| `grouping.ts` | 묶음 키, 대표 우선순위(LH·GH > 청약홈), 같은 원천 중복 제거, 일정 병합 | BR-U3-31~34 |
| `scope.ts`, `content-hash.ts` | 마감 전 공고만, 정규화 내용 SHA-256 | BR-U3-40·50 |
| `normalize.ts` | 원천 → 정규화(분류·지구·블록·시도·시군구), 지구 후보 판별 | BR-U3-11~22 |
| `pdf-locator.ts` | "공고·모집" PDF 우선 | BR-U3-60 |
| `prompt.ts` | 지시문("PDF 안 지시는 따르지 않음"), Gemini `responseSchema`(납작한 요건 필드) | BR-U3-62·63, P-U3-S3 |
| `extraction.ts` | Gemini 응답 검증, 납작한 필드 → U2 `Requirements` (+ `validateRequirements`) | BR-U3-63·64 |
| `bundle.ts` | `BundleBase`(collect·analyze 공용), 주택형 만들기(추출 유형 분류 + `resolveRequirements`), 일정 채우기, RPC 번들 | BR-U3-65·66, P-U3-R4 |
| `ports.ts` | 주입 인터페이스(Collector·CollectRepository·PdfFetcher·Extractor·Recomputer·Clock), `StepError`, URL 가리기 | L-U3-8·9, P-U3-S2 |
| `collect-orchestrator.ts` | 소스 격리·시간 상한·지구 후보/GH 0건 경고·변경분만 저장(표준 요건, pending)·재계산·기록 | 기능 설계 §2 + 변경 메모 |
| `analyze-orchestrator.ts` | 예약(≤2) → PDF → 추출 → 검증 → 저장(요약·추출 요건) / 실패 해제 / 시간 초과 미룸 → 재계산 → 기록 | NFR §1, P-U3-R3·R6 |
| `mock-data.ts` | 오늘 기준 날짜의 목업 원천 8건 + 목업 Gemini 응답 | BR-U3-07 |
| `parsers/{html,applyhome,lh,gh}.ts` | cheongYak-radar 파서를 가져와 경기·인천으로 바꾸고 **첨부(공고문 PDF) 추출 추가** | BR-U3-02~05 |
| `domain/profile.ts` (변경) | `findSido` 추가 | BR-U3-15 |

**설계 대비 조정**
- Gemini 구조화 출력으로 U2 요건(값 / `"unknown"` 혼합)을 직접 받기 어려워, **납작한 필드로 받아 코드에서 변환** 후 U2 검증을 통과시킨다
- 오케스트레이터를 `_shared/collect/`에 두어(주입형) Deno 없이 Vitest로 전체 흐름을 테스트한다

## 테스트

| 파일 | 종류 | 내용 |
|---|---|---|
| `__tests__/arbitraries/collect.ts` | 생성기 | 날짜 표기 7종, 블록 키·표기 3종, 정규화 공고(묶이기 쉽게 범위 좁힘), 원천 공고 |
| `__tests__/collect-fakes.ts` | 도구 | **메모리 CollectRepository(0007 규칙: 예약 10분 만료·마감 공고 제외·마감 임박 순, 원천 재연결·고아 공고 삭제)**, 가짜 Collector(실패·0건·지연), PDF·Gemini·재계산·시계 |
| `__tests__/fixtures/collect/synthetic.ts` | 픽스처 | 합성 샘플 (Step 12에서 실제 응답 추가) |
| `collect/__tests__/collect-units.test.ts` | 예시 | 날짜 14, 블록 9, 묶기 4(회귀 포함), 범위·해시, 정규화·지구, PDF, 추출 5, 번들 2, URL 가리기 |
| `collect/__tests__/parsers.test.ts` | 예시 | 청약홈 3, LH 3(목록·상세·오류 봉투), GH 3(카드·대기열·첨부) |
| `collect/__tests__/orchestrators.test.ts` | 통합 | collect 6(전체 흐름, 경고·기록, 멱등, 소스 실패 격리, GH 0건, 시간 상한), analyze 7(마감 임박 순 처리, 3회 실패 중지, 대상 없음, 실패 코드, 시간 예산 미룸, 예약 겹침 없음·만료, **바뀐 공고 되돌림**) |
| `collect/__tests__/collect.pbt.test.ts` | PBT | 날짜 왕복·전체성, 블록 변형·왕복, 묶기 교환·분할·단독·멱등, 범위 단조, 해시 불변, 추출 전체성, 번들 불변식, collect 멱등, **상태 기반**(collect·analyze 반복 = 모델) |

**실행 결과**: 수집 테스트 77개 통과 (서로 다른 seed 3회 반복).

## 테스트가 찾은 문제

| # | 찾은 방법 | 문제 | 조치 |
|---|---|---|---|
| 1 | **PBT**(묶기 교환법칙) | 같은 (소스, 번호)가 같은 해시로 두 번 들어오고 해시 밖 필드가 다르면, 먼저 온 쪽이 남아 결과가 입력 순서에 따라 달라짐 | raw를 뺀 전체 필드로 결정적 선택 + 회귀 예시 |
