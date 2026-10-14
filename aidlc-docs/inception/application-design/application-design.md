# 모찌네 청약 알리미 — 애플리케이션 설계 (통합본)

> 세부 문서: [components.md](components.md) · [component-methods.md](component-methods.md) · [services.md](services.md) · [component-dependency.md](component-dependency.md)
> 근거: requirements.md, stories.md, application-design-plan.md (Q-A1~A8)

---

## 1. 설계 결정

| ID | 결정 | 근거 |
|---|---|---|
| AD-1 | 단일 저장소 (Next.js 루트 + `supabase/`) | Q-A1 |
| AD-2 | 도메인 순수 코드는 `supabase/functions/_shared/`. Deno는 상대경로, Next는 `@shared/*` 별칭으로 import | Q-A2, FR-5.6 |
| AD-3 | 판정 결과를 `judgements`에 미리 계산해 저장. 피드·알림은 같은 결과를 읽음 | Q-A3, US-10 |
| AD-4 | 기기 요청은 Next Route Handler 경유. Edge Function은 예약 작업만 | Q-A4, NFR-2.2 |
| AD-5 | device_id + 비밀 토큰 (서버는 해시만 저장) | Q-A5 |
| AD-6 | Edge Function `collect`(매일) / `dispatch`(매시) | Q-A6 |
| AD-7 | 요건 = 공급유형 표준 요건 + Gemini 추출 보정, 불일치는 "확인 필요" | Q-A7 |
| AD-8 | 판정 규칙은 TS 순수 함수, 기준값은 DB 데이터 | Q-A8 |
| AD-9 | 금액 암호화는 WebCrypto AES-GCM (Node·Deno 공용) | NFR-2.3 |

## 2. 컴포넌트 (32개)

| 영역 | 컴포넌트 |
|---|---|
| 공용 도메인 `_shared` (순수) | C1 DomainTypes, C2 DistrictMatcher, C3 SupplyTypeClassifier, C4 RequirementResolver, C5 EligibilityEngine, C6 Recommender, C7 AmountCipher, C8 ProfileCodec |
| 수집 `collect` | C9 Collector + 어댑터 5개(청약홈, LH, 마이홈 단지, SH, GH), C10 MockProvider, C11 Normalizer, C12 AiSummarizer, C13 CollectRunLog |
| 발송 `dispatch` | C14 DispatchPlanner, C15 PushSender, C16 NotificationLedger |
| 데이터 접근 | C17 NoticeRepository, C18 ReferenceDataRepository, C19 DeviceRepository, C20 JudgementRepository |
| Next 서버 | C21 DeviceAuth, C22 API Routes (7개 엔드포인트) |
| 클라이언트 | C23 DeviceIdentity, C24 LocalProfileStore, C25 ProfileWizard, C26 FeedView, C27 NoticeDetailView, C28 BookmarkStore, C29 SettingsView, C30 DisplayMode, C31 PwaShell, C32 AppChrome |

## 3. 서비스 (6개)

| 서비스 | 위치 | 트리거 | 핵심 흐름 |
|---|---|---|---|
| S1 CollectionService | Edge `collect` | 매일 새벽 cron | 수집(소스별 격리) → 정규화 → 지구 매칭 → 분류 → 요건 확정 → upsert → 요약 → S2.recomputeAll |
| S2 JudgementService | `_shared` + 런타임별 Repository | S1, S3 | 프로필 복호화 → 판정 → 점수 → `judgements` 저장 |
| S3 ProfileService | Next API | 기기 요청 | 인증 → 검증 → 암호화 저장 → S2.recomputeForDevice / 모두 지우기 |
| S4 FeedService | Next API | 기기 요청 | 인증 → `judgements`(충족·확인 필요, 열린 공고, 관심 지구) → 정렬 |
| S5 NotificationService | Edge `dispatch` | 매시 정각 cron | 대상 기기 → 보이는 공고 − 알린 공고 → 발송 → 이력 / 구독 정리 |
| S6 PwaService | 브라우저 | 사용자 조작 | 설치 안내, 권한·구독, 알림 클릭 이동 |

## 4. 의존 원칙

- `_shared`는 DB·네트워크·런타임 전용 API를 쓰지 않는다 → Vitest로 단위 테스트와 PBT를 바로 돌릴 수 있음
- 브라우저는 Supabase에 직접 접근하지 않는다
- 피드와 알림은 판정을 직접 계산하지 않고 `judgements`만 읽는다 (일치 보장)
- Gemini 호출 경로와 프로필 읽기 경로는 분리한다

전체 구조도(Mermaid + 텍스트 대안)와 데이터 흐름 F1~F4는 [component-dependency.md](component-dependency.md)를 참조한다.

## 5. 스토리 · 요구사항 대응

| 스토리 | 주요 컴포넌트 / 서비스 |
|---|---|
| US-01 설치, US-03 알림 허용, US-11 알림 클릭 | C31 PwaShell, S6, `POST /api/push/subscribe` |
| US-02 처음 실행 | C23 DeviceIdentity, `POST /api/device`, C32 |
| US-04~08 입력 마법사 | C25, C24, S3, C7, C8 |
| US-09 알림 시각 | C29, `PUT /api/notify-settings`, C19 |
| US-10 하루 1번 알림 | S5 (C14~C16), C20 |
| US-12 피드 | S4, C26, C20, (S2·C5·C6) |
| US-13~16 상세·판정 이유·요약·캘린더 | S4, C27, C12(요약 생성) |
| US-17 관심 공고 | C28 |
| US-18 정보 수정, US-20 모두 지우기 | C29, S3 |
| US-19 쉬운 모드 | C30 |
| FR-1~3 수집·매칭·분류 | S1, C2, C3, C9~C13 |
| FR-5 판정 | C4, C5, S2 |

## 6. 열린 이슈

| ID | 내용 | 결정 단계 |
|---|---|---|
| OI-1 | 세대주 여부 항목 추가 | Functional Design |
| OI-2 | 나이 판정 기준일 | Functional Design |
| OI-3 | 면적 구간·점수 가중치 | Functional Design |
| OI-4 | 수집 시각과 0시 알림 관계 | Infrastructure Design |
| OI-5 | 첫 알림에서 기존 열린 공고를 "새 공고"로 셀지 | Functional Design |

## 7. 설계 점검

- [x] 모든 FR(1~11)이 하나 이상의 컴포넌트·서비스에 연결됨
- [x] 모든 스토리(US-01~20)가 컴포넌트에 연결됨
- [x] NFR-2 최소 보호: RLS + 서버 키 경유(AD-4), 금액 암호화(AD-9), 기기 토큰(AD-5), Gemini 경로 분리
- [x] NFR-3.2 재실행 안전: upsert 유일 키(C17), 알림 이력 유일 제약(C16)
- [x] PBT 대비: 판정·매칭·분류·요건 병합·코덱·암호화가 순수 함수로 분리됨 (PBT-01 대상은 Functional Design에서 식별)

## 8. PBT 준수 요약 (이 단계)

| 규칙 | 상태 | 비고 |
|---|---|---|
| PBT-01 | N/A (이 단계) | 속성 식별은 Functional Design 산출물. 단, 대상 후보(C2·C4·C5·C6·C7·C8)를 순수 함수로 분리해 둠 |
| PBT-02 ~ PBT-10 | N/A (이 단계) | 코드·테스트 단계 규칙 |

Blocking finding 없음.
