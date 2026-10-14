# 모찌네 청약 알리미 — 작업 단위 (Unit of Work)

> 근거: unit-of-work-plan.md (Q-U1~U6 = 모두 A), application-design.md (C1~C32, S1~S6, AD-1~9)
> **배포 형태**: 서비스 1개 (Next.js on Vercel + Supabase 프로젝트 1개). Unit은 **개발 순서·모듈** 단위다.
> **진행 방식**: 1인 + AI, U1 → U6 순서로 한 Unit을 끝내고(설계 → 코드 → 승인) 다음 Unit으로 (Q-U2, Q-U3)

---

## Unit 목록

| Unit | 이름 | 한 줄 설명 |
|---|---|---|
| **U1** | setup-data-platform | 프로젝트 뼈대, 전체 DB 스키마·RLS, Repository, 기기 인증, 실제 Supabase·Vercel 생성·배포 |
| **U2** | eligibility-engine | `_shared` 도메인 순수 코드(매칭·분류·요건 병합·판정·점수·암호화·코덱) + 판정 재계산 서비스 + 기준 데이터 값 |
| **U3** | collection-pipeline | `collect` Edge Function: 소스 5개 수집, 정규화, AI 요약·요건 추출, upsert, 판정 재계산 호출 |
| **U4** | profile-settings | 입력 마법사, 프로필 동기화 API, 설정(알림 시각·지구·모드·모두 지우기) |
| **U5** | feed-detail | 피드·상세·판정 이유·AI 요약 표시·캘린더·관심 공고 |
| **U6** | pwa-push | 설치 안내, 서비스워커, 알림 구독, `dispatch` Edge Function, 알림 클릭 이동 |

---

## U1. setup-data-platform

- **책임**
  - Next.js 14(App Router)·TypeScript strict·Tailwind·Vitest·fast-check·Playwright 셋업, `@shared/*` 경로 별칭
  - `supabase/migrations/`: **전체 테이블 구조**(districts, notices, housing_units, supply_type_standards, income_asset_thresholds, devices, device_profiles, push_subscriptions, judgements, notification_log, collect_runs), 인덱스, **RLS(anon 전면 차단)**
  - Repository C17~C20 (Node용 구현, Deno용은 같은 인터페이스를 U3·U6에서 사용)
  - C21 DeviceAuth, C23 DeviceIdentity, `POST /api/device`
  - C32 AppChrome 뼈대 (레이아웃, 하단 메뉴, 공통 글씨 크기 토큰)
  - **실제 Supabase 프로젝트·Vercel 프로젝트 생성, 환경 변수·시크릿 연결, 뼈대 배포** (Q-U5)
- **포함 컴포넌트**: C17, C18, C19, C20, C21, C22(일부: `/api/device`), C23, C32
- **범위 밖**: 기준 데이터의 실제 값(→ U2), 화면 기능
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 엔티티·관계·제약 | ✅ **PBT-09** fast-check·Playwright 선정, 키·시크릿 관리 | ✅ RLS·서버 키 경유·토큰 해시 패턴 | ✅ Supabase·Vercel·시크릿 | ✅ |

## U2. eligibility-engine

- **책임**
  - `_shared` C1~C8: 타입, 지구 매칭, 공급유형 분류, 요건 병합(AD-7), 판정(조건별 evaluator), 점수, AES-GCM 암호화, 프로필 코덱
  - S2 JudgementService (`recomputeForDevice`, `recomputeAll`), 피드·알림 공용 **노출 조건 정의**
  - 기준 데이터 **값** 시드: 6개 지구·키워드, 연도별 소득·자산 기준표, 공급유형 표준 요건 (Q-U6)
  - 열린 이슈 결정: OI-1(세대주 항목), OI-2(나이 기준일), OI-3(면적 구간·점수 가중치)
- **포함 컴포넌트**: C1~C8, S2
- **범위 밖**: DB 접속 코드(→ U1 Repository), 화면
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 판정 규칙, **PBT-01 속성 식별** | ✅ 재계산 성능, 암호화 요건 | ✅ 키 로드·복호화 경계, 순수성 유지 | ❌ 인프라 변경 없음 (시드는 마이그레이션 파일) | ✅ 예시 테스트 + PBT |

## U3. collection-pipeline

- **책임**
  - C9 Collector 인터페이스 + 어댑터 5개(청약홈 15098547, LH 15088707, 마이홈 단지 15110581, SH, GH), C10 MockProvider
  - C11 Normalizer, C12 AiSummarizer(Gemini: 요약 + 요건 추출, 공고 정보만), C13 CollectRunLog
  - S1 CollectionService = `supabase/functions/collect/` (소스별 실패 격리, upsert, `recomputeAll` 호출)
  - 열린 이슈 OI-4(수집 시각과 0시 알림) 결정
- **포함 컴포넌트**: C9~C13, S1
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 정규화·매칭 적용·추출 검증·재실행 규칙, PBT-01 | ✅ 실행 시간 제한, Gemini 호출 한도, 0건 경고 | ✅ 실패 격리·재시도·멱등 upsert | ✅ `collect` 배포, 매일 cron, API 키 시크릿 | ✅ |

## U4. profile-settings

- **책임**
  - C24 LocalProfileStore(기기 저장 + 동기화 대기열), C25 ProfileWizard(단계별 입력), C29 SettingsView, C30 DisplayMode
  - S3 API: `PUT /api/profile`, `PUT /api/notify-settings`, `DELETE /api/device`
  - 처음 실행 안내(US-02), OI-1 결과를 마법사에 반영
- **포함 컴포넌트**: C22(일부), C24, C25, C29, C30, S3
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 마법사 단계·검증·단위 실수 방지·동기화 규칙 | ❌ (NFR-1 접근성은 FD·코드에서 처리, 새 기술 없음) | ❌ | ❌ | ✅ |

## U5. feed-detail

- **책임**
  - S4 API: `GET /api/feed`, `GET /api/notices/[id]`
  - C26 FeedView(카드·배지·정렬·빈 상태), C27 NoticeDetailView(타임라인·세대수·판정 사유·AI 요약·원문·캘린더), C28 BookmarkStore + 관심 공고 화면
- **포함 컴포넌트**: C22(일부), C26, C27, C28, S4
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 정렬·D-day·타임라인·캘린더 규칙, PBT-01 | ❌ (NFR-4.1 3초 목표는 FD에 기록) | ❌ | ❌ | ✅ |

## U6. pwa-push

- **책임**
  - C31 PwaShell: `manifest.json`, `public/sw.js`, 설치 안내(Android 프롬프트 / iOS 그림 안내), 권한·구독(`POST /api/push/subscribe`), 알림 클릭 이동
  - C14 DispatchPlanner, C15 PushSender, C16 NotificationLedger, S5 = `supabase/functions/dispatch/`
  - 열린 이슈 OI-5(첫 알림에서 기존 공고를 셀지) 결정
- **포함 컴포넌트**: C14~C16, C22(일부), C31, S5, S6
- **CONSTRUCTION 단계**

  | Functional Design | NFR Requirements | NFR Design | Infrastructure Design | Code Generation |
  |:-:|:-:|:-:|:-:|:-:|
  | ✅ 대상 선정·문구·이동 규칙, PBT-01 | ✅ 멱등 발송, iOS 제약, VAPID | ✅ 이력 유일 제약·구독 정리 패턴 | ✅ `dispatch` 배포, 매시 cron, VAPID 시크릿 | ✅ |

---

## 코드 구성 전략 (Greenfield)

규칙의 기본 패턴(모놀리스: `src/{unit-name}/`, `tests/{unit-name}/`) 대신, **Next.js App Router와 Supabase가 정한 폴더 규칙**을 따른다. 라우트(`src/app/`)와 Edge Function(`supabase/functions/`) 위치는 프레임워크가 강제하기 때문이다. Unit과 폴더의 대응은 아래 표로 관리한다.

```text
/ (workspace root)
  package.json, tsconfig.json, next.config.js, tailwind.config.ts,
  vitest.config.ts, playwright.config.ts, .env.example
  src/
    app/                      U4·U5·U6 화면, U1·U4·U5·U6 API (route.ts)
      api/device/             U1
      api/profile/            U4
      api/notify-settings/    U4
      api/feed/               U5
      api/notices/[id]/       U5
      api/push/subscribe/     U6
    features/
      app-chrome/             U1
      device/                 U1 (DeviceIdentity)
      profile/                U4 (LocalProfileStore, ProfileWizard)
      settings/               U4 (SettingsView, DisplayMode)
      feed/                   U5
      detail/                 U5
      bookmarks/              U5
      pwa/                    U6
    server/
      db/                     U1 (Node Repository 구현, supabase admin 클라이언트)
      auth/                   U1 (DeviceAuth)
      services/               U4 (ProfileService), U5 (FeedService)
  public/
    manifest.json, sw.js, icons/   U6 (아이콘 자리는 U1)
  supabase/
    migrations/               U1 (스키마·RLS), U2 (기준 데이터 시드)
    functions/
      _shared/                U2 (도메인 순수 코드, Node·Deno 공용)
        db/                   U1 (Repository 인터페이스 + Deno 구현)
      collect/                U3
      dispatch/               U6
  e2e/                        Playwright E2E (U4·U5·U6 스토리 시나리오)
```

**테스트 위치**
- 단위·예시 기반 테스트: 대상 파일 옆 `__tests__/*.test.ts` (cheongYak-radar와 같은 방식)
- 속성 기반 테스트: 같은 폴더의 `__tests__/*.pbt.test.ts`로 **파일 이름으로 구분** (PBT-10)
- 공용 생성기(generator): `supabase/functions/_shared/__tests__/arbitraries/` (PBT-07 재사용)
- 통합 테스트(목업 응답): `supabase/functions/collect/__tests__/`, `supabase/functions/dispatch/__tests__/`
- E2E: `e2e/`

**`_shared` import 규칙**
- Deno: 상대경로 + `.ts` 확장자 포함 (`../_shared/eligibility/engine.ts`)
- Next.js: `@shared/*` → `supabase/functions/_shared/*` (tsconfig paths, `allowImportingTsExtensions` 설정은 NFR Requirements에서 확정)
- `_shared` 안에서는 npm/Deno 전용 모듈을 import하지 않는다

---

## cheongYak-radar 재사용 후보 (Q-U4: Unit별 Code Generation 계획에서 확정)

| Unit | 가져올 후보 (`../cheongYak-radar/`) | 비고 |
|---|---|---|
| U1 | `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `src/lib/supabase/admin.ts`, `src/features/nav/BottomNav.tsx` | 로그인·세션 관련(`session.ts`, `middleware.ts`)은 가져오지 않음 |
| U2 | `supabase/functions/collect/recommend/{matcher,scorer,weights,criteria-2026}.ts` | 신혼부부 기준이라 **구조만 참고**, 규칙은 새로 작성 |
| U3 | `supabase/functions/collect/collectors/*`, `normalize.ts`, `mock.ts`, `analyze.ts`, `src/features/notices/upserter.ts` | 지구 매칭·요건 추출 단계 추가 |
| U4 | `src/features/profile/{ProfileForm.tsx,repository.ts}`, `src/app/api/profile/route.ts` | 로그인 대신 기기 인증, 마법사로 재구성 |
| U5 | `src/features/detail/{timeline,calendar-link,ScheduleTimeline,AreaInfo,SourceLink}`, `src/features/feed/{dday,DdayBadge,EligibilityBadge}`, `src/features/bookmarks/{store,BookmarkButton}` | 큰 글씨·쉬운 말로 수정, 판정 배지 3종 → 2종(충족·확인 필요) |
| U6 | `public/sw.js`, `src/features/pwa/{InstallBanner,RegisterSW}`, `src/features/notifications/push-client.ts`, `supabase/functions/collect/push.ts`, `src/app/api/subscribe/route.ts` | 발송을 `dispatch` 함수로 분리, iOS 안내 추가 |
