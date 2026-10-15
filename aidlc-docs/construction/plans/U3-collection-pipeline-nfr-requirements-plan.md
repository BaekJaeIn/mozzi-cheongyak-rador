# U3 collection-pipeline — 비기능 요구사항 계획

**입력**: U3 기능 설계(BR-U3-01~82), U1·U2 NFR(공통 기반), U1 NFR Q5=A(장애는 기록만, keepalive 실패 메일)
**이미 정해진 것**: Deno(Supabase Edge Function), Gemini, `_shared` 순수 코드 + `_lib` Deno 전용, fast-check, 서울 리전, 무료 플랜

**제약 확인**
- Supabase 무료 플랜 Edge Function: 한 번 실행에 **벽시계 약 150초**, CPU 시간 짧음(대부분 대기 시간이라 문제 적음), 메모리 256MB. 정확한 값은 Infrastructure Design에서 공식 문서로 다시 확인
- 수집(청약홈 5페이지 + LH 목록·상세 + GH) ≈ 30~60초 예상
- Gemini가 PDF 1개(수십 쪽)를 읽는 데 **10~40초** → 한 번 실행에서 처리할 수 있는 공고는 몇 건뿐
- 첫 실행이나 공고가 몰린 날에는 AI 처리할 공고가 10~20건 생길 수 있음

아래 **질문 2개**의 `[Answer]:` 뒤에 보기 알파벳을 적고, 저장한 뒤 "완료"라고 알려 주세요. **(추천)**은 제 의견입니다.

---

## 질문

### Q1. AI(PDF 추출·요약)를 실행 시간 제한 안에서 어떻게 처리할까요?

A) **AI 처리를 따로 떼어 매시간 조금씩**: `collect`(매일)는 수집·저장·재계산만 하고 AI가 필요한 공고는 `pending`으로 둠. 별도 함수 `analyze`가 **매시간** 대기 공고 2건씩 처리하고, 처리한 공고만 판정을 다시 계산. 공고 20건도 하루 안에 끝남 **(추천)**

B) `collect` 안에서 시간 예산(예: 90초)까지만 AI 처리, 남은 공고는 다음 날 `collect`에서 (구조는 단순, 대신 공고가 몰리면 요약·정밀 판정이 며칠 늦어짐)

C) `collect`를 하루 여러 번(예: 4번) 실행하고 매번 시간 예산까지 AI 처리

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q2. 소스 요청이 일시적으로 실패하면 다시 시도할까요?

A) **요청 단위로 1번 재시도**: 네트워크 오류·5xx·429면 2초 뒤 1번 다시 요청. 그래도 실패하면 그 소스(또는 그 공고 상세)만 건너뛰고 기록 **(추천: 공공데이터 API가 가끔 일시 오류를 냄)**

B) 재시도 없음: 실패하면 그 소스는 다음 날 다시

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

## 결정만 하고 묻지 않는 항목 (이의가 있으면 말씀해 주세요)

| 항목 | 결정 | 이유 |
|---|---|---|
| Gemini 모델 | 환경 변수 `GEMINI_MODEL`, 기본값은 cheongYak-radar에서 검증된 `gemini-2.5-flash` | 모델 교체를 코드 수정 없이 |
| Gemini에 보내는 데이터 | 공고 PDF·제목뿐 (공개 정보). 무료 등급은 Google이 입력을 서비스 개선에 쓸 수 있으나, 가족 정보는 보내지 않으므로 허용 | FR-4.5 |
| 크롤링 예절 | GH는 하루 1번 메인 1쪽만, User-Agent 명시, 대기열이면 우회하지 않음 | 공공기관 사이트 부담 최소 |
| 키 보호 | data.go.kr 키가 URL 쿼리에 들어가므로 오류·로그에 URL을 남기지 않음 (BR-U3-72) | NFR-2.4 |
| 장애 인지 | U1 결정 유지: `collect_runs` 기록만 + keepalive 실패 메일 | U1 NFR Q5=A |

---

## 실행 계획 (답변 확정 후 체크)

- [x] 1. 답변 분석, 모호하면 추가 질문 (Q1=A, Q2=A. Q1로 기능 설계 흐름 변경 — business-logic-model 변경 메모)
- [x] 2. `construction/U3-collection-pipeline/nfr-requirements/nfr-requirements.md` (성능·시간 예산, 신뢰성·재시도, 보안, 운영·관측, 테스트)
- [x] 3. `.../tech-stack-decisions.md` (Deno 의존성: supabase-js `npm:`, HTML 파싱 방식, Gemini 호출 방식, 테스트 픽스처)
