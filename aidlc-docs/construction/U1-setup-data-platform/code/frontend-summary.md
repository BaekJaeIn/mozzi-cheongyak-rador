# U1 — 프론트엔드 요약 (Step 11~13)

## 생성 파일

| 파일 | 내용 | 근거 |
|---|---|---|
| `src/app/globals.css` | Tailwind v4 `@theme inline` 디자인 토큰: `--scale`(일반 1 / `html[data-mode="easy"]` 1.25), 글씨 `text-caption`(16)·`text-body`(18)·`text-title`(22)·`text-heading`(26), 터치 `min-h-touch`(48), 헤더 56, 색 8종(AA 대비), 초점 표시 | NFR-U1-26, NFR-1 |
| `src/app/layout.tsx` | `lang="ko"`, `data-mode="normal"`, 메타데이터, 글자 확대 허용 viewport, 헤더 + DeviceBootstrap + 하단 메뉴 | NFR-U1-28 |
| `src/app/icon.svg`, `public/icons/icon.svg` | 임시 아이콘 (U6에서 PWA용 PNG로 교체) | CG-3 |
| `src/features/app-chrome/AppHeader.tsx` | 서버 컴포넌트, 제목 막대 | |
| `src/features/app-chrome/BottomNav.tsx` | 맞춤 공고 / 관심 공고 / 설정, `aria-current`, 활성 표시 = 색 + 굵기 + 위쪽 막대, `isActive`(공고 상세는 피드로 판단) | §2 BottomNav |
| `src/features/app-chrome/ErrorMessage.tsx` | `role="alert"`, 메시지 + 큰 버튼 | BR-U1-20 |
| `src/features/app-chrome/Placeholder.tsx`, `constants.ts` | 자리 화면, 앱 이름 | |
| `src/features/device/identity-store.ts` | `mz.device` 읽기·쓰기·손상 값 정리, 메모리 저장소(테스트용) | L2 |
| `src/features/device/api-client.ts` | `createApiClient`: `ensureDevice`(등록된 기기는 네트워크 없음), `request`(헤더 첨부, 1회 재시도, 401 재등록 후 1회 재요청), `onReRegistered`(U4 프로필 재동기화용), 409 시 새 ID 재등록 | L1, P-R1, BR-U1-03·09·10 |
| `src/features/device/DeviceBootstrap.tsx`, `BootError.tsx` | 준비 중 → 화면 / 오류 + [다시 시도] | §2 |
| `src/app/page.tsx`, `bookmarks/page.tsx`, `settings/page.tsx` | 자리 화면 (U4·U5에서 교체) | |

**조정**: `layout.tsx`에서 `APP_NAME`을 export하면 Next.js 레이아웃 export 규칙에 걸리므로 `constants.ts`로 옮김.

## 테스트

| 파일 | 종류 | 내용 |
|---|---|---|
| `device/__tests__/identity-store.test.ts` | 예시 | 저장·읽기, 없음, 손상 값 3종 정리 |
| `device/__tests__/api-client.test.ts` | 예시 | 등록된 기기 무요청, 첫 등록·저장, 409 재등록, 등록 네트워크 실패, 헤더 첨부, 5xx 1회 재시도, 재시도 상한, 4xx 무재시도, 401 재등록 + 알림 + 새 헤더로 재요청, 재등록 후 401 반복 없음, 204, 비정상 오류 본문 → SERVER |
| `app-chrome/__tests__/bottom-nav.test.ts` | 예시 | 활성 판단 |
| `e2e/app-shell.spec.ts` | E2E | 첫 실행 등록 1번·새로고침 시 재등록 없음, 메뉴 이동·`aria-current`, 터치 48px, 화면 3개 axe 위반 0건 (**Docker 설치 후 실행**) |

**실행 결과**: Vitest 94개 통과, `tsc --noEmit` 오류 없음. E2E는 미실행 (Docker 없음).
