# 공유 인프라 — 모찌네 청약 알리미

> 모든 Unit(U1~U6)이 함께 쓰는 인프라 자원. U1이 만들고, 이후 Unit은 이 문서에 **자기 자원을 추가**한다.
> cheongYak-radar와는 어떤 자원도 공유하지 않는다 (D4·NFR-5.2). 단, data.go.kr·Gemini **API 키 값**만 재사용한다 (D4).

---

## 1. 공유 자원

| 자원 | 이름·위치 | 만든 Unit | 쓰는 Unit |
|---|---|---|---|
| GitHub 저장소 | (첫 구축 때 기록) | U1 | 전체 |
| GitHub Actions | `ci.yml`, `e2e.yml`, `keepalive.yml` | U1 | 전체 |
| Vercel 프로젝트 | `https://<프로젝트명>.vercel.app`, `icn1` | U1 | U1, U4, U5, U6 |
| Supabase 프로젝트 | `ap-northeast-2`, 무료 플랜 | U1 | 전체 |
| PostgreSQL 스키마 | `public`, 테이블 13개 (E1~E13) | U1 | 전체 |
| DB 함수(RPC) | logical-components.md §2의 8개 | U1 (틀) | U2, U3, U4 |
| pg_cron 작업 | `cleanup-devices`, `cleanup-notices` | U1 | – |
| Vault | (U3·U6에서 `collect_url`, `dispatch_url`, `service_role_key` 추가) | U1 (확장 켬) | U3, U6 |
| 암호화 키 | `AMOUNT_ENC_KEY_V1`, `AMOUNT_ENC_KEY_CURRENT` | U1 | U2, U4 |

## 2. 공유 규칙

- 마이그레이션은 **번호 순서로 추가만** 한다. 이미 운영에 적용한 마이그레이션 파일은 고치지 않는다
- cron 작업 이름은 `<동작>-<주기>` 형식, 시각은 UTC로 적고 옆에 KST를 주석으로 단다
- 새 시크릿은 infrastructure-design.md §5 표 형식으로 이 문서 §3에 추가한다
- Edge Function이 늘어나도 Supabase 프로젝트는 하나다

## 3. Unit별 추가 자원 (이후 Unit이 채움)

| Unit | 추가 자원 |
|---|---|
| U2 | 마이그레이션 0006 (지구·기준표·표준 요건 시드, 판정 저장 RPC) |
| U3 | Edge Function `collect`·`analyze` (`verify_jwt=false`), cron `collect-daily`(UTC `0 20 * * *` = KST 05:00)·`analyze-hourly`(`30 * * * *`), Vault `collect_url`·`analyze_url`·`cron_secret`, 함수 시크릿 `DATA_GO_KR_API_KEY`·`GEMINI_API_KEY`·`GEMINI_MODEL`(선택)·`CRON_SECRET`, 마이그레이션 0007 |
| U6 | Edge Function `dispatch`, cron `dispatch-hourly`, Vault `dispatch_url`(+ U3의 `cron_secret` 재사용), VAPID 키 |
