# Build and Test 요약 — 모찌네 청약 알리미 (U1~U6)

> 기준 커밋: `1c8ee97` (main) 위에서 측정, 2026-10-17. 세부 방법은 같은 폴더의 안내 문서.

## 빌드

| 항목 | 결과 |
|---|---|
| 도구 | npm + Next.js 16 (Vercel), Supabase CLI (DB·Edge Function), Deno 2 (함수 검사) |
| `typecheck`·`lint`·`deno:check`·`build` | ✅ 모두 통과 |
| 산출물 | Next 앱(화면 6종·API 11개·manifest), Edge Function `collect`·`analyze`·`dispatch`, 마이그레이션 0001~0008 |
| CI (`1c8ee97`) | ✅ `ci`, ✅ `db-and-e2e` |

## 테스트

| 종류 | 결과 | 비고 |
|---|---|---|
| 단위(예시+PBT) | ✅ **611/611** (54개 파일), seed 3회 이상 | PBT: P-U4-1~10, P-U5-1~13, P-U6-1~10 등 |
| 웹 푸시 표준 일치 | ✅ RFC 8291 부록 A 시험 값 바이트 일치, VAPID 서명 검증 | |
| DB 계약 (pgTAP) | ✅ **120/120** (5개 파일) | |
| Unit 간 통합 스모크 | ✅ **13/13** | U3 수집 → U1 등록 → U4·U2 저장·판정 → U5 피드·상세 → U6 구독·기준선·발송(실제 FCM 전송, 만료 처리) |
| E2E (Android·iPhone) | ✅ **53 통과 + 3 건너뜀**(기기 전용), axe 위반 0 | |
| 성능: 피드 4G | ✅ 처음 1.62초(최대 2.15초), 두 번째부터 0.31초 — 목표 3초 | 로컬 서버 기준(운영 왕복 미포함) |
| 성능: 발송 1,000대 | ✅ 3.3초 (예산 45초) | 시뮬레이션 |
| 성능: Edge CPU | 1,000건 1.79초 → 나눠 부르기 준비됨 | 지금 규모 ≈ 50ms |
| 보안 | ✅ 운영 의존성 취약점 0, 비밀값 없음, RLS·인증·주소 제한 | ⚠ 개발 의존성 high 5건(린트 도구 `braces`) 위험 수용 |

## 이번 단계에서 새로 만든 것

- `scripts/integration-smoke.mjs` — Unit 간 통합 스모크(로컬 전용)
- `scripts/measure-feed-4g.mjs` — 피드 4G 표시 시간 측정
- 안내 문서 7개(이 폴더)

## 남은 확인 (사용자·운영)

| 항목 | 언제 | 어디 |
|---|---|---|
| U6 운영 반영 ①~⑧ (DB 0008, VAPID 키, `dispatch` 배포, 휴대폰 알림 켜기, Vault `dispatch_url`) | 지금 | [setup-guide-u6.md](../U6-pwa-push/code/setup-guide-u6.md) |
| 실기기: 어머니 iPhone·Android 시험 알림, 다음 날 9시 알림, iPhone 캘린더 추가 | 운영 반영 뒤 | e2e-test-instructions.md "실기기 확인" |
| 운영 피드 4G 시간 재측정 | 운영 반영 뒤 | performance-test-instructions.md §1 |
| U1 2주 점검 (~2026-10-28), U3 자동 실행 확인·골든 세트 | 일정대로 | U1·U3 setup-guide |

## 전체 상태

- **빌드**: 성공
- **자동 테스트**: 모두 통과
- **운영 준비**: 코드는 준비됨. U6 기능을 쓰려면 위 운영 반영 ①~⑧이 필요(사용자 작업, 안내서 제공)
