# U3 collection-pipeline — 기술 스택 결정

U1·U2 결정을 그대로 쓰고, Deno Edge Function에 필요한 것만 추가한다.

| 영역 | 결정 | 이유 |
|---|---|---|
| 런타임 | Supabase Edge Functions (Deno 2) | U1 AD-6 |
| Supabase 클라이언트 (Deno) | `npm:@supabase/supabase-js@2.117.3` (Node와 같은 버전 고정) | 한 버전으로 Node·Deno 동작 일치 |
| 공용 코드 | `_shared/` 상대경로 + `.ts` 확장자 import | U1 규칙 |
| Deno 전용 코드 위치 | `supabase/functions/_lib/` (DB 구현, Gemini 호출, fetch 래퍼) | CG-1 |
| HTML 파싱 | **정규식·문자열 파서** (cheongYak-radar `parsers.ts` 방식). DOM 라이브러리 없음 | GH 메인 카드는 구조가 단순, 의존성 최소. 파서는 순수 함수로 `_shared/collect/parsers/`에 두어 Vitest로 테스트 |
| Gemini 호출 | REST `generateContent` 직접 호출 (`fetch`), PDF는 `inline_data`(base64), 구조화 출력(`responseMimeType: application/json` + `responseSchema`), 사고 예산 제한·출력 토큰 상한 | SDK 없이 Deno에서 단순. cheongYak-radar 방식 |
| Gemini 모델 | 환경 변수 `GEMINI_MODEL`, 기본 `gemini-2.5-flash` | 계획에서 결정 |
| 해시 | WebCrypto SHA-256 (U1 `hashToken`과 같은 방식) | 표준 API |
| 시간 제한 | `AbortSignal.timeout(ms)` | 표준 API |
| 테스트 | Vitest + fast-check (`_shared/collect/`), 오케스트레이터는 주입한 가짜 의존성으로 Vitest. `deno check`는 CI | NFR-U3-23·24 |
| 픽스처 | `supabase/functions/_shared/__tests__/fixtures/collect/` (실제 응답 샘플 — 공개 공고 정보만) | NFR-U3-22 |

## cheongYak-radar에서 가져올 것 (Code Generation 계획에 파일·변경점 기록)

| 파일 | 가져오는 이유 | 바꿀 점 |
|---|---|---|
| `collectors/apply-home.ts` | 검증된 엔드포인트·필드명 | 지역 필터를 경기·인천으로, RawNotice 형식으로, 순수 파서 분리 |
| `collectors/lh.ts` | 목록 15058530 + 상세 15057999 조합, 응답 배열 형식 처리 | 지역본부 필터 수정, 첨부파일(공고문 PDF) 추출 추가 |
| `collectors/gh.ts`, `collectors/parsers.ts`(GH 부분) | 메인 카드 파서, 대기열 감지 | 첨부 링크(상세 페이지) 확인 |
| `analyze.ts` (Gemini 호출부) | 사고 토큰 대응, JSON 강제 | 프롬프트·스키마를 U2 `Requirements`로, PDF 입력 |
| `mock.ts` | 목업 구조 | 3기 신도시 공고로 새로 작성 |

## 변경 요청 2 (2026-10-18)

새 라이브러리 없음. SH HTML은 GH와 같은 방식(정규식·문자열 파싱, `parsers/html.ts` 공용 도구)으로 읽는다. 두 묶음 호출은 기존 pg_cron + `invoke_edge_function`에 요청 본문만 더한다.
