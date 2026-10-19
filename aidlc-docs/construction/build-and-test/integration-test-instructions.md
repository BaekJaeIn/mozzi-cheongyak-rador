# 통합 테스트 안내 (Unit 사이)

## 목적

Unit이 이어지는 실제 흐름을 로컬 Supabase·Edge Function·Next 서버로 한 번에 확인한다.

## 구성

| 층 | 내용 | 실행 |
|---|---|---|
| DB 계약 (pgTAP) | RPC·RLS·cron·발송 함수(몫 잡기·기록·기준선) | `npx supabase test db` — 5개 파일 **120개** |
| Unit 간 연결 (스모크) | U3 → U1 → U4·U2 → U5 → U6 | `scripts/integration-smoke.mjs` — **13개 확인** |
| 화면 흐름 | E2E (e2e-test-instructions.md) | `npm run e2e` |

## 스모크 시험 시나리오 (`scripts/integration-smoke.mjs`)

| # | 이어지는 Unit | 확인 |
|---|---|---|
| 1 | U3 collect(목업) | 3개 소스 실행, 목업 공고 저장 |
| 2 | U3 analyze(목업) | 대기 공고 예약·처리 |
| 3 | U1 기기 등록 | `POST /api/device` 201 |
| 4 | U4 프로필 저장 → U2 재계산 | `PUT /api/profile` 200, 기기 판정 저장 |
| 5 | U5 피드·상세 | ready, 맞는 공고, 미충족 없음, 상세의 판정 이유 |
| 6 | U6 구독 → 기준선 | `POST /api/push/subscribe` 200, 기준선 = 지금 피드 공고 |
| 7 | U6 dispatch | 대상 기기 → 암호화 → **실제 FCM 전송** → 가짜 구독이라 만료 → 구독 삭제·몫 되돌림 |

### 실행 순서

```bash
npx supabase start && npx supabase migration up --local
# 함수 환경 파일(비밀값이라 저장소 밖에 둔다): AMOUNT_ENC_KEY_V1·CURRENT, CRON_SECRET, VAPID_*, COLLECT_MOCK=1
npx supabase functions serve --env-file <함수 env 파일> --no-verify-jwt     # 별도 창
# 빌드 안내의 로컬 환경 변수를 넣고
npm run build && npx next start -p 3123                                     # 별도 창
APP_URL=http://localhost:3123 CRON_SECRET=<함수 env와 같은 값> node scripts/integration-smoke.mjs
```

- 스크립트는 `SUPABASE_URL`·`APP_URL`이 127.0.0.1·localhost가 아니면 실행하지 않는다.
- 끝나면 만든 기기와 목업 공고를 지운다.

## 결과 (2026-10-17)

13/13 통과. 피드 4건(왕숙 행복주택·교산 A2·계양 A10·창릉 S-3), 기준선 4건, dispatch 결과 `{"devices":1,"failed":1,"removedSubscriptions":1}`(가짜 구독 만료 → 정상 처리).

한계: 이번 목업 판정에 "미충족"이 없어 #5의 "미충족 없음"은 실제로 걸러 낸 것이 없다. 미충족 숨김은 U5 E2E(`feed.spec.ts`)와 PBT(P-U5-1)가 확인한다.

## 변경 요청 2 결과 (2026-10-20)

| 층 | 결과 |
|---|---|
| DB 계약 (pgTAP) | ✅ **150/150** (7개 파일: + `regions.test.sql` 0009, `collect-regions.test.sql` 0010 — 관심 지역 SQL·TS 공유 표 12쌍, 90일 관심 기기, 분석 대상, cron 두 묶음) |
| 스모크 | ✅ **13/13** (목업에 SH 강서구 공고 포함). 첫 실행은 함수 서버가 막 뜬 직후 collect 응답이 비어 중간에 멈춤 → 다시 실행해 통과 |
| SH 실제 1회 (로컬, U3) | 요청 17번·33.1초(예산 35초), 모집공고 14건, 고덕강일 분양 포함 |

- `collect-regions.test.sql`은 관심 기기 판정 앞에서 다른 기기 프로필을 트랜잭션 안에서만 지운다(로컬 DB에 E2E가 남긴 기기가 섞이지 않게, rollback으로 되돌림).
