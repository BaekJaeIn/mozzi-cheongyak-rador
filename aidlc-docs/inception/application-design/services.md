# 모찌네 청약 알리미 — 서비스 정의 · 오케스트레이션

> 서비스 = 여러 컴포넌트를 묶어 하나의 업무 흐름을 수행하는 계층. 컴포넌트 ID는 components.md 참조.

---

## S1 CollectionService: 매일 수집 (Edge Function `collect`)

- **실행**: pg_cron, 매일 KST 새벽 1회 (정확한 시각은 Infrastructure Design에서. 가장 이른 알림 시각인 0시보다 앞서거나, 0시 알림은 전날 수집분 기준이라는 규칙을 정해야 함)
- **책임**: 수집 → 정규화 → 지구 매칭 → 공급유형 분류 → 요건 확정 → 저장 → 요약 → 판정 재계산
- **흐름**
  1. C18 기준 데이터 로드 (지구, 기준표, 표준 요건)
  2. 소스별로 C9 Collector(또는 C10 Mock) 실행. **소스마다 try/catch로 격리**하고 결과를 C13에 기록 (FR-1.3, NFR-3.1)
  3. C11 정규화 → C2 지구 매칭 (지구 없음 → 제외, FR-2.4) → C3 공급유형 분류
  4. 신규·변경 공고만 C12로 요건 추출 → C4로 표준 요건과 병합 (AD-7)
  5. C17 upsert (소스+공고번호 유일, 재실행 안전)
  6. 요약이 없는 공고만 C12 요약 (실패하면 다음 실행에서 재시도, FR-6.3)
  7. **S2.recomputeAll()**: 모든 활성 기기 × 열린 공고 판정 재계산 (나이가 날짜에 따라 바뀌므로 매일 전체 재계산)
- **오류 처리**: 한 단계·소스 실패가 전체를 멈추지 않음. 실행 요약을 C13에 남김

## S2 JudgementService: 판정 계산·저장 (`_shared` 오케스트레이터 + 런타임별 Repository 주입)

- **사용하는 쪽**: S1(collect, Deno), S3(Next 서버, Node)
- **책임**: 프로필 복호화 → C5 판정 → C6 점수 → C20 저장
- **메서드**
  - `recomputeForDevice(deviceId, asOf)`: 프로필 저장 직후 호출 (US-18 "피드 판정이 바로 바뀐다")
  - `recomputeAll(asOf)`: 일일 수집 뒤 호출
- **원칙**: 피드(S4)와 알림(S5)은 **판정을 직접 계산하지 않고** 이 서비스가 저장한 `judgements`만 읽는다 (AD-3, US-10 일치 보장)

## S3 ProfileService: 프로필 동기화 (Next Route Handler)

- **진입점**: `POST /api/device`, `PUT /api/profile`, `PUT /api/notify-settings`, `DELETE /api/device`
- **흐름 (`PUT /api/profile`)**
  1. C21 DeviceAuth
  2. 입력 검증 (형식·범위)
  3. C8 ProfileCodec.encode (C7로 금액 암호화) → C19 저장
  4. S2.recomputeForDevice
- **흐름 (`DELETE /api/device`)**: 인증 → C19.deleteAll (프로필·구독·판정·알림 이력) → 204
- **클라이언트 쪽 짝**: C24 LocalProfileStore가 저장을 먼저 기기에 하고, 서버 실패 시 대기열에 넣었다가 다음 실행 때 `flushSync()` (US-08)

## S4 FeedService: 피드·상세 조회 (Next Route Handler)

- **진입점**: `GET /api/feed`, `GET /api/notices/[id]`
- **흐름 (피드)**: C21 인증 → C20.listVisible(기기, 오늘) → 공고 정보 결합 → 정렬(접수 중 > 접수 예정, 그 안에서 점수·마감 임박) → 응답
- **흐름 (상세)**: 공고는 피드 밖(미충족·마감)이어도 반환하고, 이 기기의 판정 사유를 함께 반환 (US-13, 14)
- **노출 규칙**: 미충족 숨김, 마감 제외, 관심 지구만 (US-12)

## S5 NotificationService: 매시 발송 (Edge Function `dispatch`)

- **실행**: pg_cron, 매시 정각
- **흐름**
  1. C14 plan(현재 KST 시각): `notify_hour = 현재 시각`이고 알림 켜짐이며 구독이 있는 기기
  2. 기기별: C20에서 보이는 공고(충족·확인 필요, 열린 공고, 관심 지구) → C16.filterUnnotified
  3. 0건이면 건너뜀. 아니면 C15.buildPayload → send
  4. 발송 결과 `sent` → C16.markNotified, `gone` → 구독 삭제
- **멱등성**: 같은 시각에 다시 실행돼도 C16 이력 때문에 중복 발송 없음 (NFR-3.2)
- **일치 보장**: 2단계는 S4 피드와 **같은 조회 조건**을 쓴다 (공유 쿼리 정의)

## S6 PwaService: 설치·구독·알림 이동 (클라이언트)

- C31 PwaShell: 서비스워커 등록, Android 설치 프롬프트 / iOS 단계 안내, 알림 권한 요청(사용자가 버튼을 눌렀을 때만), 구독 → `POST /api/push/subscribe`
- `sw.js`: `push` 이벤트 표시, `notificationclick` → payload URL로 이동 (이미 열린 창이 있으면 그 창 이동)

---

## 서비스 상호작용 요약

| 트리거 | 서비스 흐름 |
|---|---|
| 매일 새벽 cron | S1 → (S2.recomputeAll) |
| 매시 정각 cron | S5 |
| 마법사 저장 / 정보 수정 | 클라이언트 C24 → S3 → S2.recomputeForDevice |
| 피드·상세 열기 | 클라이언트 → S4 |
| 알림 허용 | S6 → S3 계열 API(`/api/push/subscribe`) |
| 모두 지우기 | 클라이언트(로컬 삭제) → S3(`DELETE /api/device`) |
