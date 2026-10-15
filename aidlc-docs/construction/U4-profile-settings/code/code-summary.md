# U4 profile-settings — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U4-profile-settings-code-generation-plan.md`
> 설계: `aidlc-docs/construction/U4-profile-settings/functional-design/`

## 1. 생성·변경 파일

| 영역 | 파일 |
|---|---|
| 순수 로직 (`src/features/profile/model/`) | `types.ts`(답·UNKNOWN), `steps.ts`(화면 23개·보이는 조건·건너뛰기·필수·[잘 모르겠어요]·진행 표시·생년월일 범위), `convert.ts`(답↔프로필·그룹 고치기 병합·비운 항목), `bands.ts`(기간 구간), `amount.ts`(한글 금액·단위 실수 확인·상한), `hour.ts`, `regions.ts`(시도 16·서울 25·경기 31·인천 11), `districts.ts`, `summary.ts`(설정 요약), `storage.ts`(기기 저장 키·깨진 값 처리·모두 지우기), `sync.ts`(동기화 대기열) |
| 화면 | `src/features/profile/ProfileProvider.tsx`(저장 상태·동기화 시점), `api.ts`, `ui/controls.tsx`(보기 목록·생년월일·금액·횟수·확인 창), `ui/StepScreen.tsx`, `ui/ProfileWizard.tsx`(setup·redo·edit), `ui/NotifyStep.tsx`, `ui/push-port.ts`(U6 연결 자리), `ui/HomeGate.tsx`(처음 실행 안내), `src/features/settings/SettingsView.tsx`, `src/features/display-mode/display-mode.tsx` |
| 라우트 | `src/app/page.tsx`, `src/app/profile/setup/page.tsx`, `src/app/profile/edit/[group]/page.tsx`, `src/app/settings/page.tsx`, `src/app/api/profile/route.ts`, `src/app/api/notify-settings/route.ts`, `src/app/api/device/route.ts`(DELETE 추가), `src/app/layout.tsx`(ProfileProvider·모드 스크립트) |
| 서버 | `src/server/handlers/profile-settings.ts`(API 3개), `src/server/deps.ts`(연결), `DeviceRepository.updateNotifySettings`(`_shared/db/repositories.ts`, `src/server/db/device-repository.ts`) |
| U1 수정 | `api-client.ts`(`request(…, { reregister: false })`), `BottomNav.tsx`(`shouldShowNav` — 마법사·처음 실행에서 숨김) |
| U3 수정 | `_shared/collect/dates.ts` `parseSourceDate`: 문자열·숫자만 받음 (전체 검증 중 PBT가 새 seed로 찾은 예외 — 객체 입력에서 `String()` 예외) |
| 테스트 | `model/__tests__/profile-model.test.ts`·`sync.test.ts`(예시), `profile-model.pbt.test.ts`(P-U4-1~10 + 1b), `arbitraries.ts`, `src/server/handlers/__tests__/profile-settings.test.ts`, api-client·device-repository·bottom-nav 테스트 추가, `e2e/profile.spec.ts`(7개), `e2e/helpers.ts`, `e2e/app-shell.spec.ts`(처음 실행 안내 반영) |
| 문서 | README "화면과 API (U4)" 절, 기능 설계 조정 반영(BR-U4-04·25·52·63) |

## 2. 설계 대비 조정

| 설계 | 실제 | 이유 |
|---|---|---|
| BR-U4-04 등록 실패해도 입력 가능 | U1 "다시 시도" 화면 유지 | 계획 단계에서 조정 (U1 승인 동작) |
| 시도 17개, 인천 10군구 | 시도 16개(광주·전남 하나), 인천 11군구(제물포·영종·서해·검단구) | 2026년 행정구역 — U3 실제 응답(LH `전남광주통합특별시`, 청약홈 `인천광역시 서해구`)으로 확인 |
| 모든 선택 화면에 [잘 모르겠어요] | 넓이·분양/임대·저층 화면에는 없음, 처음부터 기본값(상관없음·둘 다) | 이 화면들은 "모름"이 판정에 의미가 없고, 누르면 목록 항목이 깨지는 결함을 코드 생성 중 발견 → `allowUnknown` + PBT P-U4-1b(어느 화면에서 눌러도 검증 통과) |
| 저장 실패 안내 후 바로 피드 | 저장 결과 화면(안내 + [맞춤 공고 보러 가기]) | 바로 이동하면 안내가 보이지 않음 (로컬 E2E에서 발견) |
| 알림 단계 항상 | U6이 `setPushPort`로 연결하기 전에는 건너뜀 | U6 전에는 구독 기능이 없음 |
| `DisplayMode` 서버 저장 없음 | 그대로. `<head>` 인라인 스크립트로 그리기 전 적용, `html`에 `suppressHydrationWarning` | 깜빡임 없음 (BR-U4-83) |

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 43개 파일, **419개 테스트** (U4 추가 약 69개), 서로 다른 seed 4번 반복 |
| `npm run deno:check` | ✅ |
| `npm run build` | ✅ (`/profile/setup`, `/profile/edit/[group]`, `/settings`, `/api/profile`, `/api/notify-settings`) |
| E2E (로컬 확인) | ✅ Docker가 없어 **API를 메모리 가짜 서버로 대신**해 빌드한 앱에 Playwright(Chromium, Galaxy S9+)로 실행: `profile.spec.ts` 7/7, `app-shell.spec.ts` 6/6, axe 위반 0. 확인 후 임시 파일 삭제. **실제 DB와 함께 도는 E2E는 push 후 CI `db-and-e2e`에서 (Chromium·WebKit)** |

## 4. 남은 일

| 단계 | 내용 |
|---|---|
| push | 사용자 확인 후 → CI `ci`·`db-and-e2e`(실제 로컬 Supabase로 E2E, iPhone 13 WebKit 포함) |
| 배포 | `main` push 시 Vercel 자동 배포. DB 변경 없음 |
| U6 연결 | `setPushPort`(알림 구독), 설정의 알림 켜기 → 권한 요청 |
| U5 연결 | 홈의 피드 자리(`HomeGate`의 `feed`), `mz.bookmarks` 저장소 |
