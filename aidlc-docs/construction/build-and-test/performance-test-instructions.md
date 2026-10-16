# 성능 테스트 안내

## 목표

| ID | 목표 |
|---|---|
| NFR-4.1 | 피드 첫 화면 4G에서 **3초 이내** |
| NFR-U6-01·03 | `dispatch` 1회 60초 이내, 한 시각 기기 1,000대 |
| Edge CPU | 요청당 CPU 2초 한도 (U6 infrastructure-design §4) |
| NFR-U3-01 | `collect` 90초 이내 (U3에서 운영 실행으로 확인) |

## 측정 방법과 결과 (2026-10-17)

### 1. 피드 표시 시간 — `scripts/measure-feed-4g.mjs`

```bash
APP_URL=http://localhost:3123 node scripts/measure-feed-4g.mjs 5
```

조건: Chromium(Galaxy S9+), **느린 4G**(내려받기 1.6Mbps·올리기 750kbps·왕복 150ms) + **CPU 4배 느리게**, 로컬 서버, 5회.

| 경우 | 제목 표시(중간값/최대) | 서버 목록으로 바뀜(중간값/최대) | 판정 |
|---|---|---|---|
| 저장본 없음(처음, 브라우저 캐시도 비움) | 1,620 / 2,153 ms | 1,627 / 2,161 ms | ✅ 3초 이내 |
| 저장본 있음(두 번째부터) | 310 / 379 ms | 531 / 590 ms | ✅ |

한계: 서버가 로컬이라 Vercel(icn1)·Supabase(ap-northeast-2) 왕복이 빠져 있다. 피드 API는 DB 왕복 3번이므로 운영에서는 수백 ms가 더해질 수 있다 → 운영 반영 뒤 같은 스크립트를 `APP_URL=https://mozzi-cheongyak-rador.vercel.app`로 한 번 더 재서 기록한다(운영 기기 1대가 등록됨 — 측정 뒤 설정 → 모두 지우기).

### 2. 발송 규모 — 1,000대 시뮬레이션 (PBT 파일의 P-13)

```bash
npx vitest run supabase/functions/_shared/push/__tests__/push.pbt.test.ts -t "P-13" --reporter=verbose
```

결과: 1,000대 발송 **3.3초**(Node, 가짜 푸시 서비스 지연 5ms, 동시 5, 암호화 포함). 예산 45초 ✅

### 3. Edge CPU — `scripts/measure-push-cpu.ts`

```bash
npx -y deno@2.5.6 run scripts/measure-push-cpu.ts 1000
```

결과: 웹 푸시 1,000건 **1.79초**(건당 1.8ms). 지금 규모(기기 수십 대 ≈ 50ms)는 한 번 호출로 충분. 400대를 넘으면 `dispatch.too_many` 경고 → cron을 `{"part","parts"}`로 나눠 부른다(이미 구현).

## 부하·스트레스 테스트

가족 몇 명이 쓰는 비공개 앱(기기 수십 대 이하)이라 별도 부하 도구로 동시 접속 시험은 하지 않는다. 서버 쪽 한도는 U1 기기 등록 한도(1시간 20대)·본문 크기 제한·시험 알림 한도로 막는다.
