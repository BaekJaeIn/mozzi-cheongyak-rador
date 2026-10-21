# U6 pwa-push — 변경 요청 3 코드 요약 (마감 임박 알림)

> 계획: `plans/U6-pwa-push-change-3-code-generation-plan.md` (Step 0~6, 2026-10-21)
> 설계: functional-design domain-entities §8, business-rules §14 (BR-U6-D1~D42), business-logic-model §8, frontend-components §9

## 바뀐 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/0014_bookmark_deadline.sql` (새) | `device_bookmarks`·`deadline_notification_log`(RLS, cascade), `devices.deadline_enabled`, `replace_device_bookmarks`·`dispatch_deadlines`·`record_deadline_push`(service_role만) |
| `_shared/push/plan.ts` | `DispatchItem.deadlines`, `planDevice(…, deadlines)` — 둘 다 없을 때만 null, `deadlineNotices`(DB와 같은 규칙) |
| `_shared/push/payload.ts` | 마감만 1건(상세)·여러 건(`/bookmarks`)·새 공고와 함께(둘째 줄) |
| `_shared/push/dispatch.ts` | 묶어 읽기의 마감 임박 사용, 보내기 성공 시 마감 기록 |
| `_shared/push/store-rpc.ts` | `dispatch_deadlines`·`record_deadline_push` 호출, `replaceDeviceBookmarks` |
| `_shared/db/repositories.ts`, `src/server/db/device-repository.ts`, `handlers/profile-settings.ts` | 알림 설정 `deadlineEnabled`(선택 — 옛 앱은 보내지 않음) |
| `src/server/handlers/bookmarks.ts`(새), `src/app/api/bookmarks/route.ts`(새), `deps.ts` | `PUT /api/bookmarks { ids }` — uuid·중복 없음·100개, 로그는 개수만 |
| `src/features/bookmarks/model/sync.ts`(새) | `mz.bookmarks.sync` 상태, 대기열이 보낼 값 |
| `src/features/profile/model/sync.ts` | 대기열에 관심 공고 채널, **보내는 중에 다시 부르면 끝난 뒤 한 번 더 돈다** |
| `src/features/profile/model/storage.ts`·`api.ts`·`ProfileProvider.tsx` | `deadlineEnabled` 저장·화면 상태, `putBookmarks`, 모두 지우기에 동기화 상태 |
| `src/features/bookmarks/BookmarksProvider.tsx` | 별표·해제 뒤 보내기 |
| `src/features/settings/SettingsView.tsx` | "관심 공고 마감 알림" 스위치(기본 켜짐, 전체 알림 꺼짐이면 흐리게) |

## 테스트

| 파일 | 내용 |
|---|---|
| `push/__tests__/legacy/plan.ts`·`payload.ts` | 변경 3 전 사본 — P-U6-D1 |
| `push/__tests__/change3.test.ts` (9) | 마감 고르기, 계획·문구 4경우, dispatch(마감만·끈 기기·실패) |
| `push/__tests__/change3.pbt.test.ts` (4) | P-U6-D1~D4 |
| `push/__tests__/sim.ts` | 메모리 저장소에 관심 공고·마감 기록·스위치 |
| `bookmarks/model/__tests__/sync.test.ts` (6) | 처음 보내기·실패 재시도·재등록·모두 지우기·보내는 중 다시 부르기, P-U6-D5 |
| `server/handlers/__tests__/change3-bookmarks.test.ts` (6) | API 검사·인증·로그, 알림 설정 `deadlineEnabled` |
| `supabase/tests/bookmark-deadline.test.sql` (17) | 바꾸기·마감 임박·기록·스위치·권한·cascade |
| `e2e/feed.spec.ts` (+3 × 2기기) | 별표 ↔ 서버 목록, 옛 별표 첫 동기화, 설정 스위치 |

## 만들면서 찾아 고친 것

- **알림 기록 표를 바꾸지 않고 마감 기록 표를 따로 뒀다**: 설계는 `notification_log` 기본키에 `kind`를 넣는 안이었지만, 기존 새 공고 기록·기준선이 `on conflict (기기, 공고)`에 기대고 있어 따로 두는 쪽이 안전하다. 설계 문서도 고침
- **피드 "내 정보를 아직 보내지 못해…" 오류 (E2E가 찾음)**: 앱을 열 때 기존 별표 처음 보내기가 진행 중인데 피드가 "모두 다시 보내기"를 부르면, 이미 지나간 프로필 단계를 다시 돌지 않아 프로필이 서버에 가지 않았다. 대기열이 보내는 중에 다시 불리면 끝난 뒤 한 번 더 돌도록 고치고 단위 테스트를 추가
- **설정 스위치가 저장돼도 화면이 안 바뀜**: 화면 상태에 `deadlineEnabled`를 빼고 읽고 있었다

## 검증

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (seed 11·22·33) | 839 / 839 / 839 |
| pgTAP | 185/185 |
| 로컬 E2E | 89 통과, 3 건너뜀 |

- `dispatch` Edge Function 로컬 실행은 하지 않았다. 같은 흐름을 메모리 시뮬레이터(실행기 그대로 + 저장소 흉내)와 pgTAP(DB 함수)로 확인했다. Build and Test 운영 반영 뒤 dispatch 기록으로 확인한다

## 배포 메모

- 0014 → dispatch 배포(새 RPC를 부른다) → push. 옛 앱은 `PUT /api/bookmarks`를 부르지 않으니 서버 목록이 비어 마감 알림이 없을 뿐(오류 없음)
