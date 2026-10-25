# U3 collection-pipeline — 도메인 엔티티

> 근거: U3 기능 설계 답변 (Q1=A 청약홈+LH+GH, Q2=A 공고문 PDF 추출, Q3=A 지구+블록+모집공고일로 묶기, Q4=A 마감 전 공고만, Q5=A 바뀐 공고만 재처리)
> 저장 형태는 U1 엔티티(E2 SourceNotice, E3 Notice, E4 NoticeDistrict, E5 HousingUnit)와 U2 타입(`Requirements`, `SupplyTypeCode`)을 그대로 쓴다.

---

## 1. 소스 (Q1=A)

| 코드 (U1 enum) | 소스 | 방식 | 비고 |
|---|---|---|---|
| `applyhome` | 청약홈 분양정보 (data.go.kr 15098547) | odcloud API `ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail` | 공공분양·민영. 최신순 페이지 스캔 |
| `lh_rental` | LH 분양임대 공고 (data.go.kr **15058530** 목록 + **15057999** 상세) | 공공데이터 API | 이름은 U1 enum 그대로지만 LH 분양 공고도 포함. 목록에 접수 시작일·첨부가 없어 상세 조회 |
| `gh` | GH 경기주택도시공사 청약센터 | 메인 화면 HTML 크롤링 | 대기열(NetFunnel) 걸리면 그날 건너뜀 |

`sh`, `myhome_complex`는 1차에서 수집하지 않는다(코드값은 남겨 둠). 요구사항 FR-1.1과 SPEC §3 대비 범위 축소 — requirements.md에 변경 기록.

## 2. 원천 공고 `RawNotice` (소스별 수집 결과)

```ts
interface RawNotice {
  source: "applyhome" | "lh_rental" | "gh";
  sourceNoticeNo: string;          // 소스 고유 번호 (빈 값이면 버림)
  title: string;
  location: string | null;         // 공급 위치·주소
  sigungu: string | null;          // 소스가 시군구를 따로 주면
  provider: string;                // "LH" | "GH" | 사업 주체명(민영)
  supplyTypeText: string | null;   // 원천 공급유형 문자열 (예: "국민임대", "공공분양 국민")
  tenureHint: "sale" | "rent" | null;
  dates: { announcedAt, applyStart, applyEnd, resultAt, contractStart, contractEnd: string | null }; // 원문 형식 그대로
  originalUrl: string;
  attachments: { name: string; url: string }[];  // 공고문 PDF 후보 (소스가 주면)
  raw: unknown;                    // 디버깅용 원문 일부
}
```

## 3. 정규화 공고 `NormalizedNotice`

```ts
interface NormalizedNotice {
  source; sourceNoticeNo; title; location; sigungu; provider; originalUrl; attachments; raw;
  supplyType: SupplyTypeCode;      // U2 classifySupplyType(title + supplyTypeText, source)
  tenure: "sale" | "rent";         // tenureHint ?? SUPPLY_TYPES[supplyType].tenure
  schedule: { announcedAt, applyStart, applyEnd, resultAt, contractStart, contractEnd: IsoDate | null };
  districtIds: string[];           // U2 matchDistricts — 빈 배열이면 저장하지 않음 (FR-2.4)
  blockKey: string | null;         // 블록 번호 정규화 결과 (BR-U3-30)
  contentHash: string;             // 정규화 필드만으로 계산 (BR-U3-50)
}
```

## 4. 대표 공고 묶음 `NoticeGroup` → `NoticeBundle` (U1 RPC 입력)

```ts
interface NoticeGroup {
  dedupKey: string;                // BR-U3-31
  members: NormalizedNotice[];     // 같은 공고로 묶인 소스별 원천 공고 (1개 이상)
  primary: NormalizedNotice;       // 대표 (BR-U3-33)
}

/** upsert_notice_bundle RPC 입력 (U1 0004, U3에서 요약 필드 보완) */
interface NoticeBundle {
  notice: { dedup_key, title, complex_name, location, sido, sigungu, provider, primary_source, tenure,
            announced_at, apply_start, apply_end, result_at, contract_start, contract_end };
  sources: { source, source_notice_no, original_url, raw, content_hash }[];
  units: { label, supply_type, exclusive_area_m2, supply_count, standard_requirements, extracted_requirements, requirements }[];
  district_ids: string[];
  summary: { eligibilityPlain: string; forSeniorCouple: string; generatedAt: string } | null;
  summary_status: "pending" | "done" | "failed";
}
```

## 5. AI 추출 결과 `NoticeExtraction` (Gemini, Q2=A)

공고문 PDF 1개를 읽어 **하나의 JSON**으로 받는다 (요약 + 주택형별 요건, 호출 1번).

```ts
interface NoticeExtraction {
  isNotice: boolean;                       // 입주자 모집공고문이 아니면 false
  schedule: { announcedAt, applyStart, applyEnd, resultAt, contractStart, contractEnd: IsoDate | null };
  units: {
    label: string | null;                  // "59A", "36㎡" 등
    supplyTypeText: string;                // 원문 표기 (분류는 U2가 다시 함)
    exclusiveAreaM2: number | null;
    supplyCount: number | null;
    requirements: unknown;                 // U2 Requirements 형식 — validateRequirements 통과분만 사용
  }[];
  summary: { eligibilityPlain: string; forSeniorCouple: string } | null;  // 쉬운 말, 각 600자 이하
}
```

- 검증에 실패한 필드는 버리고(null), 주택형별 `requirements`가 검증에 실패하면 그 주택형은 **표준 요건만** 쓴다 (BR-U3-64)
- 프로필·가족 정보는 프롬프트에 넣지 않는다 (FR-4.5)

## 6. 공고 처리 상태 (U1 `notices`에 컬럼 추가, U3 마이그레이션)

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `ai_attempts` | int, 기본 0 | AI 추출·요약 시도 횟수 (BR-U3-55, 최대 3회) |
| `ai_source_url` | text | 읽은 공고문 PDF 주소 (추적·골든 세트용) |

## 7. 실행 기록 (U1 E13 `collect_runs` 사용)

| source 값 | 기록 |
|---|---|
| `applyhome` / `lh_rental` / `gh` | 소스별: ok, fetched_count(원천), upserted_count(저장 대표 공고), warning(0건·대기열·지구 후보), error |
| `all` | 실행 전체: 처리 공고 수, AI 호출 수, 재계산 요약(U2 `RecomputeAllSummary`)을 warning에 JSON으로 |

---

## 변경 요청 2 (2026-10-18)

### 원천 `sh` 추가

`CollectSource = "applyhome" | "lh_rental" | "gh" | "sh"`. DB `source_notices.source`·`notices.primary_source` 검사 제약에 `sh` 추가(마이그레이션).

### 정규화 공고에 지역

```ts
interface NormalizedNotice {
  // …(그대로: sido, sigungu, districtIds …)
  regions: NoticeRegion[];      // U2 NoticeRegion (수도권 시도 + 시군구|null). 비면 저장 안 함 (BR-U3-C2)
}
```

DB: `notices.regions`(U2 0009). 묶음 저장 RPC(`upsert_notice_bundle`)가 `regions`를 받아 저장하되, **AI가 고친 지역(`regions_ai`)이 있으면 유지** — 고친 결과를 따로 칸 `notices.regions_ai jsonb`(null = 고친 적 없음)에 두고, 판정·노출용 지역 = `regions_ai ?? regions`로 읽는다.

### Gemini 응답에 공급 위치

`RESPONSE_SCHEMA`에 `supplySigungu: string[] | null` (공고문에 적힌 공급 위치 시군구, "서울특별시 강동구" 같은 원문 표기 그대로). 프롬프트 규칙 한 줄 추가.

### 인천 옛 구 → 새 구 동 목록 (BR-U3-C5)

| 새 구 | 옛 구 | 가르는 동(주소·제목에 나오면) |
|---|---|---|
| 영종구 | 중구 일부 | 영종·운서·운남·운북·중산·을왕·남북·덕교·무의·용유 |
| 제물포구 | 중구 나머지 + 동구 | (영종 쪽 동이 아니면) |
| 검단구 | 서구 일부 | 검단·대곡·불로·마전·금곡·오류·왕길·당하·원당·아라 |
| 서해구 | 서구 나머지 | (검단 쪽 동이 아니면) |

동 목록은 코드 단계에서 행정안전부 행정구역 자료와 한 번 더 대조한다.

---

## 변경 요청 3 (2026-10-20)

### 추출 형식 (Gemini 응답)

```ts
interface ExtractedUnitRequirementsFlat {
  // …기존 그대로
  marriageMaxYears: number | null;
  preNewlywedAllowed: boolean | null;
  firstTimeIncomeTaxYears: number | null;
  incomePriorityPercent: number | null;
  incomePriorityDualPercent: number | null;
  lotteryRealEstateMaxManwon: number | null;
}
interface ExtractedSummary {
  eligibilityPlain: string;
  forSeniorCouple: string;
  forNewlywed?: string;   // 선택 (BR-U3-D21)
}
```

### 저장 (0013)

| 칸 | 내용 |
|---|---|
| `notices.analysis_version` int default 1 | 분석 판 (BR-U3-D30). 0013 적용 때 기존 행은 1 |
| `notices.reanalysis_attempts` int default 0 | 다시 분석 실패 횟수 (BR-U3-D32) |
| `notices.reanalyzed_at` timestamptz null | 다시 분석 예약 시각 — 하루 5건 셈 (BR-U3-D31) |
| `notices.summary` jsonb | `forNewlywed` 키 추가 가능 (형식 그대로) |
| `supply_type_standards` | `newlywed_special_supply`·`first_time_supply`·`rental_newlywed_supply` 시드 (요건 = U2 신청 방법 표준) |
| `claim_notices_for_reanalysis(p_limit, p_now)` | 판 1 + done + 관심 지역 안 + 마감 전 + 시도 3회 미만, 오늘 예약한 수를 빼고 최대 5건 |

---

## 변경 요청 4 (2026-10-25) — 위치·대상 찾기, AI 분석 실패

> 근거: requirements §11 (FR-C4-1~4·6~11), 계획 답 Q1~Q4 = A, U2 변경 4(audiences·계층 모름)

### 정규화 공고에 위치 글·단서 글

```ts
interface NormalizedNotice {
  // …기존 (sido, sigungu, location, title, attachments …)
  /** 원천의 "공급 위치" 칸 값들 — 청약홈 HSSPLY_ADRES, LH dsSbd[].LCT_ARA_ADR, GH 공급정보 표의 소재지. 접수처·본사 주소는 넣지 않는다 */
  locationTexts: string[];
  /** 지구 이름·대상 낱말을 찾을 글 — 제목, 공고문 첨부 이름(서식·양식 제외), GH 주택형 칸 */
  hintTexts: string[];
  /** 제목·단서 글에서 찾은 신청 대상 (BR-U3-E20) */
  audiences: NoticeAudience[];
}
```

| 원천 | `locationTexts` | `hintTexts`에 더하는 것 |
|---|---|---|
| 청약홈 | `HSSPLY_ADRES` | — |
| LH | 상세 `dsSbd[].LCT_ARA_ADR` 모두 (⚠ `dsCtrtPlc` 접수처 제외) | 공고문 첨부 이름 |
| GH 행복주택(sr7150) | 상세 "사업지구별 공급정보" 표의 **소재지** 칸 (⚠ 페이지 아래 본사 주소 제외) | 공고문 첨부 이름, 주택형 칸 (예: "25A 기업체기숙사") |
| GH 매입임대(sr7155) | 없음 | 공고문 첨부 이름 (예: "…(일반) 부천. 김포 …") |
| SH | 지금 그대로 | 공고문 첨부 이름 |

### Gemini 추출에 `audiences`

```ts
interface Extraction {
  // …기존 (isNotice, units, summary, supplySigungu …)
  /** 공고가 특정 대상만 받으면 그 대상들(U2 NoticeAudience 값), 누구나 받으면 [], 모르면 null */
  audiences: NoticeAudience[] | null;
}
```

- 응답 스키마: 문자열 배열(값은 U2 대상 9개 중), null 허용. 형식이 틀린 값은 버린다

### 저장 (0016)

| 칸 | 뜻 |
|---|---|
| `notices.audiences` (0015) | 제목·단서 글에서 찾은 대상 — 수집이 채움 |
| `notices.audiences_ai text[] null` | 공고문 AI가 읽은 대상. null = 분석 전·실패 또는 AI가 비움 |
| `notices.ai_last_error text null` | 마지막 분석 실패 이유 `코드: 짧은 설명`(200자 이내, 키·주소 쿼리 없음). 성공하면 null |
| `summary_status`에 `skipped` 추가 | 분석할 공고문이 어느 원천에도 없음(청약홈 단독) — 예약하지 않고 실패로 세지 않음 |

- 판정 입력의 대상 = `audiences_ai`가 비어 있지 않으면 그것, 아니면 `audiences` (Q4=A). U2 저장소 읽기(`toNoticeForJudgement`)가 이 규칙을 쓴다
- `upsert_notice_bundle`이 `audiences`·`audiences_ai`·`ai_last_error`를 받는다(키가 없으면 그대로)

### Gemini 모델

- 함수 환경 변수 `GEMINI_MODEL`, 없으면 **`gemini-3.5-flash`**, 출력 한도 16,384토큰 (코드 단계에서 고침, 2026-10-25). 새 프로젝트 키는 `gemini-2.5-flash`를 쓸 수 없다. 큰 공고문(경기행복주택 추가모집 PDF 1.7MB·5.8만 토큰)으로 재 보니: 3.8-flash는 503(수요 폭주)·2~4분 → 호출 60초·함수 150초 한도에 안 맞음, 3.5-flash-lite는 35초지만 주택형을 1개로 뭉침, **3.5-flash는 31초에 주택형 5개·대상·공급 위치 15곳 정확**(8,192토큰에서는 한 번 JSON이 잘림 → 16,384)

### 정규화 판

- `NORMALIZE_VERSION = 4`를 변경 감지 해시 입력에 넣는다 → 배포 뒤 첫 수집에서 모든 공고가 "바뀜"으로 다시 저장된다(지역·대상·제목 분류 주택형 다시 계산, 분석 다시 대기 — BR-U3-E40)
