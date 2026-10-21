# U6 pwa-push — 변경 요청 3 코드 생성 계획 (마감 임박 알림)

> 근거: U6 기능 설계 변경 3 (domain-entities §8, business-rules §14 BR-U6-D1~D42, business-logic-model §8, frontend-components §9, 2026-10-20 승인)
> 원칙: 별표·마감 임박이 없으면 알림 대상·횟수·문구는 지금 그대로(P-U6-D1). 서버에는 공고 ID만.

## 단계

- [x] **Step 0 — 비교용 사본** `_shared/push/__tests__/legacy/` 에 지금 `plan.ts`·`payload.ts`
- [x] **Step 1 — DB** `supabase/migrations/0014_bookmark_deadline.sql`
  - `device_bookmarks`(RLS·cascade), `devices.deadline_enabled`, `notification_log` 기본키에 `kind`·`'deadline'`
  - `replace_device_bookmarks(p_device_id, p_ids)`(없는 ID 빼기, 100개), 발송 묶어 읽기 함수에 마감 임박·`notified`는 sent·baseline만, 기록 함수에 마감 기록, 알림 설정 함수에 `deadline_enabled`
  - pgTAP `supabase/tests/bookmark-deadline.test.sql`
- [x] **Step 2 — 발송 로직** `_shared/push/plan.ts`·`payload.ts`·`dispatch.ts`·`store-rpc.ts`
  - `deadlineNotices`, `planDevice` 마감 포함, `buildPayload` 4경우, 성공 시 마감 기록
- [x] **Step 3 — 서버 API** `PUT /api/bookmarks`(새, 기기 인증·검사), `PUT /api/notify-settings`에 `deadlineEnabled`
- [x] **Step 4 — 화면·기기**
  - `features/bookmarks/model/sync.ts`(새), `BookmarksProvider` 별표 뒤·앱 열 때 보내기
  - 알림 설정 `deadlineEnabled`(ProfileProvider·storage), `SettingsView` 스위치, 모두 지우기에 `mz.bookmarks.sync`
- [x] **Step 5 — 테스트**
  - 예시: 마감 임박 고르기, 계획·문구 4경우, 동기화 상태, API 검사
  - PBT: P-U6-D1~D5 (P-U6-D3은 기존 dispatch 시뮬레이션에 관심 공고 추가)
  - E2E: 별표 → 서버 목록(로컬 DB), 설정 스위치, 모두 지우기
  - dispatch 로컬 실행: 마감 내일 별표 → 1번, 다시 실행해도 그대로 — **하지 않음**, 메모리 시뮬레이터·pgTAP로 대신 (운영 반영 뒤 확인)
- [x] **Step 6 — 검증과 문서**: typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E, `code-summary-change-3.md`, 로컬 커밋

## 배포 메모

- 0014는 dispatch 함수보다 먼저(새 함수는 바뀐 RPC를 부른다). 순서: DB 0012·0013·0014 → collect·analyze·dispatch → push
- 옛 앱(push 전)이 `PUT /api/bookmarks`를 부르지 않아도 문제 없음 — 서버 목록이 비어 마감 알림이 없을 뿐
