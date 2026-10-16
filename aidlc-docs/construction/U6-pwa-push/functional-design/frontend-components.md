# U6 pwa-push — 화면 구성

> U1 뼈대·api-client, U4 `PushPort`·`NotifyStep`·`SettingsView`, U5 피드를 그대로 쓴다. 문구·규칙은 business-rules.md.
> 위치: 화면 `src/features/pwa/`, 순수 로직 `src/features/pwa/model/`(React 없음), 서비스워커 `public/sw.js`, 앱 정보 `src/app/manifest.ts`, 아이콘 `public/icons/`.

---

## 1. 앱 정보·아이콘

| 항목 | 값 |
|---|---|
| `name` / `short_name` | "모찌네 청약 알리미" / **"청약 알리미"** (BR-U6-75) |
| `start_url` / `scope` / `display` | `/` / `/` / `standalone` |
| 색 | `theme_color` #0b5cad(U1 primary), `background_color` #f6f7f9(canvas) |
| 아이콘 | 192·512 PNG(`any`), 192·512 PNG(`maskable`, 가장자리 여백), iPhone `apple-touch-icon` 180 PNG |
| iPhone | `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` "청약 알리미" |

## 2. 컴포넌트 구조

```text
RootLayout
└─ PwaProvider                   (서비스워커 등록, 설치 상태·설치 창 이벤트 보관, setPushPort 등록,
                                  기기 준비 뒤 구독 다시 저장, SW 메시지 수신)
    ├─ FeedView (U5)
    │   └─ InstallHintBanner     (BR-U6-72: 설치 안 됐고 7일 안에 닫지 않았을 때)
    ├─ NotifyStep (U4)           ← PushPort 결과에 needs_install 추가 → InstallGuide 열기
    └─ SettingsView (U4)
        ├─ InstallSection        (BR-U6-71)
        ├─ NotifySettings (U4)   ← 스위치를 켰는데 구독 없으면 알림 켜기 흐름 (BR-U6-63)
        └─ TestPushButton        (BR-U6-65~68)

InstallGuide (대화 상자)
├─ AndroidInstall    ([홈 화면에 설치] → 설치 창 | 메뉴 글 안내)
├─ IosInstallSteps   (그림 3장 SVG + 큰 글씨, Safari 아니면 "Safari로 열어 주세요")
└─ [닫기]

DeniedHelp           (기기별 다시 켜는 방법, BR-U6-80)
```

## 3. 상태와 데이터 흐름

| 상태 | 위치 | 누가 바꾸나 |
|---|---|---|
| 서비스워커 등록 | `PwaProvider` (앱 시작 시 `/sw.js` 등록) | 브라우저 |
| 설치 상태·설치 창 이벤트 | `PwaProvider` context (`beforeinstallprompt` 보관, `appinstalled`·`display-mode` 변화 감지) | 브라우저 이벤트 |
| 안내 띠 닫기 | `mz.installHint` | InstallHintBanner [닫기] |
| 알림 권한·구독 | 브라우저 (`Notification.permission`, `pushManager`) | 알림 켜기 흐름 |
| 서버 구독 | `POST /api/push/subscribe` | 알림 켜기, 앱 열 때 다시 저장 |

## 4. 컴포넌트별 속성·동작

| 컴포넌트 | 동작·접근성 |
|---|---|
| `PwaProvider` | `setPushPort({ supported, isSubscribed, subscribe })` 등록 — U4 마법사 알림 단계가 이때부터 보인다 |
| `InstallHintBanner` | `role="region"` + 제목, [방법 보기]·[닫기] 버튼(최소 터치 크기). 닫으면 바로 사라지고 "7일 동안 보이지 않아요" 안내 없이 조용히 |
| `InstallGuide` | `role="dialog"` + `aria-modal`, 열면 제목에 초점, Esc·[닫기]로 닫힘, 닫으면 연 버튼으로 초점 복귀. 그림은 `alt`에 단계 설명 |
| `IosInstallSteps` | `<ol>` 3단계, 각 단계 그림(SVG) + 굵은 글씨 한 줄 + 보조 한 줄 |
| `TestPushButton` | 보내는 중 비활성 + "보내는 중이에요…", 결과는 `role="status"` |
| `DeniedHelp` | 기기 종류별 한 단락, `<ol>`로 단계 |
| `NotifyStep`(U4 수정) | `needs_install` 결과면 설치 안내 문구 + [설치 방법 보기] |

## 5. 사용하는 API

| 화면 | API |
|---|---|
| `PwaProvider`, 알림 켜기 | `GET /api/push/key`(공개 키), `POST /api/push/subscribe` |
| `TestPushButton` | `POST /api/push/test` |
| 서비스워커 | API를 부르지 않는다(기기 토큰 없음). 구독 변경은 화면에 부탁 |

## 6. 서비스워커 `public/sw.js`

| 이벤트 | 동작 |
|---|---|
| `install`·`activate` | 즉시 활성화(`skipWaiting`·`clients.claim`). 페이지 캐시 없음 (BR-U6-94) |
| `push` | 내용(JSON) 읽기 → `showNotification(title, { body, tag, icon: 192, badge, data: { url } })`. 내용이 깨졌으면 기본 문구 "새 공고를 확인해 보세요" + `/` |
| `notificationclick` | 닫기 → `safeClickUrl` → 열린 창 focus·이동, 없으면 `openWindow` |
| `pushsubscriptionchange` | 열린 창에 `{ type: "resubscribe" }` 메시지 |

## 7. U4·U5 연결

| 대상 | 변경 |
|---|---|
| U4 `push-port.ts` | `PushSubscribeResult`에 `"needs_install"` 추가 |
| U4 `NotifyStep`·`SettingsView` | `needs_install`·`denied` 결과에 설치 안내·DeniedHelp 연결, 설정에 InstallSection·TestPushButton |
| U5 `FeedView` | 위에 `InstallHintBanner` |
| `layout.tsx` | `PwaProvider`, iPhone 메타·아이콘 |

## 8. 접근성·고령자 UX (NFR-1)

- 글씨·터치 크기 토큰과 쉬운 모드 배율을 따른다. 대화 상자는 초점 가두기·복귀.
- 그림만으로 설명하지 않는다 — 단계마다 글로도 쓴다.
- 권한 창은 버튼을 눌렀을 때만(놀라지 않게), 결과는 `role="status"`로 읽힌다.
- E2E axe 위반 0 (설정·피드 안내 띠·설치 안내 대화 상자).
