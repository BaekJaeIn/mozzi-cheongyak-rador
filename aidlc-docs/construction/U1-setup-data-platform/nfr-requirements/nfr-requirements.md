# U1 setup-data-platform — 비기능 요구사항

> 근거: U1 NFR 계획 답변 (Q1=B 최신 안정 Next.js, Q2=A GitHub Actions, Q3=A 무료 플랜 + 중지 대책, Q4=A 환경 변수 키 + 키 버전, Q5=A 기록만, Q6=A 서울 리전)
> 상위 요구: requirements.md NFR-1~7. 이 문서는 U1이 만드는 **공통 기반**의 기준이며, 이후 Unit도 따른다.

---

## 1. 규모 가정 (확장성)

| 항목 | 가정 | 근거 |
|---|---|---|
| 기기 수 | ≤ 10대 | 가족 전용 (페르소나 2명 + 여유) |
| 보관 공고 | ≤ 2,000건 (6개 지구, 마감 후 1년 보관) | BR-U1-14 |
| 판정 행 | ≤ 기기 수 × 보관 공고 = 2만 행 | E11 |
| 요청량 | 하루 수백 건 이하 | 하루 1번 알림 + 가끔 앱 열기 |

| ID | 요구사항 |
|---|---|
| NFR-U1-01 | 위 규모에서 **Supabase 무료 플랜**(DB 용량·Edge Function 호출)과 **Vercel Hobby** 한도 안에서 동작한다 (NFR-5.1) |
| NFR-U1-02 | 규모 확장(수백 기기 이상)은 목표가 아니다. 단, 인덱스는 기기·공고 기준 조회에 맞춰 둔다(판정: PK(device, notice), 공고: 마감일·첫 수집일) |

## 2. 성능

| ID | 요구사항 | 측정 |
|---|---|---|
| NFR-U1-03 | 인증이 필요한 API의 **서버 처리 시간 p95 < 500ms** (서울 리전, 콜드 스타트 제외) | Vercel 함수 로그 |
| NFR-U1-04 | 기기 인증 1회 = PK 조회 1번 + SHA-256 1번. `lastSeenAt` 쓰기는 1시간에 최대 1번 (BR-U1-11) | 코드 리뷰 |
| NFR-U1-05 | 앱 첫 화면(뼈대 + 기기 준비)은 등록된 기기에서 **네트워크 요청 없이** 표시된다 | E2E |
| NFR-U1-06 | 피드 첫 화면 3초 이내(NFR-4.1)를 위해 공통 레이아웃의 클라이언트 JS를 최소화한다 (서버 컴포넌트 기본, 클라이언트 컴포넌트는 기기 준비·하단 메뉴 상태만) | 빌드 리포트 |

## 3. 가용성 · 신뢰성

| ID | 요구사항 |
|---|---|
| NFR-U1-07 | 가용성 목표는 **최선 노력(best effort)**. 가족용이라 SLA를 두지 않는다 (Resiliency Extension 미적용) |
| NFR-U1-08 | **일시 중지 방지 (Q3=A)**: GitHub Actions **예약 워크플로**가 하루 1번 `GET /api/health`를 호출한다. 이 API는 DB에 가벼운 조회를 1번 해서 Supabase 활동으로 남긴다. 실제로 활동으로 인정되는지는 Infrastructure Design에서 확인하고, 부족하면 방식을 보완한다 |
| NFR-U1-09 | `/api/health`가 실패하면 워크플로가 실패하고, **GitHub이 저장소 소유자에게 실패 메일**을 보낸다. 이것이 Supabase 중지·DB 장애를 개발자가 아는 유일한 경로다. (Q5=A "기록만" 원칙 안에서 별도 알림 기능을 만들지 않고 CI 기본 기능만 활용) |
| NFR-U1-10 | 수집·발송·정리 작업의 결과는 `collect_runs`에 남긴다 (Q5=A). 개발자는 Supabase 대시보드에서 확인한다 |
| NFR-U1-11 | 일일 정리 작업(BR-U1-15)과 모든 마이그레이션은 **다시 실행해도 안전**해야 한다 |
| NFR-U1-12 | 기기 앱은 서버 오류 시에도 기기에 저장된 기능(관심 공고, 입력한 프로필 보기)은 계속 동작한다 |

## 4. 보안 · 개인정보 (최소 보호, Security Extension 미적용)

| ID | 요구사항 |
|---|---|
| NFR-U1-13 | 모든 테이블 RLS 켜기 + anon·authenticated 권한 전부 회수 (BR-U1-18). 마이그레이션 테스트에서 anon 키로 조회가 **실패**하는지 확인 |
| NFR-U1-14 | 기기 토큰: 32바이트 난수, 서버는 SHA-256만 저장, 상수 시간 비교 (BR-U1-02·07) |
| NFR-U1-15 | **암호화 키 (Q4=A)**: AES-256-GCM 키를 Vercel 환경 변수와 Supabase Function 시크릿에 **같은 값**으로 등록. 암호문 형식은 `v{키버전}.{iv}.{ciphertext}`(base64url)로 키 버전을 포함해 키 교체가 가능해야 한다. 현재 키 버전과 이전 키(교체 기간)를 함께 읽을 수 있게 한다 |
| NFR-U1-16 | 비밀 값(서버 전용 Supabase 키, 암호화 키, data.go.kr·Gemini 키, VAPID 개인키)은 저장소에 커밋하지 않는다. `.env.example`에는 이름만 둔다. 브라우저 번들에 들어가는 `NEXT_PUBLIC_*`에는 VAPID 공개키 외 비밀을 두지 않는다 (BR-U1-19) |
| NFR-U1-17 | 로그 금지 항목: 기기 토큰, 프로필 값, 금액(평문·암호문), 푸시 구독 키 (BR-U1-21). 로그는 `deviceId` 앞 8자리까지만 |
| NFR-U1-18 | API 요청 본문 크기 제한: 기기 등록 1KB, 프로필 32KB. 초과 시 413 |
| NFR-U1-19 | 모든 통신은 HTTPS (Vercel·Supabase 기본) |

## 5. 유지보수성 · 테스트

| ID | 요구사항 |
|---|---|
| NFR-U1-20 | TypeScript `strict`, ESLint. 타입 검사·린트·테스트가 CI에서 통과해야 merge |
| NFR-U1-21 | **CI (Q2=A)**: GitHub Actions, push·PR마다 `typecheck` → `lint` → `test`(단위 + PBT). E2E는 수동 실행(`workflow_dispatch`)과 `main` 브랜치 push에서만 |
| NFR-U1-22 | **PBT-08**: CI는 실행마다 seed를 만들어 **로그에 출력**하고 테스트에 넘긴다. 실패 시 fast-check가 seed와 축소된(shrunk) 최소 반례를 출력한다. 로컬에서 같은 seed로 재현 가능해야 한다. shrinking을 끄지 않는다 |
| NFR-U1-23 | PBT 실패를 재시도로 덮지 않는다 (Vitest `retry` 사용 금지). 발견된 반례는 예시 기반 회귀 테스트로 추가한다 (PBT-10) |
| NFR-U1-24 | 테스트 파일 규칙: 예시 기반 `*.test.ts`, 속성 기반 `*.pbt.test.ts`, 공용 생성기 `_shared/__tests__/arbitraries/` (unit-of-work.md) |
| NFR-U1-25 | 저장소를 GitHub에 만든다 (공개 저장소 가정, `.gitignore`의 로컬 전용 파일 규칙 유지). 실제 가족 정보는 커밋하지 않는다 (NFR-2.6) |

## 6. 사용성 · 접근성

| ID | 요구사항 |
|---|---|
| NFR-U1-26 | 디자인 토큰(frontend-components.md §3)을 Tailwind 테마로 노출하고, 모든 Unit이 토큰만 쓴다 (임의 px 금지) |
| NFR-U1-27 | E2E에서 주요 화면마다 **자동 접근성 검사**(axe)를 돌려 WCAG AA 위반(대비·라벨·터치 영역) 0건을 확인한다 |
| NFR-U1-28 | 화면 언어 `lang="ko"`, 시스템 글꼴 확대 설정을 막지 않는다 (viewport `user-scalable` 금지 안 함) |

## 7. 지역 (Q6=A)

| ID | 요구사항 |
|---|---|
| NFR-U1-29 | Supabase 프로젝트 지역 **ap-northeast-2(서울)**, Vercel 함수 지역 **icn1(서울)** |

---

## PBT 준수 요약 (이 단계)

| 규칙 | 상태 | 비고 |
|---|---|---|
| PBT-08 | 준수 (요구사항으로 반영) | NFR-U1-21~23. 실제 CI 설정은 Code Generation에서 검증 |
| PBT-09 | 준수 | tech-stack-decisions.md §3 |
| 그 밖의 규칙 | N/A (이 단계) | |

Blocking finding 없음.
