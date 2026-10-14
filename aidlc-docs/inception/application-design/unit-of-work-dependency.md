# 모찌네 청약 알리미 — Unit 의존 관계

---

## 1. 의존 매트릭스

행 Unit이 열 Unit에 의존하면 ✅ (빌드·실행 시점에 그 Unit의 산출물이 필요함).

| From \ To | U1 | U2 | U3 | U4 | U5 | U6 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **U1** setup-data-platform | – | | | | | |
| **U2** eligibility-engine | ✅ 테이블 구조·Repository 인터페이스 | – | | | | |
| **U3** collection-pipeline | ✅ notices·collect_runs 테이블, Deno Repository | ✅ 매칭·분류·요건 병합·`recomputeAll` | – | | | |
| **U4** profile-settings | ✅ devices·device_profiles, DeviceAuth, DeviceIdentity | ✅ ProfileCodec·AmountCipher·`recomputeForDevice` | | – | | |
| **U5** feed-detail | ✅ judgements·notices 조회, DeviceAuth | ✅ 노출 조건, 공급유형 쉬운 말 라벨 | ◐ 실제 데이터(목업으로 대체 가능) | ◐ 프로필이 있어야 의미 있는 피드(테스트는 시드 프로필로 대체) | – | |
| **U6** pwa-push | ✅ push_subscriptions·notification_log | ✅ 노출 조건(피드와 동일) | ◐ 판정할 공고 | ✅ 알림 시각·켜기 설정(`/api/notify-settings`) | ◐ 알림 클릭 이동 대상 화면 | – |

✅ = 필수 의존, ◐ = 실행 시 있으면 좋지만 목업·시드로 대체 가능

**순환 의존 없음**: 모든 의존이 앞 번호 Unit으로만 향한다 (U1 ← U2 ← U3 / U4 ← U5 ← U6).

---

## 2. 개발 순서 (Q-U2 = A)

```text
U1 setup-data-platform
 -> U2 eligibility-engine
     -> U3 collection-pipeline
         -> U4 profile-settings
             -> U5 feed-detail
                 -> U6 pwa-push
                     -> Build and Test (전체)
```

- 1인 개발(Q-U3)이라 병렬 진행 없음. 한 Unit의 Code Generation이 승인되면 다음 Unit의 Functional Design 시작
- U1에서 실제 Supabase·Vercel을 만들기 때문에(Q-U5) 이후 Unit은 마이그레이션·함수·화면을 그때그때 배포·확인

---

## 3. Unit 사이 계약 (Contracts)

다음 Unit이 앞 Unit을 믿고 쓸 수 있도록, 아래 계약은 앞 Unit의 Code Generation에서 확정하고 이후 바꿀 때는 영향 Unit을 함께 고친다.

| 계약 | 제공 | 사용 | 내용 |
|---|---|---|---|
| K1 DB 스키마 | U1 | U2~U6 | 테이블·컬럼·유일 제약(공고: 소스+공고번호, 알림 이력: 기기+공고), RLS |
| K2 Repository 인터페이스 | U1 | U2~U6 | `_shared/db/` 인터페이스 (Node 구현은 `src/server/db/`, Deno 구현은 `_shared/db/`) |
| K3 기기 인증 헤더 | U1 | U4, U5, U6 | `x-device-id`, `x-device-token`, 실패 시 401 |
| K4 도메인 타입 | U2 | U3~U6 | `Notice`, `HousingUnit`, `Requirements`, `HouseholdProfile`, `NoticeJudgement`, `Verdict` |
| K5 노출 조건 | U2 | U5, U6 | 판정 충족·확인 필요 + 열린 공고 + 관심 지구. 피드와 알림이 **같은 정의**를 import |
| K6 판정 재계산 API | U2 | U3, U4 | `recomputeAll(asOf)`, `recomputeForDevice(deviceId, asOf)` |
| K7 프로필 저장 API | U4 | U5(빈 상태 안내), U6 | `PUT /api/profile`, `PUT /api/notify-settings` 형식 |
| K8 공고 상세 URL | U5 | U6 | `/notice/[id]`, 피드 `/` (알림 클릭 이동 대상) |

---

## 4. 공유 자원

| 자원 | 소유 Unit | 함께 쓰는 Unit | 주의 |
|---|---|---|---|
| Supabase 프로젝트·마이그레이션 | U1 | 전체 | 마이그레이션 파일은 번호 순서로만 추가 (U2 시드, U3·U6 cron) |
| 서버 전용 키·암호화 키·VAPID 키 | U1(등록 체계) | U2, U3, U4, U6 | 저장소에 커밋 금지 (NFR-2.4) |
| `_shared/` 폴더 | U2 | U1(db 인터페이스), U3~U6 | Deno·Node 양쪽 호환 유지 |
| fast-check 공용 생성기 | U2 | U3~U6 | `_shared/__tests__/arbitraries/` |
