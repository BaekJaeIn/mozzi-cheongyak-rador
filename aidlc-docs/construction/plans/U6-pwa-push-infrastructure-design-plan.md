# U6 pwa-push — 인프라 설계 계획

**입력**: U6 기능 설계, NFR 설계(logical-components), U1·U3 인프라 결정
**이미 정해진 것 (질문하지 않음)**
- 실행: Supabase Edge Function `dispatch`(`verify_jwt = false` + `CRON_SECRET` 비교, U3 방식), Next API는 Vercel
- 예약: pg_cron `dispatch-hourly` `0 * * * *`(UTC 정각 = KST 정각), U3 `invoke_edge_function` 재사용, Vault에 `dispatch_url`
- DB: 마이그레이션 `0008_push.sql`, 운영 적용은 U1 방식(사용자가 `db push`)
- 비용: 무료 플랜 안 (발송은 하루 기기 수만큼, 수십 건)
- 장애 알림 별도 없음(U1), `dispatch_runs` 표로 확인

아래 **질문 4개**의 `[Answer]:` 뒤에 보기 알파벳을 적고 "완료"라고 알려 주세요. 추천대로 하실 거면 "모두 추천대로"라고만 하셔도 됩니다.

---

## 질문

### Q1. VAPID 키 만들기·등록

A) **저장소의 스크립트(`npm run vapid:generate`)를 직접 실행 → 터미널에 나온 값을 Supabase(`supabase secrets set`)와 Vercel 환경 변수에 붙여넣기.** 개인 키는 파일·채팅에 남기지 않음(U3 `CRON_SECRET`과 같은 방식). 단계별 안내를 setup 문서로 드림 **(추천)**

B) 제가 명령으로 직접 만들어 등록 (개인 키가 대화 기록에 지나가게 됨)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]:

---

### Q2. Edge Function CPU 2초 한도
Supabase Edge Function은 요청당 CPU 시간이 2초로 제한됩니다. 웹 푸시 1건마다 암호화(키 교환·HKDF·AES)를 하므로, 기기가 아주 많으면 한도에 닿을 수 있습니다.

A) **코드 생성 때 1,000건 암호화 CPU 시간을 측정. 지금 규모(수십 대)는 한 번 호출로 충분하므로 1번 호출로 시작하고, 측정값이 한도의 절반(1초)을 넘으면 기기 묶음별로 나눠 부르는 방식(`dispatch?part=0..n`)을 그때 추가** — 측정 결과를 문서에 기록 **(추천)**

B) 처음부터 기기 100대씩 나눠 여러 번 호출

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]:

---

### Q3. Vercel 환경 변수 범위
시험 알림(`/api/push/test`)은 Vercel에서 보내므로 VAPID 개인 키가 필요합니다.

A) **운영(Production)에만 넣음.** 미리보기(Preview) 배포에서는 시험 알림·구독 저장이 "준비 안 됨"으로 안전하게 실패 **(추천)**

B) 운영 + 미리보기 모두

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]:

---

### Q4. 운영 반영 순서

A) **① 0008 마이그레이션 적용(cron 등록 포함 — Vault `dispatch_url`이 없으면 호출하지 않고 기록만, U3와 같음) ② VAPID 키 등록(Supabase·Vercel) ③ `dispatch` 함수 배포 ④ main push(Vercel 자동 배포: 서비스워커·설치·구독 API) ⑤ 어머니 휴대폰에서 알림 켜기 + 시험 알림 ⑥ Vault에 `dispatch_url` 넣기 → 다음 정각부터 자동 발송 ⑦ 함수를 직접 한 번 불러 결과 확인**. 각 단계 명령·확인 방법을 setup 문서에 **(추천)**

B) 한 번에 모두 반영 (순서 안내 없이)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]:

---

## 진행 단계 (답을 받은 뒤)

- [ ] 1. 답 검토
- [ ] 2. `infrastructure-design.md`: 함수·DB·cron·비밀값·환경 변수 매핑, CPU 한도 대응
- [ ] 3. `deployment-architecture.md`: 배포 구성도, 반영 순서, 확인·되돌리기
- [ ] 4. `shared-infrastructure.md`에 U6 비밀값·cron 추가
- [ ] 5. 완료 안내
