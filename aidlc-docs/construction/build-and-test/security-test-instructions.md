# 보안 점검 안내

> Security Baseline 확장은 꺼져 있다(Requirements Analysis 결정). 아래는 요구사항 NFR-2(개인정보)와 Unit별 보안 결정을 점검하는 최소 항목이다.

## 점검 항목과 결과 (2026-10-17)

| 항목 | 방법 | 결과 |
|---|---|---|
| 운영 의존성 취약점 | `npm audit --omit=dev` | ✅ 0건 |
| 개발 의존성 취약점 | `npm audit` | ⚠ high 5건 — 모두 `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`(깊게 중첩한 패턴에서 서비스 거부). **린트 도구에서만 쓰이고 배포물에 들어가지 않음**, npm 제안(14로 낮추기)은 맞지 않음 → **위험 수용**, Next 15·16 계열 수정판이 나오면 올림 |
| 저장소 비밀값 | `git grep`(JWT·Google API 키·개인 키 패턴), `git ls-files`의 `.env*` | ✅ 패턴 없음, 커밋된 env는 `.env.example`뿐 |
| DB 권한(RLS) | pgTAP `security.test.sql` 외 | ✅ anon·authenticated는 표·RPC 접근 불가, 발송 함수는 service_role만 |
| API 인증 | 핸들러 테스트 | ✅ 기기 인증 없으면 401, 본문 크기 413, 형식 400 |
| 함수 호출 보호 | `dispatch` 로컬 실행 | ✅ 틀린 비밀값 401 |
| 서버가 임의 주소로 요청하지 않음 | 구독 주소 허용 목록 테스트(+PBT P-U6-6) | ✅ https·알려진 푸시 서비스만, IP·포트·계정 표기 거부 |
| 로그에 개인정보·비밀값 없음 | 핸들러 테스트(금액·프로필·구독 주소·키 미포함) | ✅ |
| 알림 내용 | P-U6-4 | ✅ 공고 이름·건수만 |
| 금액 암호화 | U2 코덱 테스트 | ✅ 서버 DB에는 암호문만 |

## 정기 점검

- 매 배포 전: `npm audit --omit=dev`
- 비밀값이 새어 나갔다고 의심되면: VAPID(setup-guide-u6 "키 교체"), CRON_SECRET(U3 setup-guide), 금액 암호화 키(README "암호화 키 교체")

## 변경 요청 2 점검 (2026-10-20)

| 항목 | 결과 |
|---|---|
| 운영 의존성 취약점 (`npm audit --omit=dev`) | ✅ 0건 |
| 커밋 비밀값 (50d407c..HEAD, 키·토큰 형식 검색) | ✅ 없음 |
| SH 화면 사본(fixtures) 개인정보 | ✅ 전화번호·이메일 형식 없음(가림) |
| AI에 보내는 것 | 공고 정보만(공급 위치 `supplySigungu` 추가). 프로필·관심 지역은 보내지 않음 |
| 새 DB 함수 권한 | `interest_area_match`·`notice_in_any_interest`·`analysis_backlog`: anon 불가, `invoke_edge_function`: service_role 불가(cron 전용) — pgTAP |
| 업데이트 기록 `mz.updates` | 기기에만, 개인 정보 없음(안내 번호·항목 이름), 모두 지우기에서 삭제 |
