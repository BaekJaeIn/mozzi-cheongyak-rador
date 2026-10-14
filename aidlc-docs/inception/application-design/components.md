# 모찌네 청약 알리미 — 컴포넌트 정의

> 근거: requirements.md, stories.md, application-design-plan.md (Q-A1~A8 = A, A, A, A, A, A, C, A)
> 상세 비즈니스 규칙은 Functional Design(CONSTRUCTION, Unit별)에서 정한다.

## 설계 결정 요약

| ID | 결정 | 근거 |
|---|---|---|
| AD-1 | 단일 저장소: Next.js 앱이 루트, `supabase/`(migrations, functions)는 하위 폴더 | Q-A1 |
| AD-2 | 판정·매칭·분류·점수·암호화 같은 **도메인 순수 코드**는 `supabase/functions/_shared/`에 외부 라이브러리 없이 둔다. Deno는 상대경로로, Next.js는 tsconfig 경로 별칭 `@shared/*`로 import | Q-A2, FR-5.6 |
| AD-3 | 판정 결과는 **미리 계산해 `judgements` 테이블에 저장**. 피드와 알림은 같은 테이블을 읽음 | Q-A3, US-10 |
| AD-4 | 기기 요청은 **Next.js Route Handler**를 거침(서버 전용 키). Edge Function은 예약 작업(`collect`, `dispatch`)만 | Q-A4, NFR-2.2 |
| AD-5 | 기기 확인 = **device_id + 비밀 토큰**, 서버에는 토큰 해시만 저장 | Q-A5 |
| AD-6 | Edge Function 2개: `collect`(매일 새벽), `dispatch`(매시 정각) | Q-A6, NFR-5.3 |
| AD-7 | 공고 자격 요건 = **공급유형 표준 요건표 + Gemini 추출값 보정**, 둘이 다르면 해당 조건은 "확인 필요" | Q-A7, Q6=A |
| AD-8 | 판정 규칙은 **TypeScript 순수 함수**, 기준값(연도별 소득 기준표·지구·표준 요건)은 **DB 데이터** | Q-A8, NFR-7.2 |
| AD-9 | 암호화는 **WebCrypto(AES-GCM)**로 구현. Node 18+와 Deno에서 같은 코드가 동작 | NFR-2.3 |

## 폴더 배치 (개략)

```text
/                         Next.js 14 App Router 루트
  src/app/                화면(page) + API(route handler)
  src/features/           화면 기능별 컴포넌트·클라이언트 로직
  src/server/             Next 서버 전용 서비스(기기 인증, 프로필, 피드)
  public/sw.js            서비스워커
  supabase/
    migrations/           스키마, RLS, 시드(지구, 기준표, 표준 요건)
    functions/
      _shared/            도메인 순수 코드 (Node/Deno 공용)
      collect/            매일 수집 Edge Function
      dispatch/           매시 발송 Edge Function
```

---

## 1. 공용 도메인 컴포넌트 (`supabase/functions/_shared/`, Node/Deno 공용, 순수 함수)

| ID | 컴포넌트 | 책임 | 인터페이스 요약 | 관련 |
|---|---|---|---|---|
| C1 | **DomainTypes** | 공고·주택형·지구·프로필·요건·판정 등 공통 타입 정의 | TS 타입만 export | 전체 |
| C2 | **DistrictMatcher** | 공고명·공급위치·단지명을 지구 키워드와 시군구로 매칭해 지구 ID 목록 반환 | `matchDistricts()` | FR-2 |
| C3 | **SupplyTypeClassifier** | 원천 공고·주택형을 공급유형 코드로 분류, 쉬운 말 라벨 제공 | `classify()`, `plainLabel()` | FR-3 |
| C4 | **RequirementResolver** | 공급유형 표준 요건 + AI 추출 요건을 합쳐 최종 요건 생성. 두 값이 다르면 해당 조건을 `unknown`으로 표시 | `resolveRequirements()` | FR-5, AD-7 |
| C5 | **EligibilityEngine** | 프로필 × 요건 → 조건별 판정(나이·무주택·소득·자산·통장·거주·세대) → 주택형별·공고별 결과(충족/미충족/확인 필요)와 사유 | `judgeNotice()`, `judgeUnit()`, 조건별 evaluator | FR-5, US-12·14 |
| C6 | **Recommender** | 판정 통과 공고의 추천 점수(지구·면적·분양/임대·저층·마감 임박) 계산 | `score()` | FR-5.7, US-07 |
| C7 | **AmountCipher** | 소득·자산 금액 암호화/복호화 (AES-GCM, WebCrypto) | `encrypt()`, `decrypt()` | NFR-2.3 |
| C8 | **ProfileCodec** | 프로필 ↔ 저장 형식(JSON, 암호화 필드 포함) 직렬화·역직렬화, 스키마 버전 관리 | `encode()`, `decode()` | FR-4.3, PBT-02 |

## 2. 수집 컴포넌트 (`supabase/functions/collect/`, Deno)

| ID | 컴포넌트 | 책임 | 인터페이스 요약 | 관련 |
|---|---|---|---|---|
| C9 | **Collector** (인터페이스) + 어댑터 5개 | 소스별 원천 데이터 수집: `ApplyHomeCollector`(15098547), `LhRentalCollector`(15088707), `MyhomeComplexCollector`(15110581, 단지 보강), `ShCollector`(HTML), `GhCollector`(HTML) | `collect(ctx)` → `RawNotice[]` | FR-1.1 |
| C10 | **MockProvider** | API 키 없음/개발 모드일 때 목업 원천 데이터 제공 | `collect(ctx)` | FR-1.4 |
| C11 | **Normalizer** | 원천 데이터를 공통 `Notice`/`HousingUnit` 형태로 변환 (날짜·면적·금액 정규화) | `normalize()` | FR-1.2 |
| C12 | **AiSummarizer** | Gemini로 쉬운 말 요약 + 자격 요건 JSON 추출 (공고 정보만 전송) | `summarize()`, `extractRequirements()` | FR-6, AD-7 |
| C13 | **CollectRunLog** | 소스별 성공/실패·건수·0건 경고 기록 | `record()` | FR-1.3, NFR-3.3 |

## 3. 발송 컴포넌트 (`supabase/functions/dispatch/`, Deno)

| ID | 컴포넌트 | 책임 | 인터페이스 요약 | 관련 |
|---|---|---|---|---|
| C14 | **DispatchPlanner** | 현재 KST 시각을 알림 시각으로 정한 기기를 고르고, 기기별로 아직 알리지 않은 충족·확인 필요 공고를 `judgements`에서 선정 | `plan()` | FR-11.3, US-10 |
| C15 | **PushSender** | VAPID Web Push 발송, 404/410이면 구독 삭제 | `send()` | FR-11.3, 11.5 |
| C16 | **NotificationLedger** | 기기 × 공고 알림 이력 기록, 중복 발송 방지 (유일 제약) | `markNotified()`, `filterUnnotified()` | NFR-3.2 |

## 4. 데이터 접근 컴포넌트 (Repository, 런타임별 구현)

| ID | 컴포넌트 | 책임 | 사용하는 쪽 |
|---|---|---|---|
| C17 | **NoticeRepository** | 공고·주택형 upsert(소스+공고번호), 열린 공고 조회, 상세 조회 | collect, Next 서버 |
| C18 | **ReferenceDataRepository** | 지구, 연도별 소득·자산 기준표, 공급유형 표준 요건 조회 | collect, Next 서버 |
| C19 | **DeviceRepository** | 기기(토큰 해시·알림 시각·켜짐), 암호화 프로필, 푸시 구독 CRUD, 전체 삭제 | Next 서버, dispatch |
| C20 | **JudgementRepository** | 기기 × 공고 판정 결과·사유·점수 저장/조회 | collect, Next 서버, dispatch |

## 5. Next.js 서버 컴포넌트 (`src/server/`, `src/app/api/`)

| ID | 컴포넌트 | 책임 | 관련 |
|---|---|---|---|
| C21 | **DeviceAuth** | 요청 헤더의 device_id + 토큰을 해시 대조로 확인. 실패하면 401 | AD-5 |
| C22 | **API Routes** | `POST /api/device`(등록), `PUT /api/profile`, `DELETE /api/device`(모두 지우기), `PUT /api/notify-settings`, `POST /api/push/subscribe`, `GET /api/feed`, `GET /api/notices/[id]` | AD-4 |

## 6. 클라이언트 컴포넌트 (`src/features/`, 브라우저)

| ID | 컴포넌트 | 책임 | 관련 스토리 |
|---|---|---|---|
| C23 | **DeviceIdentity** | 최초 실행 시 device_id·비밀 토큰 생성·보관(localStorage), API 요청 헤더 첨부 | US-02 |
| C24 | **LocalProfileStore** | 프로필 원본·마법사 진행 상태 보관, 서버 동기화 대기열(실패 시 다음 실행 때 재전송) | US-04~08, 18 |
| C25 | **ProfileWizard** | 단계별 입력 화면 (기본·거주 → 주택·통장 → 소득·자산 → 지구·선호 → 확인 → 알림) | US-04~08 |
| C26 | **FeedView** | 맞춤 피드 카드, 판정 배지, D-day, NEW, 빈 상태 안내 | US-12 |
| C27 | **NoticeDetailView** | 일정 타임라인, 면적별 세대수, 판정 사유, AI 요약, 원문·캘린더 버튼 | US-13~16 |
| C28 | **BookmarkStore** + 관심 공고 화면 | localStorage 북마크, 마감 표시, 지우기 | US-17 |
| C29 | **SettingsView** | 항목별 수정, 관심 지구, 알림 시각·켜기/끄기, 화면 모드, 모두 지우기 | US-09, 18~20 |
| C30 | **DisplayMode** | 일반/쉬운 모드 상태와 글씨·버튼 배율 적용 (CSS 변수) | US-19, NFR-1.1 |
| C31 | **PwaShell** | `sw.js` 등록, 설치 안내(Android 설치 프롬프트 / iOS 그림 안내), 알림 권한·구독, 알림 클릭 이동 | US-01, 03, 11 |
| C32 | **AppChrome** | 하단 메뉴, 공통 레이아웃, 오류 안내 문구 | 공통 인수 기준 |

## 7. 데이터 저장소 (개략, 스키마는 Functional/Infrastructure Design에서 확정)

| 저장소 | 내용 | 접근 |
|---|---|---|
| `districts` | 지구명·시도·시군구·키워드 | 서버 전용 읽기 (공개 정보지만 Next 경유) |
| `notices`, `housing_units` | 정규화 공고, 주택형, 공급유형, 최종 요건, AI 요약 | collect 쓰기, Next 읽기 |
| `supply_type_standards` | 공급유형별 표준 요건 | 시드 데이터 |
| `income_asset_thresholds` | 연도별 소득·자산 기준표 | 시드 데이터 |
| `devices` | device_id, 토큰 해시, 알림 시각, 알림 켜짐 | Next 서버, dispatch |
| `device_profiles` | 프로필(금액 필드 암호화), 스키마 버전 | Next 서버, collect(판정 재계산) |
| `push_subscriptions` | 구독 정보 | Next 서버, dispatch |
| `judgements` | 기기 × 공고 결과·조건별 사유·점수·계산 시각 | collect·Next 쓰기, Next·dispatch 읽기 |
| `notification_log` | 기기 × 공고 알림 이력 (유일 제약) | dispatch |
| `collect_runs` | 수집 실행 로그 | collect |
| 기기 localStorage | 프로필 원본, device_id·토큰, 북마크, 화면 모드, 동기화 대기열 | 브라우저 |

모든 테이블은 RLS로 anon 접근을 막고, 서버 전용 키(Next 서버·Edge Function)로만 접근한다 (NFR-2.2).
