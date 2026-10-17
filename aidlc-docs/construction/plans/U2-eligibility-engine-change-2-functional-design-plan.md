# U2 eligibility-engine — 변경 요청 2 기능 설계 계획

> 근거: requirements.md §9 (FR-C2-1~5·12, NFR-C2-4), stories US-05·07·12·21, change-2-execution-plan.md
> 기존 설계: `U2-eligibility-engine/functional-design/` (business-rules·domain-entities·business-logic-model)

## 이번에 바꾸는 것

1. **프로필 모델**: `savings.owner`(나 / 배우자 / 두 분 다) 추가, `prefs.regions`(관심 시·군·구) 추가, 스키마 버전 1 → 2, 버전 1 프로필을 2로 옮기는 규칙(통장 "없음" → "모름")
2. **통장 판정**: 명의와 상관없이 입력한 통장 정보로 판정(지금 규칙 그대로), 사유에 명의 문구
3. **공고 지역**: 판정 입력 공고에 지역 목록(시·도, 시·군·구) 추가 — 지역 판별 자체는 U3
4. **노출 조건 K5**: "관심 지구 안" → "관심 지역 안 = 관심 지구 안 **또는** 관심 시·군·구 안"
5. **수도권 시·군·구 목록**을 공용 도메인 데이터로 (입력·판별·필터가 같은 목록, FR-C2-9)
6. PBT 속성 추가

## 단계

- [x] Step 1 — 기존 U2 설계·코드 확인 (판정에서 통장만 휴대폰 주인 값을 씀, `inDistrict` 사용처 22개 파일)
- [x] Step 2 — 아래 질문 답 받기 (Q1~Q3 = A)
- [x] Step 3 — domain-entities.md 갱신 (프로필 v2, 공고 지역, 관심 지역)
- [x] Step 4 — business-rules.md 갱신 (통장 명의·옮기기·관심 지역·K5)
- [x] Step 5 — business-logic-model.md 갱신 (판정 흐름의 관심 지역 계산, 옮기기 흐름)
- [x] Step 6 — PBT 속성 정의 (PBT-01)

## 설계 메모 (질문 아님)

- **`inDistrict` 이름은 그대로 두고 뜻을 "관심 지역 안"으로 넓힌다.** DB 칸 `judgements.in_district`, 발송 SQL 함수, 피드 API 22개 파일이 쓰고 있어 이름을 바꾸면 위험만 크다. 문서·코드 주석에 새 뜻을 적는다
- 두 분 다 통장이 있으면 "가입이 더 오래된 통장" 하나만 입력받으므로(FR-C2-2) 판정은 통장 하나 기준 그대로
- 예치금 지역(BR-U2-46)은 지금처럼 가구 거주지(`residence.sido`) — 부부는 같은 곳에 산다

---

## Question 1 — 관심 지역에서 "시·도 전체"도 고를 수 있게 할까요?

A) **네.** 시·도마다 맨 위에 "서울 전체 / 경기 전체 / 인천 전체"를 두고, 고르면 그 시·도의 모든 공고가 관심 지역이 된다 **(추천 — 경기처럼 시가 31개인 곳을 하나씩 고르기 어렵다)**

B) 아니요, 시·군·구만 고른다

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — 공고 위치가 시·도까지만 확인될 때(예: "경기도 일원", 여러 시에 걸친 통합 공고)는?

A) **그 시·도 안에서 관심 시·군·구를 하나라도 골랐으면 보여 준다** (놓치지 않기 원칙. 상세에서 위치를 확인) **(추천)**

B) 그 시·도 전체를 고른 사람에게만 보여 준다

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — 인천 행정구역 개편(2026-07, 중구·동구·서구 → 제물포구·영종구·서해구·검단구) 전 이름으로 나온 공고는?

A) **옛 이름을 새 구로 바꿔 맞춘다** (중구 내륙·동구 → 제물포구, 중구 영종 → 영종구, 서구 검단 → 검단구, 서구 나머지 → 서해구). 동 이름으로 가를 수 없으면 Q2 규칙(시·도까지만 확인)으로 처리 **(추천)**

B) 옛 이름은 모두 Q2 규칙으로 처리 (구 매칭 안 함)

X) Other (please describe after [Answer]: tag below)

[Answer]: A
