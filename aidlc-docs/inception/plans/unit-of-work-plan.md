# 모찌네 청약 알리미 — 작업 단위(Unit of Work) 계획

**입력**: requirements.md, stories.md (US-01~20), application-design/ (C1~C32, S1~S6, AD-1~9), execution-plan.md
**배포 형태**: 하나의 서비스(Next.js 앱 on Vercel + Supabase 프로젝트 1개). 아래 Unit은 **배포 단위가 아니라 개발 순서·모듈 단위**다.

아래 **질문 6개(Q-U1 ~ Q-U6)**의 `[Answer]:` 뒤에 보기 알파벳을 적고, 다 적으셨으면 "완료"라고 알려 주세요. **(추천)**은 제 의견입니다.

---

## 초안: Unit 구성 (Q-U1 A안)

| Unit | 이름 | 포함 컴포넌트 | 주요 스토리 |
|---|---|---|---|
| U1 | 프로젝트 셋업 + 데이터 플랫폼 | Next.js·Tailwind·Vitest·fast-check 셋업, `supabase/` 마이그레이션(전체 스키마·RLS), C17~C20 Repository, C21 DeviceAuth, C23 DeviceIdentity, `POST /api/device`, C32 AppChrome 뼈대 | US-02 일부 |
| U2 | 자격 판정 엔진 (`_shared`) | C1~C8, S2 JudgementService, 기준 데이터 내용(지구·소득 기준표·공급유형 표준 요건) | US-12·14 판정 규칙, US-10 일치 |
| U3 | 수집 파이프라인 | C9~C13, S1 (`collect` Edge Function) | US-12·13·15의 데이터 |
| U4 | 프로필 입력 + 설정 | C24 LocalProfileStore, C25 ProfileWizard, C29 SettingsView, C30 DisplayMode, S3 API (`/api/profile`, `/api/notify-settings`, `DELETE /api/device`) | US-02, 04~09, 18~20 |
| U5 | 피드 · 상세 · 관심 공고 | S4 API (`/api/feed`, `/api/notices/[id]`), C26, C27, C28 | US-12~17 |
| U6 | PWA 설치 + 푸시 알림 | C31 PwaShell, `sw.js`, `/api/push/subscribe`, C14~C16, S5 (`dispatch` Edge Function) | US-01, 03, 10, 11 |

예상 순서: **U1 → U2 → U3 → U4 → U5 → U6** (U3 수집은 U2의 매칭·분류·요건 병합·판정 재계산을 쓰므로 U2 다음)

---

## 결정이 필요한 질문

### Q-U1. Unit을 어떻게 나눌까요?

A) **위 초안대로 6개** (셋업·데이터 / 판정 엔진 / 수집 / 프로필·설정 / 피드·상세 / PWA·푸시) **(추천: 판정 엔진을 독립 Unit으로 두어 PBT를 집중 적용)**

B) **5개**: U4 프로필·설정과 U5 피드·상세를 "화면" Unit 하나로 합침

C) **4개**: 셋업+판정 엔진 / 수집 / 화면 전체 / PWA·푸시

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-U2. 개발 순서는 어떻게 할까요?

A) **아래층부터 차례로**: U1 → U2 → U3 → U4 → U5 → U6. 화면을 만들 때는 수집 데이터(목업 포함)가 이미 있음 **(추천)**

B) **얇게 끝까지 먼저**: 셋업 → 판정 엔진 최소판 → 목업 데이터로 피드 화면까지 먼저 연결한 뒤, 각 Unit을 두꺼워지게 반복

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-U3. 누가 개발하나요? (작업 분담·병렬 진행 여부)

A) **1인(본인) + AI**: Unit을 하나씩 순서대로 완료 (설계 → 코드 → 승인)

B) 여러 명이 Unit을 나눠 병렬로 진행 (Unit 사이 계약(타입·API)을 먼저 고정해야 함)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-U4. cheongYak-radar 코드는 언제, 어떻게 가져올까요? (D3: 복사 후 수정)

A) **Unit별로 필요할 때**: 각 Unit의 Code Generation 계획에 "가져올 파일 목록 + 바꿀 점"을 적고 그때 복사 (예: U3에 수집 어댑터·파서, U5에 타임라인·캘린더 링크·D-day, U6에 푸시·PWA) **(추천)**

B) **U1에서 한 번에**: 쓸 만한 파일을 처음에 모두 복사해 두고, 각 Unit에서 고쳐 쓰고 안 쓰는 것은 지움

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-U5. 실제 Supabase·Vercel 배포는 언제 할까요?

A) **U1에서 실제 프로젝트를 만들고 뼈대를 배포**, 이후 Unit마다 마이그레이션·함수·화면을 바로 반영 (실제 환경에서 일찍 문제를 발견) **(추천)**

B) 개발 중에는 **로컬 Supabase(CLI) + 목업 데이터**로만 진행하고, 모든 Unit이 끝난 뒤 Build and Test 단계에서 한 번에 배포

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q-U6. 기준 데이터(지구 목록, 연도별 소득·자산 기준표, 공급유형 표준 요건)는 어느 Unit이 책임질까요?

A) **테이블 구조는 U1, 실제 값(시드)은 U2**: 판정 엔진의 Functional Design에서 어떤 값이 필요한지 정한 뒤 U2에서 시드 데이터를 채움 **(추천)**

B) **U1에서 구조와 값을 모두**: U2는 이미 있는 데이터를 읽기만 함

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

## 실행 계획 (답변 확정 후, 생성 단계에서 체크)

- [x] 1. 답변 분석, 모호한 점이 있으면 추가 질문 (Q-U1~U6 모두 A, 모호 없음)
- [x] 2. `aidlc-docs/inception/application-design/unit-of-work.md` 생성
  - [x] 2.1 Unit별 정의·책임·포함 컴포넌트·범위 밖
  - [x] 2.2 Unit별 실행할 CONSTRUCTION 단계 (Functional Design / NFR Requirements / NFR Design / Infrastructure Design 해당 여부)
  - [x] 2.3 **코드 구성 전략 (Greenfield)**: 폴더 구조, `_shared` 경로 별칭, 테스트 파일 위치
  - [x] 2.4 Unit별 cheongYak-radar 재사용 후보 (Q-U4 방식)
- [x] 3. `aidlc-docs/inception/application-design/unit-of-work-dependency.md` 생성 (의존 매트릭스, 순서, Unit 사이 계약)
- [x] 4. `aidlc-docs/inception/application-design/unit-of-work-story-map.md` 생성 (US-01~20 → Unit, 열린 이슈 OI-1~5 → Unit)
- [x] 5. Unit 경계·의존 검증 (순환 의존 없음)
- [x] 6. 모든 스토리가 Unit에 배정되었는지 확인
