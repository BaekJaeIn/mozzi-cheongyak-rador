# U5 feed-detail — 변경 요청 4 코드 생성 계획 (뒤로 버튼)

> 근거: U5 기능 설계 변경 4 (business-rules §18 BR-U5-E1~E32, frontend-components §10, business-logic-model §12, 2026-10-25 승인)

## 단계

- [x] **Step 1 — 상수** `app-chrome/back-target.ts`: `EXIT_WINDOW_MS = 3000`, `EXIT_HINT = "종료하시려면 뒤로가기 버튼을 한번 더 클릭해주세요."` (E20)
- [x] **Step 2 — 상태 기계** `app-chrome/back-controller.ts`(새, 순수): `BackState`·`BackEvent`·`BackAction`, `step()` (frontend-components §10.2)
- [x] **Step 3 — 연결** `app-chrome/BackNavigation.tsx`: CloseWatcher·지킴이를 함께, 조작(~~pointerdown~~ → pointerup·keydown — 터치는 뗄 때 조작으로 인정) 때, 또는 조작한 적이 있으면 처리 직후 지킴이, 할 일 실행, 안내 문구·3초. `useBackClose`·`useLastList`는 그대로
- [x] **Step 4 — 테스트**
  - 단위: 시나리오 S1~S6 (business-logic-model §12.1)
  - PBT `app-chrome/__tests__/back-controller.pbt.test.ts`: P-U5-E1~E4
  - E2E `e2e/feed.spec.ts`: 새 문구, CloseWatcher 길(Esc)과 **방문 기록 길(CloseWatcher를 지운 페이지에서 `page.goBack`)** 둘 다, 안내 중 다시 뒤로 → 받지 않음
- [x] **Step 5 — 검증과 문서**: typecheck·lint·단위(3회)·로컬 E2E, `aidlc-docs/construction/U5-feed-detail/code/code-summary-change-4.md`, 로컬 커밋
