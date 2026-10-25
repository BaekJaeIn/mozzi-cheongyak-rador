# U5 feed-detail — 변경 요청 4 코드 요약 (뒤로 버튼)

> 계획: `construction/plans/U5-feed-detail-change-4-code-generation-plan.md` · 설계: 기능 설계 변경 4 (business-rules §18, frontend-components §10, business-logic-model §12)

## 새 파일

| 파일 | 내용 |
|---|---|
| `src/features/app-chrome/back-controller.ts` | 뒤로 버튼 상태 기계(순수): 사건(start·gesture·back·exitTimeout) → 할 일(pushGuard·silentHistoryBack·armWatcher·disarmWatcher·closeOverlay·navigate·showExitHint·startExitTimer) |
| `src/features/app-chrome/__tests__/back-controller.test.ts` | 시나리오 S1~S7 + PBT P-U5-E1~E4 |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `app-chrome/back-target.ts` | `EXIT_WINDOW_MS` 2초 → **3초**, `EXIT_HINT` "종료하시려면 뒤로가기 버튼을 한번 더 클릭해주세요." |
| `app-chrome/BackNavigation.tsx` | 상태 기계 연결. CloseWatcher와 방문 기록 지킴이를 **함께**. 지킴이는 앱을 열 때 넣지 않고 조작(pointerup·keydown) 때, 또는 조작한 적이 있는 페이지면 처리 직후 바로. popstate는 상태를 바로 바꾸고 할 일은 50ms 뒤 |
| `e2e/feed.spec.ts` | 새 문구, **CloseWatcher를 지운 페이지(방문 기록 길)** 시험: 상세 → 목록, 설정 → 뒤로 → (터치 없이) 뒤로 = 안내, 3초 뒤 다시 안내, 안내 중 다시 누르면 앱 밖으로 |

## 코드 단계에서 찾아 고친 것

1. **터치는 손가락을 뗄 때 조작으로 인정된다** — 지금 코드는 `pointerdown`에서 지킴이를 넣었다 → `pointerup`·`keydown`
2. **"설정 → 뒤로 → (터치 없이) 뒤로"가 안내 없이 닫힘** — 브라우저는 한 번도 조작하지 않은 페이지의 칸만 건너뛰므로, 조작한 적이 있으면(`navigator.userActivation.hasBeenActive`) 처리 직후 지킴이를 바로 넣는다 (BR-U5-E12 보완)
3. **경쟁 상태** — 뒤로 처리를 미루는 사이 바로 터치하면 지킴이가 빠짐 → 상태는 popstate 순간에 바꾼다
4. **WebKit이 너무 일찍 넣은 칸을 잃음** — 0ms에서 5회 중 2~3회 → 50ms 뒤에 넣는다(6회 모두 정상) (BR-U5-E15)

## 알려진 한계

- CloseWatcher가 없고 **한 번도 조작하지 않은** 상태(앱을 열자마자)에서 뒤로 버튼을 누르면 안내 없이 닫힐 수 있다 — 브라우저 규칙
- 실제 휴대폰(설치 앱) 확인은 Build and Test (BR-U5-E32)

## 검증 (2026-10-25)

- typecheck·lint 통과
- 단위 926개 통과 (3회)
- 로컬 E2E 91 통과·3 건너뜀(알림 권한 — 전과 같음). 방문 기록 길 시험은 WebKit에서 6회 연속 통과
