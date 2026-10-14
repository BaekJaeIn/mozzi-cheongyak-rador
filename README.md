# 모찌네 청약 알리미

3기 신도시(남양주 왕숙, 하남 교산, 고양 창릉, 부천 대장, 인천 계양, 광명 시흥)의 분양·임대 공고를 매일 모아서,
만 60세 이상 노부부 가구에 **자격이 되는 공고만** 골라 하루 1번 알려 주는 개인용 PWA입니다.

- 요구사항·설계 문서: [`aidlc-docs/`](aidlc-docs/) (AI-DLC 방식)
- 원래 기획: [`SPEC.md`](SPEC.md)

## 구성

| 영역 | 기술 |
|---|---|
| 화면·API | Next.js (App Router) + TypeScript + Tailwind CSS, Vercel (`icn1`) |
| DB·예약 작업 | Supabase (PostgreSQL, RLS, pg_cron, Edge Functions), `ap-northeast-2` |
| 테스트 | Vitest, fast-check(속성 기반 테스트), Playwright + axe, pgTAP |

```text
src/app/                  화면과 API 라우트
src/features/             화면 기능 (app-chrome, device, …)
src/server/               서버 전용 코드 (환경 변수, 인증, DB, 핸들러)
supabase/functions/_shared/  Node·Deno 공용 순수 코드 (npm 패키지 import 금지)
supabase/migrations/      DB 구조·권한·DB 함수·예약 작업
supabase/tests/           DB 테스트 (pgTAP)
e2e/                      E2E 테스트
```

## 필요한 도구

- Node.js 24 (`.nvmrc`)
- Docker Desktop: 로컬 Supabase, DB 테스트, E2E에 필요
- Supabase CLI: `npx supabase` (devDependency로 포함)
- (선택) Deno 2: `npm run deno:check`

## 로컬 실행

```bash
npm install
npm run db:start              # 로컬 Supabase 시작 (마이그레이션 적용)
npx supabase status -o env    # API_URL, SERVICE_ROLE_KEY 확인
cp .env.example .env.local    # 위 값과 개발용 암호화 키를 채운다
npm run dev                   # http://localhost:3000
```

개발용 암호화 키 만들기 (운영 키와 **다른 값**을 쓰세요):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 서버 / 빌드 / 실행 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run lint` | ESLint |
| `npm test` | 단위 + 속성 기반 테스트 |
| `npm run deno:check` | `supabase/functions` Deno 타입 검사 |
| `npm run db:reset` | 로컬 DB 초기화 + 마이그레이션 + `seed.sql` |
| `npm run db:test` | DB 테스트 (pgTAP) |
| `npm run e2e` | E2E (빌드 후 실행, 로컬 Supabase 필요) |

## 속성 기반 테스트(PBT) seed 재현

테스트를 시작하면 `[PBT] seed=… numRuns=…`가 출력됩니다. 실패한 테스트는 같은 seed로 똑같이 재현할 수 있습니다.

```bash
FC_SEED=123456 npm test -- supabase/functions/_shared/domain
```

- CI는 실행마다 seed를 만들어 로그에 남기고 200회씩 실행합니다.
- 실패를 재시도로 덮지 않습니다. 찾은 반례는 예시 기반 회귀 테스트로 추가합니다.
- `test.prop` 속성 함수는 **블록 본문**으로 쓰고 값을 반환하지 않습니다.
- 파일 이름: 예시 기반 `*.test.ts`, 속성 기반 `*.pbt.test.ts`

## 환경 변수

[`.env.example`](.env.example)에 목록이 있습니다. 비밀 값은 저장소에 커밋하지 않습니다.
브라우저에 노출되는 값은 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 하나뿐이어야 합니다.

## 배포

처음 구축하는 순서는 [`aidlc-docs/construction/U1-setup-data-platform/code/setup-guide.md`](aidlc-docs/construction/U1-setup-data-platform/code/setup-guide.md)를 따릅니다.

- 화면·API: `main`에 push하면 Vercel이 자동 배포 (미리보기 배포 끔)
- DB: `npx supabase db push` (사람이 직접 실행, **코드 배포보다 먼저**)
