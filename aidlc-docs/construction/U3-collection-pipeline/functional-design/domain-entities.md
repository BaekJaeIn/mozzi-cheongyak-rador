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
