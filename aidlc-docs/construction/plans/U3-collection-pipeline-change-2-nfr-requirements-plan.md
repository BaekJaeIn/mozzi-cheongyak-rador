# U3 collection-pipeline — 변경 요청 2 NFR 요구사항 계획

> 근거: requirements.md §9 (NFR-C2-1·2), U3 변경 2 기능 설계(BR-U3-C1~C20)
> 기존: `U3-collection-pipeline/nfr-requirements/nfr-requirements.md` (NFR-U3-01~24), `tech-stack-decisions.md`

## 지금 숫자와 늘어나는 양 (추정)

| 항목 | 지금 | 변경 2 뒤 |
|---|---|---|
| `collect` 시간 예산 | 청약홈 20초 + LH 40초 + GH 10초 = **70초** (전체 상한 90초) | + 서울 공고(청약홈 목록은 같고, **LH 상세 호출이 서울만큼 늘어남**) + **SH**(목록 2쪽 + 상세 글마다 1번, 최근 2쪽이면 많으면 20건) |
| LH 상세 호출 | 경기·인천 공고 수만큼(보통 수십) | 서울까지 — 대략 1.5배 |
| `analyze` | 매시 30분, 1회 최대 2건 → 하루 최대 48건 | 요약 대상이 관심 지역으로 묶여서(BR-U3-C18) 크게 늘지 않음. 처음 반영 때 서울 공고가 한꺼번에 대기열에 들어올 수 있음 |
| Gemini 호출 | 하루 수 건 | 하루 수~수십 건 (무료 등급 한도 안) |

**문제**: SH와 서울 LH 상세가 더해지면 한 번 실행으로 90초 안에 끝낸다는 보장이 없다.

## 단계

- [x] Step 1 — 기존 NFR·예산·호출량 확인, 늘어나는 양 추정
- [x] Step 2 — 아래 질문 답 받기 (Q1~Q3 = A)
- [x] Step 3 — nfr-requirements.md에 변경 2 절 추가 (시간 예산, 요청 예절, Gemini 양, 관측, PBT 확인)
- [x] Step 4 — tech-stack-decisions.md 확인 (새 라이브러리 없음 예상)

---

## Question 1 — `collect`가 90초를 넘지 않게 어떻게 할까요?

A) **두 번 나눠 부른다.** 새벽 5시 "API 묶음"(청약홈·LH), 5시 10분 "크롤링 묶음"(GH·SH). 함수는 같고 부를 때 소스를 고른다(알림 발송 `part`와 같은 방식). 판정 재계산은 두 번째 호출 끝에 한 번 **(추천 — 각 호출에 여유가 생기고 한쪽 실패가 다른 쪽에 안 번진다)**

B) 한 번에 부르되 소스별 예산을 다시 나눈다 (청약홈 15초, LH 35초, GH 10초, SH 20초 = 80초)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — SH 상세 화면은 언제 다시 읽을까요?

A) **처음 보는 글이거나 목록 제목이 바뀐 글만 상세를 읽는다.** 이미 저장한 글은 목록만 보고 넘어간다. 요청 사이 1초 쉬고, 한 번 실행에 상세 최대 15건 **(추천 — SH 서버 부담·시간 모두 작음)**

B) 매일 최근 2쪽의 모든 글 상세를 다시 읽는다 (정정 공고를 바로 반영, 요청이 많음)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — 처음 반영할 때 서울 공고가 한꺼번에 요약 대기열에 들어오면?

A) **지금 속도(매시 2건) 그대로 둔다.** 마감이 빠른 공고부터 처리하므로 하루 이틀 안에 따라잡는다. 그 사이 요약이 없는 공고는 원문 보기로 볼 수 있다 **(추천 — Gemini 무료 한도 안전)**

B) 대기 공고가 10건 넘게 쌓이면 1회 처리량을 3건으로 늘린다 (실행 시간 한도 안에서)

X) Other (please describe after [Answer]: tag below)

[Answer]: A
