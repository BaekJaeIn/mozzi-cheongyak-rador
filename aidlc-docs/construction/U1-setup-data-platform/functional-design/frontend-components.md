# U1 setup-data-platform — 프론트엔드 컴포넌트

> U1은 화면 기능이 아니라 **모든 화면이 공유하는 뼈대**와 **기기 준비**만 만든다. 각 화면 내용은 U4·U5·U6.

---

## 1. 컴포넌트 계층

```text
RootLayout (src/app/layout.tsx)
 +- DisplayModeRoot      (html 요소에 data-mode, CSS 변수 --scale; 값 공급은 U4, 기본 normal)
 +- DeviceBootstrap      (앱 시작 시 ensureDevice, 실패 시 BootError)
 |   +- BootError        (인터넷 오류 안내 + [다시 시도])
 +- AppHeader            (앱 이름 "모찌네 청약 알리미")
 +- <main>{children}</main>
 +- BottomNav            (피드 / 관심 공고 / 설정)
 +- ErrorMessage         (공통 오류 문구 표시용, 다른 Unit이 사용)
```

## 2. 컴포넌트 정의

### DeviceBootstrap
| 항목 | 내용 |
|---|---|
| props | `children` |
| state | `status: 'checking' \| 'ready' \| 'error'` |
| 동작 | 마운트 시 `ensureDevice()` (business-logic-model §1). `ready`가 되면 children 표시, `error`면 BootError |
| 사용 API | `POST /api/device` |
| 비고 | 이미 등록된 기기는 네트워크 없이 바로 `ready` (오프라인에서도 관심 공고 등 로컬 기능 사용 가능) |

### BootError
| 항목 | 내용 |
|---|---|
| props | `onRetry()` |
| 표시 | "인터넷 연결을 확인해 주세요" + 큰 [다시 시도] 버튼 |

### AppHeader
| 항목 | 내용 |
|---|---|
| props | `title?`(기본 앱 이름), `back?`(상세 화면에서 뒤로 가기) |
| 규칙 | 높이 56px 이상, 제목 20px 이상(일반 모드) |

### BottomNav
| 항목 | 내용 |
|---|---|
| 항목 | 피드(`/`), 관심 공고(`/bookmarks`), 설정(`/settings`): 아이콘 + 글자 라벨 |
| 규칙 | 각 항목 터치 영역 ≥ 48×48px, 현재 위치는 색과 굵기 **두 가지**로 표시(색만으로 구분 금지), 라벨 16px 이상 |
| 상태 | 현재 경로 (`usePathname`) |

### ErrorMessage
| 항목 | 내용 |
|---|---|
| props | `message: string`, `action?: { label; onClick }` |
| 규칙 | API의 `{ code, message }` 중 `message`만 보여준다 (BR-U1-20). 코드는 화면에 노출하지 않음 |

## 3. 디자인 토큰 (모든 Unit 공통, NFR-1)

| 토큰 | 일반 모드 | 쉬운 모드 | 비고 |
|---|---|---|---|
| `--scale` | 1 | 1.25 | U4의 DisplayMode가 바꿈 |
| 본문 글씨 | 16px | 22.5px | NFR-1.1 (2026-10-17 사용자 요청으로 변경) |
| 제목 글씨 | 19px (큰 제목 22px) | 27.5px (32.5px) | |
| 보조 글씨 | 14px | 20px | 글씨는 모드별 값(--fs-*), 간격만 scale |
| 최소 터치 영역 | 48px × scale | 60px | NFR-1.2 |
| 줄 간격 | 1.6 | 1.6 | |
| 색 대비 | 본문 4.5:1 이상 | 동일 | WCAG AA |

Tailwind 설정에서 위 토큰을 CSS 변수로 연결해, 다른 Unit은 토큰 클래스만 쓴다.

### 3.1 디자인 정리 (2026-10-17 사용자 요청)

- 글꼴: Pretendard(OFL, npm `pretendard` 동적 부분 집합 — 쓰는 글자 묶음만 내려받음), 없으면 시스템 글꼴
- 색: 글자 #191f28 / 보조 #4e5968 / 기본 #1b64da / 바탕 #f2f4f6 / 구분선 #dde1e6 / 입력칸 테두리 #8b95a1(3:1) / 위험 #d22030
- 카드: 테두리 대신 둥근 모서리(20px) + 옅은 그림자(`rounded-card`, `shadow-card`). 보조 버튼은 흰 바탕 + 얇은 테두리
- 배지: 색 바탕 + 글자(테두리 없음), 글자를 항상 쓰므로 색만으로 구분하지 않음
- 상단 막대: 앱 아이콘 + 이름, 오른쪽 [작은 글씨 | 큰 글씨] 토글(U4 BR-U4-82). 큰 글씨에서는 이름을 숨기고 아이콘만

### 3.2 휴대폰 뒤로 버튼 (2026-10-17 사용자 요청)

- 앱 안 이동은 모두 replace — 방문 기록을 거슬러 가지 않고 화면 위계로만 움직인다 (`src/features/app-chrome/back-target.ts`)
- 뒤로 버튼은 CloseWatcher(Android Chrome 120+)로 받는다. Chrome은 사용자 조작 없이 넣은 방문 기록 칸을 뒤로 버튼에서 건너뛰어 기록 방식만으로는 첫 누름에 종료됐다. CloseWatcher가 없는 브라우저만 기록 지킴이 방식(터치 때 다시 넣음)
- 공고 상세 → 들어온 목록(맞춤 공고/관심 공고), 관심 공고·설정 → 맞춤 공고, 내 정보 고치기 → 설정
- 맞춤 공고(첫 화면)에서 누르면 "뒤로 버튼을 한 번 더 누르면 종료돼요" 안내, 2초 안에 한 번 더 누르면 종료
- 알림으로 상세를 바로 연 경우에도 뒤로 → 맞춤 공고

## 4. 사용자 상호작용 흐름

```text
첫 실행: 앱 열기 -> DeviceBootstrap(checking, 짧은 로딩 표시) -> 등록 성공 -> 화면 표시
          (프로필이 없으면 U4의 시작 안내 화면, US-02)
오프라인 첫 실행: -> BootError -> [다시 시도]
재방문: 앱 열기 -> 바로 화면 표시
```

## 5. 폼 검증
U1에는 사용자 입력 폼이 없다 (Q4=B로 가족 코드 입력 화면 없음).
