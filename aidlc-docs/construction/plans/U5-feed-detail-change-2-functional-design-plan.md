# U5 feed-detail — 변경 요청 2 기능 설계 계획 (작게)

> 근거: requirements.md §9 (FR-C2-10·12·13), stories US-12·13·15, change-2-execution-plan.md
> 기존 설계: `U5-feed-detail/functional-design/` (business-rules·domain-entities·business-logic-model·frontend-components)
> 이미 끝난 것: 노출 조건 "관심 지구 또는 관심 시군구"(U2 `inInterestArea` → 판정 `inDistrict`), 공고 지역 저장 `regions`·`regions_ai`(U3), 관심 지역 입력(U4)

## 이번에 바꾸는 것

1. **카드·상세의 위치 표시** (FR-C2-13): 지구가 없는 공고는 "서울 강서구"처럼 시·군·구를 보여 준다. 피드·관심 공고·상세 API에 공고 지역(`regions_ai ?? regions`)을 싣는다
2. **문구**: "관심 지구 밖의 공고예요" → "관심 지역 밖의 공고예요", 지구 이름 정렬 "관심 지구 먼저"는 그대로 + 지역 이름은 "관심 지역 먼저"
3. **요약이 없는 공고** (FR-C2-10): 관심 지역 밖이라 요약을 만들지 않는 공고의 상세 표시
4. PBT 속성 추가

## 단계

- [x] Step 1 — 기존 U5 설계·코드 확인 (카드 지구 이름 BR-U5-25, 상세 상태 안내 BR-U5-71, 요약 BR-U5-95·96, 피드 API 형식)
- [x] Step 2 — 아래 질문 답 받기 (Q1·Q2 = A)
- [x] Step 3 — domain-entities.md 갱신 (API 공고 지역, 위치 표시 값)
- [x] Step 4 — business-rules.md 갱신 (위치 표시, 문구, 요약 없음)
- [x] Step 5 — business-logic-model.md·frontend-components.md 갱신
- [x] Step 6 — PBT 속성 정의 (PBT-01)

## 설계 메모 (질문 아님)

- 판정·노출은 바꾸지 않는다(U2·U3에서 끝남). U5는 **보여 주는 것만** 바꾼다
- 공고에 지구가 있으면 지금처럼 지구 이름을 보여 준다(예: "하남 교산"). 지구가 없을 때만 시·군·구
- 지역이 여러 개면 **내 관심 지역에 들어가는 것 먼저**, 그다음 공용 목록 순서. 2개 넘으면 "외 N" (BR-U5-25와 같은 방식)
- 관심 지역 안인데 요약이 아직 없는 공고는 지금처럼 "요약을 준비 중이에요" + [원문 보기]

---

## Question 1 — 공고 위치가 시·도까지만 확인된 공고(예: SH "고덕강일지구"를 AI가 아직 못 고친 경우)는 카드에 어떻게 보여 줄까요?

A) **"서울"** 처럼 시·도만 보여 주고, 상세의 위치 줄에 "정확한 위치는 공고문에서 확인해 주세요"를 붙인다 **(추천 — 카드는 짧게, 설명은 상세에)**

B) 카드에도 "서울 (구 확인 필요)"처럼 붙인다

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — 관심 지역 밖이라 AI 요약을 만들지 않은 공고(관심 공고에 담아 두었거나 알림 링크로 들어온 경우)의 상세 요약 자리는?

A) **"관심 지역 밖의 공고라 요약을 만들지 않았어요. 정확한 내용은 원문을 확인해 주세요" + [원문 보기]**. 설정에서 관심 지역에 넣으면 다음 날부터 요약된다는 안내 한 줄과 [관심 지역 고치기] 링크 **(추천 — "준비 중"이라고 하면 계속 기다리게 된다)**

B) 문구 없이 [원문 보기]만 보여 준다

X) Other (please describe after [Answer]: tag below)

[Answer]: A
