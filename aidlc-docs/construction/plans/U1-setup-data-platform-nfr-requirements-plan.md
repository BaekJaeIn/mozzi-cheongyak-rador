# U1 setup-data-platform — 비기능 요구사항 계획

**입력**: U1 기능 설계(엔티티 E1~E13, BR-U1-01~25), requirements.md NFR-1~7, PBT Extension(PBT-08·09)
**이미 정해진 것** (다시 묻지 않음): TypeScript, Tailwind, Supabase(PostgreSQL·Edge Functions·pg_cron), Vercel, Vitest, Gemini, npm(cheongYak-radar와 동일), PBT 프레임워크 **fast-check**(PBT-09 권장), E2E **Playwright**(requirements §5)
**가정**: 사용 기기 10대 이하(가족), 공고는 연간 수백 건 규모. 대규모 확장성 요구는 없음

아래 **질문 6개**의 `[Answer]:` 뒤에 보기 알파벳을 적고 "완료"라고 알려 주세요. **(추천)**은 제 의견입니다.

---

## 질문

### Q1. Next.js 버전
SPEC은 Next.js 14로 적혀 있지만, 지금(2026-10)은 더 새로운 버전이 나와 있습니다.

A) **Next.js 14 유지**: SPEC·cheongYak-radar와 같아서 코드 복사가 쉬움. 대신 오래된 버전이라 보안 패치 지원이 끝났거나 곧 끝날 수 있음

B) **현재 안정 최신 버전**: 지원 기간이 길고 보안 패치를 받음. cheongYak-radar에서 가져온 코드를 일부 고쳐야 할 수 있음(라우트 API·캐시 기본값 차이) **(추천: 새로 시작하는 프로젝트라 지원 기간을 우선)**

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: B

---

### Q2. CI(자동 테스트 실행)
PBT 규칙(PBT-08)에 따라 속성 기반 테스트는 **CI에서 실행**되고, 실패 시 seed가 기록되어야 합니다. 지금 이 폴더는 git 저장소가 아닙니다.

A) **GitHub 저장소 + GitHub Actions**: push·PR마다 타입 검사, 단위·PBT 테스트(seed 기록) 실행. E2E는 수동 실행 또는 main 브랜치에서만 **(추천)**

B) GitHub Actions에서 E2E까지 매번 실행 (느리지만 가장 안전)

C) CI 없이 로컬에서만 테스트. 이 경우 **PBT-08을 지킬 수 없어 진행이 막히는 문제(blocking finding)가 됩니다**

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q3. Supabase 요금제
Supabase 무료 플랜은 **일정 기간 활동이 없으면 프로젝트가 일시 중지**될 수 있습니다. 매일 수집 cron이 활동으로 인정되는지는 Infrastructure Design에서 확인해야 합니다.

A) **무료 플랜 + 일시 중지 방지 대책**: 활동으로 인정되는 정기 요청을 두고, 중지되면 개발자가 다시 켬 (NFR-5.1 무료 범위 목표) **(추천)**

B) 유료(Pro) 플랜: 중지 걱정 없음, 월 비용 발생

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q4. 소득·자산 암호화 키 관리 (NFR-2.3)
암호화 키는 Next 서버(프로필 저장)와 Edge Function(판정 재계산) 양쪽에서 필요합니다.

A) **환경 변수(시크릿)로 양쪽에 같은 키 등록**: Vercel 환경 변수 + Supabase Function 시크릿. 암호문에 키 버전을 붙여 나중에 키를 바꿀 수 있게 함 **(추천)**

B) Supabase Vault에만 두고 양쪽이 DB 함수를 통해 꺼내 씀 (키가 한 곳에만 있지만 구조가 복잡)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q5. 장애를 개발자가 어떻게 알까요?
수집 실패, 크롤링 0건, 발송 실패 등은 지금 설계상 `collect_runs` 기록에만 남습니다.

A) **기록만**: 개발자가 가끔 Supabase에서 확인 (가장 단순)

B) **개발자 기기에 알림**: 수집이 실패하거나 0건 경고가 연속 2일 이상이면, 개발자로 지정한 기기에 Web Push로 알림 (추가 기능 소량) **(추천: 공고를 놓치지 않기 원칙)**

C) 개발자 이메일로 알림 (메일 발송 서비스 추가 필요)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q6. 서버 지역
A) **서울 리전**: Supabase `ap-northeast-2`, Vercel 함수 `icn1`. 화면 응답이 빠름 **(추천)**

B) 기본값(미국 등)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

## 실행 계획 (답변 확정 후 체크)

- [x] 1. 답변 분석, 모호하면 추가 질문 (Q1=B, Q2~Q6=A. Q3·Q5 조합의 중지 인지 공백은 GitHub Actions keepalive 실패 메일로 보완 — NFR-U1-08·09)
- [x] 2. `construction/U1-setup-data-platform/nfr-requirements/nfr-requirements.md`
  - [x] 2.1 성능 (API 응답 시간, 피드 첫 화면 3초, 인증 처리 비용)
  - [x] 2.2 확장성 (규모 가정, 무료 플랜 한도)
  - [x] 2.3 가용성·신뢰성 (일시 중지 대응, 장애 인지 방식 Q5)
  - [x] 2.4 보안·개인정보 최소 보호 (RLS, 토큰 해시, 키 관리 Q4, 로그 금지 항목)
  - [x] 2.5 유지보수성·테스트 (strict, 테스트 위치, CI Q2, PBT-08)
  - [x] 2.6 사용성 (디자인 토큰, 접근성 점검 방법)
- [x] 3. `.../tech-stack-decisions.md`
  - [x] 3.1 프레임워크·라이브러리 버전 결정 (Q1)
  - [x] 3.2 **PBT-09**: fast-check 선정·설정 (커스텀 생성기, shrinking, seed 재현, Vitest 연동)
  - [x] 3.3 Playwright, `_shared` import 설정 (`@shared/*`, `.ts` 확장자 import 허용 여부)
  - [x] 3.4 지역(Q6)·요금제(Q3)
