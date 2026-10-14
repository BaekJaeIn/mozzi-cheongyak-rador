# 첫 구축 안내 — 모찌네 청약 알리미

> 대상: 이 저장소를 처음 운영 환경에 올리는 개발자(본인).
> 근거: deployment-architecture.md §2. 계정이 필요한 작업이라 직접 진행해야 합니다. 막히는 단계가 있으면 그 단계 번호를 알려 주세요.

---

## 0. Docker Desktop 설치 (로컬 개발·DB 테스트·E2E에 필요)

- [ ] https://www.docker.com/products/docker-desktop/ 에서 Windows용 설치 (WSL 2 백엔드)
- [ ] 설치 후 확인: `docker --version`
- [ ] 로컬 확인:
  ```bash
  npm run db:start        # 처음에는 이미지 다운로드로 몇 분 걸림
  npm run db:test         # DB 테스트 53건(보안 32 + 함수 21) 통과 확인
  ```

## 1. GitHub 저장소

- [ ] GitHub에서 새 저장소 만들기 (README·.gitignore **없이** 빈 저장소)
- [ ] 저장소 주소를 알려 주시면 로컬 `git init`·첫 커밋을 준비하고, 확인을 받은 뒤 push합니다
- [ ] push 후 Actions 탭에서 `ci` 워크플로 통과 확인

## 2. 운영 Supabase 프로젝트

- [ ] https://supabase.com/dashboard 에서 새 프로젝트: 지역 **Northeast Asia (Seoul)**, 무료 플랜
- [ ] DB 비밀번호는 비밀번호 관리자에 보관
- [ ] 연결과 마이그레이션 적용:
  ```bash
  npx supabase login
  npx supabase link --project-ref <프로젝트 ref>
  npx supabase db push
  ```
- [ ] 대시보드에서 확인: 테이블 13개, Database > Cron Jobs에 `cleanup-devices`, `cleanup-notices`

## 3. 암호화 키 (운영용)

- [ ] 운영 키 만들기 (로컬 개발 키와 **다른 값**):
  ```bash
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
  ```
- [ ] 비밀번호 관리자에 보관 (잃어버리면 저장된 소득·자산을 복호화할 수 없음)
- [ ] Supabase Function 시크릿 등록 (U2부터 사용):
  ```bash
  npx supabase secrets set AMOUNT_ENC_KEY_V1=<운영 키> AMOUNT_ENC_KEY_CURRENT=1
  ```

## 4. Vercel 프로젝트

- [ ] https://vercel.com/new 에서 GitHub 저장소 가져오기
- [ ] **프로젝트 이름을 정한다** → 주소가 `https://<이름>.vercel.app`이 됨. **이후 바꾸지 않는다** (부모님 휴대폰의 앱 설치·알림이 이 주소에 묶임)
- [ ] Settings > Environment Variables (Production):
  | 이름 | 값 |
  |---|---|
  | `SUPABASE_URL` | Supabase Project Settings > API의 URL |
  | `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 service_role 키 |
  | `AMOUNT_ENC_KEY_V1` | 3단계의 운영 키 |
  | `AMOUNT_ENC_KEY_CURRENT` | `1` |
- [ ] 함수 지역은 저장소의 `vercel.json`(`icn1`)이 적용됨. 미리보기 배포도 `vercel.json`에서 꺼 둠
- [ ] 배포 후 확인: `https://<이름>.vercel.app/api/health` → `{"ok":true}`

## 5. keepalive

- [ ] GitHub 저장소 Settings > Secrets and variables > Actions > **Variables**에 `APP_URL` = `https://<이름>.vercel.app`
- [ ] Actions > keepalive > Run workflow로 한 번 실행해 성공 확인

## 6. 운영 시작 후 2주 점검

- [ ] Supabase 일시 중지 경고 메일 없음
- [ ] keepalive 매일 성공
- [ ] `collect_runs`에 정리 기록이 매일 2건 (Table Editor)

## 알아 둘 점

| 항목 | 내용 |
|---|---|
| GitHub 예약 워크플로 자동 꺼짐 | 저장소에 **60일 동안 활동이 없으면** GitHub이 keepalive를 끕니다 (끄기 전에 메일 안내). 메일을 받으면 Actions에서 다시 켜 주세요 |
| 위험한 DB 변경 전 백업 | 무료 플랜은 시점 복구가 없습니다. `npx supabase db dump -f backup.sql` 후 적용 |
| 배포 순서 | DB 마이그레이션(`db push`) → 코드 push |
