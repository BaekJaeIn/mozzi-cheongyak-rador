# U4 profile-settings — 화면 구성

> U1 뼈대(AppHeader·BottomNav·DeviceBootstrap, 크기 토큰 `--scale`)와 U1 api-client를 그대로 쓴다. 화면 문구·규칙은 business-rules.md, 데이터 형식은 domain-entities.md.
> 위치: 화면 코드 `src/features/profile/`·`src/features/settings/`·`src/features/display-mode/`, 순수 로직 `src/features/profile/model/`(React 없음, 단위·속성 테스트 대상), API 핸들러 `src/server/handlers/`.

---

## 1. 화면(경로)

| 경로 | 화면 | 하단 메뉴 | 스토리 |
|---|---|---|---|
| `/` | 프로필 없음 → `Welcome`(처음 실행), 초안 있음 → `/profile/setup`으로 이동, 프로필 있음 → 피드(U5) | 프로필 있을 때만 | US-02 |
| `/profile/setup` | `ProfileWizard mode="setup"` (처음 입력·처음부터 다시) | 숨김 | US-04~08 |
| `/profile/edit/[group]` | `ProfileWizard mode="edit" group=…` (그룹 고치기) | 숨김 | US-18 |
| `/settings` | `SettingsView` | 보임 | US-09·18·19·20 |

- 프로필이 없는데 `/settings`·`/bookmarks`로 들어오면 `/`로 보낸다.
- 하단 메뉴 숨김은 `BottomNav`가 경로(`/profile/*`)와 프로필 유무로 정한다.

## 2. 컴포넌트 구조

```text
RootLayout
├─ DisplayModeScript      (head 인라인 스크립트: mz.display → html[data-mode], 그리기 전에)  BR-U4-83
├─ AppHeader
├─ DeviceBootstrap (U1)
│   └─ ProfileProvider    (mz.profile·mz.notify 읽기, ProfileSync 시작: 앱 시작·online·재등록 때 flush)
│       ├─ HomeGate (/)   → Welcome | 이동 | Feed(U5)
│       ├─ ProfileWizard
│       │   ├─ WizardProgress        ("주택·통장 7/16")
│       │   ├─ StepScreen (화면 ID별)
│       │   │   ├─ BirthDatePicker   (연·월·일 큰 목록 + "만 N세")
│       │   │   ├─ ChoiceList        (큰 보기 버튼, 단일 선택, [잘 모르겠어요] 옵션)
│       │   │   ├─ RegionPicker      (시도 17 → 서울·경기·인천 시군구)
│       │   │   ├─ BandPicker        (기간 구간)
│       │   │   ├─ NumberPicker      (가족 수 2~8, 납입 횟수 0~600)
│       │   │   ├─ AmountInput       (만원 키패드 + 한글 금액 + 단위 실수 확인 창)
│       │   │   ├─ DistrictCards     (6개 큰 체크 카드)
│       │   │   └─ MultiChoiceCards  (면적 4구간)
│       │   ├─ ReviewScreen          (그룹 요약 + [고치기] + 비운 항목 안내 + [저장])
│       │   ├─ NotifyStep            (U6 구독 연결 자리)
│       │   └─ WizardNav             ([이전] [다음] / [잘 모르겠어요], 위에 [처음부터 다시])
│       └─ SettingsView
│           ├─ SyncBanner            (pending·failed 안내 + [지금 다시 보내기])
│           ├─ ProfileGroupList      (그룹 7줄: 요약 + [고치기]) + [처음부터 다시 입력하기]
│           ├─ NotifySettings        (스위치 + 시각 목록, 즉시 저장)
│           ├─ DisplayModeSelector   (일반 / 쉬운 모드)
│           └─ DeleteAllSection      ([내 정보 모두 지우기] + 확인 창)
└─ BottomNav
```

## 3. 상태와 데이터 흐름

| 상태 | 위치 | 누가 바꾸나 |
|---|---|---|
| 저장된 프로필·동기화 상태 | `mz.profile` ↔ `ProfileProvider` (React context) | 마법사 [저장], 설정 고치기, ProfileSync, 모두 지우기 |
| 마법사 답·현재 화면 | `ProfileWizard` 안 `useReducer` + `mz.profile.draft`(setup만) | 화면 입력, [이전]/[다음] |
| 알림 설정 | `mz.notify` ↔ `ProfileProvider` | NotifySettings, ProfileSync |
| 화면 모드 | `mz.display` ↔ `useDisplayMode()` → `html[data-mode]` | DisplayModeSelector |
| 기기 ID·토큰 | `mz.device` (U1) | U1 api-client, 모두 지우기 |

순수 로직 (`src/features/profile/model/`, React·브라우저 API 없음):

| 모듈 | 함수 |
|---|---|
| `steps.ts` | `STEPS`, `visibleSteps(answers)`, `nextStep`, `prevStep`, `progress(answers, stepId)`, `pruneHidden(answers)` |
| `convert.ts` | `toProfile(answers)`, `fromProfile(profile)`, `mergeGroupEdit(current, edited, group)` |
| `bands.ts` | `YEAR_BANDS`·`HOMELESS_BANDS`·`MONTHS_BANDS`, `lowerOf`, `bandOf` |
| `amount.ts` | `formatManwon(n)`, `parseKoreanManwon(s)`(테스트용), `needsConfirm(field, n)`, `exceedsMax(n)` |
| `regions.ts` | `SIDO_OPTIONS`(16), `SIGUNGU_BY_SIDO`(서울 25·경기 31·인천 11) |
| `summary.ts` | `groupSummary(profile, group)` (설정 요약 한 줄) |
| `hour.ts` | `hourLabel(h)` ("오전 9시") |
| `storage.ts` | `loadStoredProfile`·`saveStoredProfile`·`loadDraft`·`saveDraft`·`clearDraft`·`loadNotify`·`saveNotify`·`clearAllPersonal` (KeyValueStorage 주입, 깨진 JSON 처리) |
| `sync.ts` | `createProfileSync({ storage, api })` — 상태 전이(domain-entities §4), 동시에 한 번만 |

## 4. 컴포넌트별 속성·동작

| 컴포넌트 | 속성 | 동작·검증 |
|---|---|---|
| `Welcome` | `onStart()` | 제목·설명 3줄·[시작하기] 하나 (BR-U4-01) |
| `ProfileWizard` | `mode: "setup" \| "edit"`, `group?`, `initial?: WizardAnswers` | setup: 초안에서 시작(없으면 빈 답), 화면을 넘길 때 초안 저장. edit: `fromProfile` 값으로 시작, 그 그룹 화면만, 초안 저장 안 함, [취소] 있음 |
| `WizardProgress` | `groupLabel`, `index`, `total` | `aria-label="7번째 화면, 전체 16개 중"` |
| `BirthDatePicker` | `value`, `yearRange`, `onChange` | 큰 목록 3개(연·월·일), 일 목록은 달에 맞춤(BR-U4-21), 미래 날짜 막음, 다 고르면 "만 N세" |
| `ChoiceList` | `options[{ value, label, help? }]`, `allowUnknown` | 보기 버튼 높이 ≥ `--spacing-touch`, 선택 표시는 색 + 체크 아이콘(색만으로 구분하지 않음) |
| `RegionPicker` | `value { sido, sigungu }` | 시도 고른 뒤 서울·경기·인천이면 시군구 목록 이어서 표시, 다른 시도면 바로 [다음] 가능 |
| `BandPicker` | `bands`, `value`, `allowUnknown` | 구간 이름 그대로 표시("2~3년") |
| `AmountInput` | `field`, `value`, `allowUnknown` | `inputMode="numeric"`, 숫자 외 입력 무시, 아래에 한글 금액(큰 글씨, `aria-live="polite"`), [다음] 때 `exceedsMax` → 오류, `needsConfirm` → 확인 창(같은 값 재확인 안 함) |
| `DistrictCards` | `districts`(기준 데이터 6개), `value` | 처음엔 모두 선택(BR US-07), 0개면 [다음] 막고 "한 곳 이상 골라 주세요" |
| `MultiChoiceCards` | 면적 4구간("작게 ~40㎡(약 12평)" 등) | 여러 개 선택, 0개 = "상관없음" 표시 |
| `ReviewScreen` | `answers` | `toProfile` 미리 계산해 그룹 요약, `null` 항목이 있으면 안내(BR-U4-54), [저장] 누르면 버튼 막고 "저장하는 중이에요" |
| `NotifyStep` | `subscribe?: () => Promise<Result>` (U6에서 주입) | 소개 문구 → [알림 받기] / [나중에]. `subscribe` 없거나 미지원이면 BR-U4-16 안내 |
| `SyncBanner` | `sync` | pending: "내 정보를 아직 서버에 보내지 못했어요. 인터넷이 연결되면 다시 보낼게요" + [지금 다시 보내기], failed: BR-U4-66 문구 |
| `NotifySettings` | `value { hour, enabled }` | 스위치(`role="switch"`), 시각 목록 24개, 바꾸면 즉시 저장 + "바꿨어요"(2초, `aria-live`) |
| `DisplayModeSelector` | — | 두 보기 큰 버튼, 고르면 즉시 `html[data-mode]` 변경 |
| `DeleteAllSection` | — | 확인 창(`role="alertdialog"`, 처음 초점은 [취소]), 진행 중 버튼 막음, 결과에 따라 BR-U4-92~96 |

## 5. 사용하는 API

| 컴포넌트 | API | 호출 방식 |
|---|---|---|
| `ProfileProvider`·`ReviewScreen`·고치기 [저장] | `PUT /api/profile` | `ProfileSync.flush()` 경유 (U1 api-client: 인증 헤더·1회 재시도·재등록) |
| `NotifySettings` | `PUT /api/notify-settings` | `ProfileSync.flush()` 경유 |
| `DeleteAllSection` | `DELETE /api/device` | U1 api-client의 **재등록하지 않는** 요청으로 (business-logic-model §4) |
| `DistrictCards` | (없음) | 지구 6개 목록은 U2 기준 데이터 시드와 같은 값을 앱에 함께 넣는다(`DISTRICTS`의 id·이름). 서버는 저장 때 활성 지구인지 확인 |
| `NotifyStep`·`NotifySettings` | `POST /api/push/subscribe` | U6 (U4에서는 주입 자리만) |

## 6. 접근성·고령자 UX (NFR-1)

- 모든 버튼·보기 높이 ≥ `--spacing-touch`(48px × 배율), 글씨는 크기 토큰만 사용 → 쉬운 모드에서 함께 커짐.
- 화면마다 질문이 제목(`h1`)이고, 화면이 바뀌면 초점을 제목으로 옮긴다(화면 낭독기가 새 질문을 읽음).
- 오류·안내 문구는 `role="alert"` 또는 `aria-live`로 읽힌다. 빨간색만으로 오류를 표시하지 않는다(아이콘 + 문구).
- 가로 스크롤 없음: 목록·카드는 한 줄 1개, 긴 이름은 줄바꿈 (쉬운 모드 포함, 폭 320px 기준 확인).
- 목록 선택(생년월일·시군구)은 휠 대신 **큰 목록 버튼**으로 만든다(작은 휠은 손떨림에 불리). 연도 목록은 처음 위치(1960년)로 스크롤해서 연다.
