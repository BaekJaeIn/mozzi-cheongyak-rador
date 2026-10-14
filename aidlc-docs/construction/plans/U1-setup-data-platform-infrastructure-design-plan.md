# U1 setup-data-platform — 인프라 설계 계획

**입력**: U1 기능 설계, NFR 요구사항(NFR-U1-01~29), NFR 설계(L1~L14, RPC 8개), tech-stack-decisions.md
**이미 정해진 것**: Vercel(Hobby, `icn1`) + Supabase(무료, `ap-northeast-2`, 새 프로젝트) + GitHub(Actions), cheongYak-radar와 **별도** 프로젝트(D4·NFR-5.2)
**참고한 교훈** (cheongYak-radar `0010_cron_vault_and_drop_test.sql`): Supabase에서는 `ALTER DATABASE ... SET app.settings.*`가 권한 때문에 막힘 → cron이 쓰는 URL·키는 **Supabase Vault**에 둔다

아래 **질문 5개**의 `[Answer]:` 뒤에 보기 알파벳을 적고 "완료"라고 알려 주세요. **(추천)**은 제 의견입니다.

---

## 범주별 검토

| 범주 | 질문 여부 | 이유 |
|---|---|---|
| 배포 환경 | Q1, Q2, Q3 | 개발·운영 환경 분리, 배포 방식이 정해지지 않음 |
| 컴퓨팅 | Q4 | 일일 정리 작업(L14)의 실행 위치가 정해지지 않음. 나머지는 Vercel 함수·Edge Function으로 확정 |
| 스토리지 | **질문 없음** | Supabase PostgreSQL 하나로 확정. 파일 저장소 필요 없음 (아이콘은 `public/`) |
| 메시징 | **질문 없음** | 큐를 쓰지 않음. 예약 작업은 pg_cron + pg_net(HTTP 호출)으로 충분 (규모 고정, NFR-U1-01) |
| 네트워크 | Q5 | 주소(도메인) |
| 모니터링 | **질문 없음** | Vercel 함수 로그 + Supabase 로그 + `collect_runs` + keepalive 실패 메일로 확정 (NFR-U1-08~10, Q5=A "기록만") |
| 공유 인프라 | **질문 없음** | Supabase 프로젝트 1개·Vercel 프로젝트 1개를 모든 Unit이 공유. cheongYak-radar와는 공유하지 않음 → `shared-infrastructure.md`로 정리 |

---

## 질문

### Q1. 개발 환경과 운영 환경을 나눌까요?

A) **운영 1개 + 로컬 개발**: 개발할 때는 Supabase CLI 로컬 스택(Docker 필요)을 쓰고, 운영 Supabase는 배포용으로만 씀 **(추천: 실제 가족 데이터가 있는 운영 DB를 개발 중에 건드리지 않음)**

B) **운영 + 스테이징 Supabase 2개**: 무료 플랜은 프로젝트 2개까지 가능. 로컬 Docker 없이 스테이징에서 개발

C) 운영 1개만: 개발도 운영 DB에 바로 연결 (가장 단순, 실수 위험 큼)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

참고: A를 고르시면 이 Windows PC에 **Docker Desktop**이 필요합니다.

[Answer]: A

---

### Q2. Vercel 배포 방식

A) **GitHub 연동 자동 배포**: `main` 브랜치에 push하면 운영 배포. PR 미리보기 배포는 **끔**(미리보기도 운영 DB에 연결되기 때문) **(추천)**

B) GitHub 연동 + PR 미리보기 배포도 켬 (미리보기가 운영 DB를 쓰는 위험 감수, 또는 Q1=B 스테이징에 연결)

C) Vercel CLI로 수동 배포

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q3. DB 마이그레이션·Edge Function 배포 방식

A) **개발자가 수동 실행**: `supabase db push`, `supabase functions deploy`를 로컬에서 실행. 절차는 문서로 남김 **(추천: 1인 개발, 운영 DB 변경을 사람이 확인)**

B) GitHub Actions가 `main` push 때 자동 실행 (Supabase 접근 토큰을 GitHub 시크릿에 저장)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q4. 일일 정리 작업(오래된 기기·공고 삭제)은 어디서, 언제 실행할까요?

A) **pg_cron이 DB 함수를 직접 실행**: 정리는 SQL만으로 끝나므로 Edge Function 없이 `cleanup_expired_devices`, `cleanup_expired_notices`를 매일 **KST 04:00**에 실행 **(추천: 가장 단순, 외부 호출 없음)**

B) U3 수집 함수(`collect`)의 마지막 단계에서 실행

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q5. 앱 주소

A) **Vercel 기본 주소** (`<프로젝트명>.vercel.app`) **(추천: 비용 없음, PWA 설치·푸시 모두 가능)**

B) 직접 구매한 도메인 연결 (비용 발생, 나중에 바꾸면 이미 설치한 PWA·푸시 구독을 다시 해야 함)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

## 실행 계획 (답변 확정 후 체크)

- [x] 1. 답변 분석, 모호하면 추가 질문 (Q1~Q5 모두 A. 사전 조건: Docker 미설치 확인 → Code Generation 전 설치 필요로 기록)
- [x] 2. `construction/U1-setup-data-platform/infrastructure-design/infrastructure-design.md`
  - [x] 2.1 논리 컴포넌트(L1~L14) → 실제 서비스 매핑
  - [x] 2.2 환경(Q1)·환경 변수·시크릿 목록과 저장 위치 (Vercel / Supabase Function 시크릿 / Vault / GitHub 시크릿)
  - [x] 2.3 pg_cron 작업(Q4)과 Vault 사용 방식
  - [x] 2.4 일시 중지 방지 확인 방법 (keepalive가 활동으로 인정되는지)
- [x] 3. `.../deployment-architecture.md`
  - [x] 3.1 배포 구성도 (Mermaid + 텍스트 대안)
  - [x] 3.2 배포 절차 (Q2·Q3), 첫 구축 순서 (GitHub → Supabase → Vercel → 시크릿 → 마이그레이션 → 배포 → keepalive)
  - [x] 3.3 되돌리기(롤백) 방법
- [x] 4. `construction/shared-infrastructure.md` (모든 Unit 공유 자원, 이후 Unit이 추가할 자리)
