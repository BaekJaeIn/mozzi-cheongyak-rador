# U6 pwa-push — 기술 스택 결정

> 근거: 계획 답변 Q1~Q6. **새 런타임 의존성 없음.**

| 영역 | 결정 | 이유 |
|---|---|---|
| 웹 푸시 보내기 (Q1=A) | `supabase/functions/_shared/push/`에 **Web Crypto로 직접 구현**: 내용 암호화 RFC 8291(`aes128gcm`, ECDH P-256 + HKDF-SHA256 + AES-128-GCM), 서버 신분 RFC 8292(VAPID, ES256 JWT, `Authorization: vapid t=…, k=…`). Deno(`dispatch`)와 Node(`/api/push/test`)가 **같은 코드** | 두 실행 환경에 같은 동작, 새 의존성 없음. RFC 8291 부록 A 시험 값과 바이트 단위로 같은지 테스트로 고정(NFR-U6-32). 직접 구현하는 부분은 표준 문서 절차를 그대로 따르는 조합뿐이다(암호 알고리즘 자체는 Web Crypto) |
| 보내기 HTTP | `fetch` (`TTL`·`Urgency`·`Content-Encoding: aes128gcm` 헤더) | 표준. 시간 제한은 `AbortSignal.timeout` |
| VAPID 키 (Q2=A) | P-256 키 1쌍. 생성 스크립트 `scripts/generate-vapid.mjs`(Web Crypto, 개인 키는 화면에만 한 번 출력 — 파일로 남기지 않음). 저장 위치: Supabase 비밀값 `VAPID_PRIVATE_KEY`·`VAPID_PUBLIC_KEY`, Vercel 환경 변수 같은 이름. subject `https://mozzi-cheongyak-rador.vercel.app` | 개인 키가 저장소·로그에 남지 않게. 교체 절차는 setup 문서 |
| 발송 실행 | Supabase Edge Function `dispatch` + pg_cron 매시 정각 + Vault 비밀 헤더 (U3 `invoke_edge_function` 재사용) | 기존 운영 방식과 같음 |
| 대상 고르기 | U5 `buildFeed`의 노출·정렬 부분을 `_shared`로 옮겨 피드(Node)와 발송(Deno)이 함께 씀 | US-10 "피드와 똑같다"를 코드로 보장 |
| 발송 기록 (Q5=A) | 새 표 `dispatch_runs`(30일 정리), U1 logger | U3 `collect_runs`와 분리 — 수집과 발송의 칸이 다르다 |
| 서비스워커 | 손으로 쓴 `public/sw.js`(빌드 도구·라이브러리 없음): `push`·`notificationclick`·`pushsubscriptionchange`만, 캐시 없음 | 단순하고 오래된 화면을 보일 위험이 없다 |
| manifest | Next App Router `src/app/manifest.ts` | 프레임워크 기본 기능 |
| 아이콘 (Q6=X) | **첨부한 반려견 사진**을 원본으로: 머리 전체(귀~턱)가 들어가게 정사각형으로 잘라 흰 바탕. `any` 192·512, `maskable` 192·512(얼굴을 82%로 줄여 가장자리 여백 — 둥글게 잘려도 귀·턱이 남음), iPhone 180. 생성은 이미 있는 Playwright로 그리는 일회용 스크립트 `scripts/render-icons.mjs`, 결과 PNG를 저장소에 넣음. 원본은 얼굴 부분만 잘라 줄인 이미지(`assets/icon-source.png`)로 저장 | 새 라이브러리 없음, 재현 가능. 잘라 보기 시안 확인(2026-10-16) |
| 테스트 | Vitest + fast-check(PBT), pgTAP, Playwright + axe (U1 PBT-09) | 기존 구성 |

## 새 환경 변수·비밀값

| 이름 | 위치 | 내용 |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Supabase 비밀값, Vercel | base64url 공개 키 (공개 값) |
| `VAPID_PRIVATE_KEY` | Supabase 비밀값, Vercel | base64url 개인 키 (**비밀**) |
| `VAPID_SUBJECT` | Supabase 비밀값, Vercel | `https://mozzi-cheongyak-rador.vercel.app` |
| Vault `dispatch_url` | Supabase Vault | `dispatch` 함수 주소 (U3 `collect_url`과 같은 방식) |
