# U4 profile-settings — 코드 생성 계획

> **이 계획이 U4 코드 생성의 유일한 기준이다.** 단계를 끝낼 때마다 [x]로 표시한다.
> 설계: `aidlc-docs/construction/U4-profile-settings/functional-design/` (business-rules BR-U4-*, domain-entities, business-logic-model, frontend-components)
> NFR Requirements·NFR Design·Infrastructure Design은 생략(unit-of-work: 새 기술·인프라 없음). DB 마이그레이션 없음(`devices.notify_hour·notify_enabled`, `delete_device`, `save_device_profile`은 U1에 있음).

## Unit 맥락

| 항목 | 내용 |
|---|---|
| 스토리 | US-02 처음 실행, US-04 기본·거주, US-05 주택·통장, US-06 소득·자산, US-07 관심 지구·선호, US-08 확인·저장, US-09 알림 시각, US-18 고치기, US-19 쉬운 모드, US-20 모두 지우기 (기여: US-03 알림 단계 자리) |
| 의존 (U1) | `api-client`(인증·재시도·재등록, `onReRegistered`), `identity-store`, `DeviceBootstrap`, route guard(`withDevice`), `respond`, 크기 토큰 `--scale`·`html[data-mode]`, `BottomNav`, Playwright·axe |
| 의존 (U2) | `HouseholdProfile`·`validateProfile`·`normalizeSido`·`ageAt`, `encodeProfile`(코덱), `judgementService().recomputeForDevice`, `DISTRICTS` 시드 값, `districtsCache` |
| 제공 (U5·U6) | `ProfileProvider`(프로필 유무·값), 홈의 프로필 분기(피드 자리는 U5), `NotifyStep`·`NotifySettings`의 구독 함수 주입 자리(U6), 모두 지우기에서 `mz.bookmarks` 정리(U5 키) |
| 코드 위치 | 순수 로직 `src/features/profile/model/`, 화면 `src/features/profile/`·`src/features/settings/`·`src/features/display-mode/`, 서버 `src/server/handlers/`, 라우트 `src/app/` |
| 테스트 | Vitest(node 환경, `*.test.ts`) — 순수 로직·핸들러 예시·PBT. 화면은 Playwright E2E(`e2e/`, CI `db-and-e2e`에서 로컬 Supabase로 실행) |

### 설계 대비 조정 (계획 단계)

| 설계 | 조정 | 이유 |
|---|---|---|
| BR-U4-04 "기기 등록이 실패해도 마법사 입력은 할 수 있다" | **U1 `DeviceBootstrap` 그대로**: 첫 등록이 실패하면 U1 "다시 시도" 화면 | 첫 실행은 인터넷이 필요한 상황(앱 설치 직후)이고, U1에서 승인한 동작을 바꾸지 않는다. Step 17에서 BR-U4-04 문구를 고친다 |
| `DELETE /api/device`를 재등록 없이 | U1 `api-client.request`에 `{ reregister: false }` 선택지 추가 | business-logic-model §4 |

---

## Part A. 순수 로직 (`src/features/profile/model/`, React 없음)

- [x] **Step 1. 기본 자료·표기**: `regions.ts`(시도 17, 서울 25·경기 31·인천 10 시군구 — BR-U4-25·26), `bands.ts`(거주·무주택·통장 기간 구간, `lowerOf`·`bandOf` — BR-U4-30·31), `amount.ts`(`formatManwon`·`needsConfirm`·`exceedsMax`, 기준 BR-U4-41~44), `hour.ts`(`hourLabel` — BR-U4-74), `districts.ts`(U2 `DISTRICTS`에서 id·이름만) — US-04·05·06·07·09
- [x] **Step 2. 마법사 화면 정의** `steps.ts`: 화면 24개 표(BR-U4-10~16), `visibleSteps`·`nextStep`·`prevStep`·`progress`, `pruneHidden`(BR-U4-12), 필수·[잘 모르겠어요] 규칙(BR-U4-50~53), 생년월일 연도 범위(BR-U4-20) — US-04~08
- [x] **Step 3. 답 ↔ 프로필** `convert.ts`: `toProfile`(BR-U4-13, 구간 → 아래 값, UNKNOWN → null, BR-U4-55), `fromProfile`, `mergeGroupEdit`(BR-U4-71), `summary.ts`(설정 요약 한 줄, 비면 "확인 필요") — US-08·18
- [x] **Step 4. 기기 저장·동기화** `storage.ts`(키 `mz.profile`·`mz.profile.draft`·`mz.notify`·`mz.display`, 깨진 JSON·버전 처리, `clearAllPersonal` — BR-U4-94), `sync.ts`(`createProfileSync`: 상태 전이 domain-entities §4, 동시에 한 번, 최신 값, 400 → failed, 재등록 → 모두 pending — BR-U4-60~69) — US-08·09·18
- [x] **Step 5. 예시 테스트** `model/__tests__/*.test.ts`: 화면 순서 3사례(business-logic-model §2.1), 혼자로 바꿀 때 지울 답, 구간 경계, 한글 금액 표기(0·350·12,000·100,000), 단위 실수 기준 바로 아래·위·상한, 시각 표기(0·9·12·23), §6 어머니 기기 예시 → 프로필, 요약 문구, 저장 키 깨짐, 동기화(성공·오프라인·400·보내는 중 새 저장·재등록)
- [x] **Step 6. 속성 기반 테스트** `model/__tests__/profile-model.pbt.test.ts` + 생성기 `src/features/profile/model/__tests__/arbitraries.ts`(필수가 채워진 `WizardAnswers`, 숨은 화면 답 포함): P-U4-1~10 (domain-entities §6)

## Part B. 서버 API (S3)

- [x] **Step 7. 저장소**: `DeviceRepository.updateNotifySettings(deviceId, { hour, enabled })` — `_shared/db/repositories.ts` 인터페이스, `src/server/db/device-repository.ts`, 테스트 가짜(`fake-db.ts`) — US-09
- [x] **Step 8. 핸들러·라우트**: `src/server/handlers/save-profile.ts`(16KB, `validateProfile`, 활성 지구 확인, 코덱, 저장, 재계산 실패 격리 — BR-U4-100·103·104), `notify-settings.ts`(1KB, 키 검사 — BR-U4-101), `delete-device.ts`(BR-U4-102). 라우트 `src/app/api/profile/route.ts`(PUT), `src/app/api/notify-settings/route.ts`(PUT), `src/app/api/device/route.ts`에 DELETE 추가. `deps.ts`에 연결 — US-08·09·18·20
- [x] **Step 9. 핸들러 테스트** `src/server/handlers/__tests__/`: 200·400(형식·모르는 지구·숫자 아님)·413·401, 재계산 실패여도 200, 로그에 금액·프로필 없음, 알림 설정 키 검사, 삭제 204

## Part C. 클라이언트 기반

- [x] **Step 10. api-client**: `request(path, init, { reregister: false })` 선택지 + 테스트 (U1 파일 수정)
- [x] **Step 11. 상태·모드**: `ProfileProvider`(context: 저장된 프로필·알림 설정·동기화 상태, 앱 시작·`online`·재등록 때 flush — business-logic-model §1), `useDisplayMode` + `DisplayModeScript`(그리기 전 적용, BR-U4-80~83), `layout.tsx` 연결, `BottomNav` 숨김 규칙(BR-U4-03) — US-19

## Part D. 화면

- [x] **Step 12. 처음 실행** `Welcome` + 홈 분기(`src/app/page.tsx`: 프로필 없음 → 안내, 초안 → `/profile/setup`, 있음 → 피드 자리(U5 Placeholder 유지)) — US-02 (BR-U4-01·02)
- [x] **Step 13. 입력 부품**: `BirthDatePicker`, `ChoiceList`, `RegionPicker`, `BandPicker`, `NumberPicker`, `AmountInput`(키패드·한글 금액·확인 창), `DistrictCards`, `MultiChoiceCards`, `WizardProgress`, `WizardNav` — 접근성(frontend-components §6) — US-04~07
- [x] **Step 14. 마법사** `ProfileWizard`(setup·edit 모드, 초안 저장, 화면 바뀔 때 제목에 초점), `ReviewScreen`(그룹 요약·[고치기]·비운 항목 안내·저장 결과 문구), `NotifyStep`(구독 함수 주입, 없으면 BR-U4-16 안내), 라우트 `/profile/setup`, `/profile/edit/[group]` — US-04~08·18 (US-03 자리)
- [x] **Step 15. 설정** `SettingsView`(`SyncBanner`, `ProfileGroupList`, [처음부터 다시 입력하기], `NotifySettings` 즉시 저장, `DisplayModeSelector`, `DeleteAllSection` 확인 창·서버 먼저 삭제), `src/app/settings/page.tsx` — US-09·18·19·20

## Part E. E2E·문서·검증

- [x] **Step 16. E2E** `e2e/profile.spec.ts`: 처음 실행 → 마법사(부부·집 없음·통장 있음) → 저장 → 서버 저장 확인 → 홈; 중간 새로고침 후 이어서; 금액 단위 실수 확인 창; 설정에서 그룹 고치기; 알림 시각 즉시 저장; 쉬운 모드 유지(새로고침, 가로 스크롤 없음); 모두 지우기 → 처음 실행 안내; axe 검사. `e2e/app-shell.spec.ts`는 홈이 처음 실행 안내로 바뀐 것에 맞춰 수정
- [x] **Step 17. 문서**: BR-U4-04 문구 조정, README(화면·API 절), `aidlc-docs/construction/U4-profile-settings/code/code-summary.md`(파일·조정·검증)
- [x] **Step 18. 검증**: typecheck·lint·test(+PBT seed 반복)·build·deno check, 커밋 (push는 사용자 확인 후 → CI에서 E2E)

## 스토리 추적

| 스토리 | Step |
|---|---|
| US-02 | 11, 12, 16 |
| US-04 | 1, 2, 13, 14, 16 |
| US-05 | 1, 2, 13, 14 |
| US-06 | 1, 13, 14, 16 |
| US-07 | 1, 2, 13, 14 |
| US-08 | 3, 4, 8, 14, 16 |
| US-09 | 1, 4, 7, 8, 15, 16 |
| US-18 | 3, 8, 14, 15, 16 |
| US-19 | 11, 15, 16 |
| US-20 | 4, 8, 10, 15, 16 |
| US-03 (자리) | 14 |
