# 첫 배포 안내 — U3 수집·분석 함수

> 대상: 운영 Supabase에 `collect`·`analyze` 함수를 처음 올리는 개발자(본인).
> 근거: deployment-architecture.md §2. 계정이 필요한 작업이라 직접 진행해야 합니다. 막히는 단계가 있으면 그 단계 번호를 알려 주세요.
> 비밀 값(키·CRON_SECRET)은 이 문서·저장소·채팅에 붙여 넣지 않습니다.

---

## 1. CI 통과 확인

- [ ] GitHub Actions `ci`(Vitest·deno check)와 `db-and-e2e`(pgTAP — 0007 `collect.test.sql` 포함)가 통과했는지 확인

## 2. 함수 시크릿

- [ ] `CRON_SECRET` 만들기 (아래 명령 출력값을 비밀번호 관리자에 보관):
  ```bash
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
  ```
- [ ] 시크릿 등록 (값은 터미널에서 직접 입력):
  ```bash
  npx supabase secrets set CRON_SECRET=… DATA_GO_KR_API_KEY=… GEMINI_API_KEY=…
  # 판정 재계산이 프로필을 복호화하므로 Vercel과 같은 키를 함수에도 등록
  npx supabase secrets set AMOUNT_ENC_KEY_V1=… AMOUNT_ENC_KEY_CURRENT=1
  ```
  - `DATA_GO_KR_API_KEY`는 공공데이터포털 **Decoding 키**
  - `GEMINI_MODEL`은 기본값(`gemini-2.5-flash`)을 쓰면 넣지 않아도 됨
  - `COLLECT_MOCK`은 운영에 **넣지 않음**
- [ ] 확인: `npx supabase secrets list` (이름만 보임)

## 3. Vault (예약 작업이 함수를 부를 때 쓰는 값)

- [ ] Supabase 대시보드 → SQL Editor에서 실행 (`<ref>`는 프로젝트 ID, `<CRON_SECRET>`은 2단계 값):
  ```sql
  select vault.create_secret('https://<ref>.supabase.co/functions/v1/collect', 'collect_url');
  select vault.create_secret('https://<ref>.supabase.co/functions/v1/analyze', 'analyze_url');
  select vault.create_secret('<CRON_SECRET>', 'cron_secret');
  ```
- [ ] 확인: `select name from vault.secrets;` → 3개
- 값을 바꿀 때: `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<새 값>');` 후 2단계 시크릿도 같은 값으로

## 4. 마이그레이션

- [ ] `npx supabase db push` (0006이 아직이면 0006·0007 함께 적용)
- [ ] 확인 (SQL Editor):
  ```sql
  select jobname, schedule from cron.job order by jobname;
  -- analyze-hourly 30 * * * * / cleanup-devices / cleanup-notices / collect-daily 0 20 * * *
  ```

## 5. 함수 배포

- [ ] `npx supabase functions deploy collect analyze`
- [ ] 대시보드 → Edge Functions에 두 함수가 보이고 "Verify JWT"가 꺼져 있는지 확인 (`config.toml`의 `verify_jwt = false`)

## 6. 수동 1회 실행

- [ ] 수집 (1~2분 걸릴 수 있음):
  ```bash
  curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<ref>.supabase.co/functions/v1/collect
  ```
- [ ] 분석 (공고 2건):
  ```bash
  curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<ref>.supabase.co/functions/v1/analyze
  ```
- [ ] 확인 (SQL Editor):
  ```sql
  select source, ok, fetched_count, upserted_count, warning, error, started_at
  from collect_runs order by started_at desc limit 10;
  select title, summary_status, ai_attempts from notices order by apply_end nulls last limit 20;
  ```
  - 소스별 행이 `ok = true`인지, `warning`에 "지구 후보" 제목·대기열·상세 실패가 있는지 확인
  - 공공데이터 키가 틀려도 함수는 200을 돌려주고 해당 소스 행의 `error`에 남습니다 (주소의 키는 가려짐). 401은 `CRON_SECRET`이 다를 때만

## 7. 자동 실행 확인

- [ ] 다음 날 05:00 이후 `collect_runs`에 `collect` 결과, 매시 30분 이후 `analyze` 결과가 쌓이는지 확인
- [ ] "Vault 값 없음"이 보이면 3단계 이름(`collect_url`, `analyze_url`, `cron_secret`) 확인

## 되돌리기

| 상황 | 방법 |
|---|---|
| 함수 문제 | 이전 커밋으로 `npx supabase functions deploy collect analyze` |
| 예약 작업만 멈추기 | `select cron.unschedule('collect-daily');` / `select cron.unschedule('analyze-hourly');` |
| 공고 다시 분석 | `update notices set summary_status = 'pending', ai_attempts = 0 where id = '…';` |
| DB 변경 문제 | 새 마이그레이션으로 고치기 (U1 규칙) |
