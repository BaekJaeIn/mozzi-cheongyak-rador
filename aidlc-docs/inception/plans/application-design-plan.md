# 모찌네 청약 알리미 — 애플리케이션 설계 계획

**입력**: requirements.md (D1~D20, FR-1~11, NFR-1~7), stories.md (US-01~20, OI-1~3), execution-plan.md (예상 U1~U6)
**참고 구현**: `../cheongYak-radar` (Next.js `src/features/*` + `supabase/functions/collect/*` 구조, Next API 라우트로 프로필·구독 처리)

아래 **질문 8개(Q-A1 ~ Q-A8)**의 `[Answer]:` 뒤에 보기 알파벳을 적고, 다 적으셨으면 "완료"라고 알려 주세요.
**(추천)** 표시는 제 의견이니 참고만 하세요.
답을 분석한 뒤 설계 문서 5개를 생성합니다.

---

## 생성할 산출물

- [x] `application-design/components.md`: 컴포넌트 정의·책임·인터페이스
- [x] `application-design/component-methods.md`: 메서드 시그니처 (상세 규칙은 Functional Design)
- [x] `application-design/services.md`: 서비스 정의·오케스트레이션
- [x] `application-design/component-dependency.md`: 의존 관계·통신 패턴·데이터 흐름
- [x] `application-design/application-design.md`: 위 문서 통합본
- [x] 설계 완결성·일관성 점검 (모든 FR·스토리가 컴포넌트에 연결되는지, 열린 이슈 OI-1~3 위치)

---

## 결정이 필요한 질문

### Q-A1. 저장소 구조
프론트엔드와 Supabase 코드를 어떻게 둘까요?

A) **단일 저장소**: Next.js 앱이 루트에 있고, `supabase/`(migrations, functions) 폴더를 그 아래에 둠. cheongYak-radar와 같은 구조 **(추천)**

B) 프론트(`web/`)와 백엔드(`supabase/`)를 별도 폴더·설정으로 분리

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A2. 자격 판정 엔진을 "같은 코드"로 쓰는 방법 (FR-5.6)
판정 엔진은 화면(피드)과 알림 발송(서버) 모두에서 써야 합니다. 그런데 Next.js는 Node, Supabase Edge Function은 Deno라서 실행 환경이 다릅니다.

A) **공유 폴더 하나**: 외부 라이브러리 없는 순수 TypeScript로 `supabase/functions/_shared/eligibility/`에 두고, Deno는 그대로 import하고 Next.js는 경로 별칭(tsconfig paths)으로 import **(추천)**

B) **서버에서만 판정**: 판정은 Edge Function(또는 Next 서버)에서만 하고, 화면은 판정 결과만 받아서 보여줌 (구현 1벌, 대신 피드도 서버 판정 결과에 의존)

C) 판정 코드를 두 군데 복사해 두고, 스크립트로 동기화

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A3. 판정 결과를 언제 계산할까요?
알림 수와 피드 목록이 항상 같아야 합니다 (US-10).

A) **미리 계산해 저장**: 수집 직후와 프로필이 바뀔 때 "기기 × 공고" 판정 결과를 DB에 저장. 피드와 알림이 **같은 저장 결과**를 읽음 (일치 보장이 쉽고 피드가 빠름) **(추천)**

B) **그때그때 계산**: 피드를 열 때(기기에서)와 알림 보낼 때(서버에서) 각각 계산. 같은 엔진·같은 입력이면 결과가 같다는 것을 테스트로 보장

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A4. 화면에서 서버 데이터에 접근하는 방식
프로필·구독 테이블은 기기에서 직접 못 읽게 막기로 했습니다 (NFR-2.2).

A) **Next.js API 라우트 경유**: 프로필 동기화·구독 등록·삭제·피드 조회를 Next.js Route Handler에서 처리(서버 전용 키 사용). Edge Function은 예약 작업(수집·발송)만 담당. cheongYak-radar와 같은 방식 **(추천)**

B) **Edge Function 경유**: 모든 쓰기·조회를 Supabase Edge Function으로 처리하고 Next.js는 화면만 담당

C) 공고(공개 데이터)는 브라우저에서 Supabase로 직접 읽고, 프로필·구독만 A 방식

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A5. 로그인 없이 기기를 확인하는 방법
로그인이 없어서(D11) 서버는 요청이 어느 기기에서 왔는지 device_id로만 알 수 있습니다. device_id만 알면 누구든 그 기기의 소득·자산 정보를 읽을 수 있게 되는 문제가 있습니다.

A) **device_id + 비밀 토큰**: 처음 설치할 때 기기에서 무작위 비밀 토큰을 만들어 함께 보관하고, 서버에는 토큰의 해시만 저장. 모든 요청에 둘 다 보내야 접근 가능 **(추천)**

B) device_id만 사용 (가장 단순, 대신 device_id가 새면 정보가 노출됨)

C) Supabase 익명 로그인(Anonymous Sign-in)을 써서 기기마다 익명 계정을 만들고 RLS로 보호 (화면상 로그인은 없음)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A6. 예약 작업(Edge Function) 구성
매일 수집과 매시 정각 알림 발송, 두 가지 예약 작업이 있습니다.

A) **함수 2개로 분리**: `collect`(매일 새벽: 수집 → 정규화 → 지구 매칭 → 저장 → 요약 → 판정 계산)와 `dispatch`(매시 정각: 그 시각 기기 선정 → 알림 발송) **(추천)**

B) **함수 1개 + 모드**: `collect` 하나에 모드 인자로 나눠 실행 (cheongYak-radar 방식)

C) 소스별로 수집 함수를 나눔 (`collect-applyhome`, `collect-lh` …) + `dispatch` (실행 시간 제한 대비)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-A7. 공고의 자격 요건을 어떻게 뽑을까요?
정밀 판정(D7)을 하려면 공고마다 "만 65세 이상", "도시근로자 월평균소득 70% 이하" 같은 요건을 구조화된 데이터로 갖고 있어야 합니다.

A) **공급유형별 표준 요건표**: 공급유형(예: 행복주택 고령자 계층)마다 법령상 표준 요건을 데이터로 두고, API 필드로 확인 가능한 값만 덮어씀. 공고가 표준과 다르면 놓칠 수 있음

B) **AI 추출**: Gemini가 공고 원문에서 요건을 JSON으로 뽑고, 형식 검증을 통과하지 못하면 "확인 필요"

C) **둘 다**: 표준 요건표를 기본으로 하고, Gemini가 공고 원문에서 뽑은 요건이 검증을 통과하면 그 값으로 보정. **둘이 다르면 "확인 필요"** (놓치지 않기 원칙) **(추천)**

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: C

---

### Q-A8. 판정 규칙을 코드로 쓸까요, 데이터로 쓸까요?

A) **규칙은 코드, 기준값은 데이터**: 판정 로직은 TypeScript 순수 함수(조건별 판정기: 나이·무주택·소득·자산·통장·거주)로 쓰고, 연도별 소득 기준표·지구 목록·공급유형 표준 요건은 DB 테이블/시드 데이터로 관리 (PBT 적용이 쉬움) **(추천)**

B) **규칙도 데이터**: 판정 규칙 자체를 JSON 규칙 형식으로 DB에 저장하고, 범용 규칙 실행기가 해석 (코드 수정 없이 규칙 변경 가능, 대신 설계·테스트가 복잡)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A
