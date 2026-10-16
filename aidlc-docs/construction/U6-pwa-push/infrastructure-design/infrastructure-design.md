# U6 pwa-push — 인프라 설계

> 근거: 계획 답변 Q1~Q4 = 모두 A (2026-10-16), NFR 설계 logical-components, U3 인프라(함수 호출 인증·Vault·`invoke_edge_function`)

---

## 1. 구성 요소 매핑

| 논리 구성 요소 | 실제 서비스 | 설정 |
|---|---|---|
| `dispatch` (S5) | Supabase Edge Function `dispatch` | `verify_jwt = false` + `CRON_SECRET` 상수 시간 비교(U3 `guard`), 벽시계 예산 60초(45초 뒤 새 기기 시작 안 함) |
| 공용 코드 | `supabase/functions/_shared/push/`, `_shared/feed/`, `_lib/push-store.ts` | 함수 배포 시 함께 번들 |
| 구독·시험·공개 키 API | Vercel(Next) `/api/push/subscribe`·`/api/push/test`·`/api/push/key` | Node 런타임, U1 route guard |
| 서비스워커·manifest·아이콘 | Vercel 정적 파일 `public/sw.js`, `public/icons/*`, `src/app/manifest.ts` | `sw.js`는 `cache-control: no-cache`(새 버전 바로 반영), `service-worker-allowed` 불필요(루트) |
| DB | 마이그레이션 `0008_push.sql` | 칸 4개, 표 2개, 함수 7개, cron 2개 (logical-components §3) |

## 2. 예약 작업 (pg_cron, UTC)

| 작업 | KST | cron (UTC) | 호출 |
|---|---|---|---|
| `cleanup-devices`·`cleanup-notices` (U1) | 04:00·04:05 | 기존 | SQL |
| **`cleanup-push`** | **매일 04:10** | **`10 19 * * *`** | `run_cleanup_push()` — 7일 넘게 실패한 구독, `push_test_log` 1일, `dispatch_runs` 30일 |
| `collect-daily`·`analyze-hourly` (U3) | 05:00·매시 30분 | 기존 | |
| **`dispatch-hourly`** | **매시 정각** | **`0 * * * *`** | `invoke_edge_function('dispatch')` (U3 함수 재사용) |

- KST = UTC + 9이고 서머타임이 없으므로 UTC 정각 = KST 정각. `dispatch`는 실행 시각을 KST로 바꿔 시(H)를 정한다.
- Vault `dispatch_url`이 없으면 `invoke_edge_function`은 호출하지 않고 `collect_runs`에 "Vault 값 없음: dispatch_url"을 남긴다(U3 동작). 반영 순서 ⑥ 전까지는 매시 기록이 쌓이는 것이 정상.

## 3. 비밀값·환경 변수 (Q1=A·Q3=A)

| 이름 | 위치 | 값 | 비고 |
|---|---|---|---|
| `VAPID_PUBLIC_KEY` | 함수 시크릿 + Vercel(Production) | base64url (공개 값) | `/api/push/key`가 내려줌 |
| `VAPID_PRIVATE_KEY` | 함수 시크릿 + Vercel(Production) | base64url (**비밀**) | 저장소·로그·채팅에 남기지 않음 |
| `VAPID_SUBJECT` | 함수 시크릿 + Vercel(Production) | `https://mozzi-cheongyak-rador.vercel.app` | |
| `CRON_SECRET` | 함수 시크릿(이미 있음) + Vault `cron_secret`(이미 있음) | U3 값 재사용 | 새로 만들지 않음 |
| `AMOUNT_ENC_KEY_*` | 함수 시크릿(이미 있음) | U1 | `dispatch`의 판정 다시 계산이 씀 |
| Vault `dispatch_url` | Supabase Vault | `https://<ref>.supabase.co/functions/v1/dispatch` | 반영 순서 ⑥에서 넣음 |

- **키 만들기**: `npm run vapid:generate`(Web Crypto, 저장소 스크립트) → 터미널에 세 값 출력, 파일에 쓰지 않음. 사용자가 `npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=…`과 Vercel 대시보드(Production)에 붙여넣기.
- **미리보기 배포**(Q3=A): VAPID 값이 없으면 `/api/push/key`는 503 `PUSH_NOT_CONFIGURED`, 화면은 알림 켜기를 "준비 중"으로 보여 줌(오류로 멈추지 않음). 서비스워커·설치 안내는 그대로 동작.
- **키 교체**(새어 나갔을 때만): 새 키 등록 → 배포 → 앱을 열면 공개 키가 달라진 것을 감지해 기존 구독을 해지하고 새로 구독 → 서버에 저장(BR-U6-56 확장). 옛 구독은 403·401로 실패 → 7일 뒤 정리. 절차는 setup 문서에.

## 4. CPU 2초 한도 대응 (Q2=A)

| 작업 | 예상 | 대응 |
|---|---|---|
| 웹 푸시 암호화(구독당 ECDH 1번·HKDF 2번·AES-GCM 1번) | 구독당 수 ms, Web Crypto 네이티브 | Code Generation에서 **1,000건 CPU 시간 측정**(Deno), 결과를 code-summary에 기록 |
| VAPID JWT 서명 | 푸시 서비스 origin마다 1번 | 실행 동안 재사용(P-12) |
| 판정 다시 계산 | 오래된 기기만 | U2 측정 범위 안 |
| 판단 기준 | 측정값이 **1초 이상**이면 | `dispatch?part=k&parts=n`(기기 ID 해시로 나눔)을 추가하고 cron이 n번 호출 — 그때 설계 보완. 지금 규모(수십 대)는 1번 호출 |

## 5. 네트워크·외부 서비스

| 대상 | 방향 | 비고 |
|---|---|---|
| FCM(`fcm.googleapis.com`), Apple(`*.push.apple.com`), Mozilla, Microsoft 푸시 서비스 | `dispatch`·Vercel → 밖 | HTTPS POST, 허용 목록 밖 주소로는 보내지 않음(P-14) |
| 브라우저 → Vercel | 구독 저장·시험 | U1 인증 헤더 |
| 푸시 서비스 → 휴대폰 | 플랫폼 | 앱 서버가 관여하지 않음 |

## 6. 비용 (NFR-5.1)

- Edge Function 호출: 매시 1번 = 하루 24번(+ 정리 0). 무료 한도(월 50만) 대비 미미.
- 푸시 서비스 발송은 무료. DB 행: 알림 기록은 공고 수 × 기기 수(보관 공고 1년 정리와 함께 지워짐).

## 7. 관측

- `dispatch_runs` 확인 쿼리(setup 문서): `select * from dispatch_runs order by started_at desc limit 24;`
- 함수 로그(Supabase 대시보드): `dispatch.*`, `push.rejected`.
