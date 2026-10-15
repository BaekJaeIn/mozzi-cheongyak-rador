# U3 collection-pipeline — 인프라 설계 계획

**입력**: U3 NFR 설계(L-U3-1~11, 0007), U1 인프라 설계(Vault 규칙, pg_cron UTC, 시크릿 표), shared-infrastructure.md
**공식 문서 확인 (2026-10-14, [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits))**

| 항목 | 무료 플랜 | 영향 |
|---|---|---|
| 벽시계 시간 | **150초** | NFR 예산(collect 90s, analyze 120s)과 맞음 |
| CPU 시간 | **요청당 2초** (I/O 대기 제외) | 수집은 대부분 대기라 괜찮음. **PDF base64 변환(최대 20MB)·전체 판정 재계산**은 CPU를 씀 → 위험 RK-U3-4로 관리 |
| 메모리 | 256MB | PDF 1개씩 처리(NFR-U3-05) |
| 요청 유휴 시간 | 150초 | pg_net 호출 쪽 시간 제한과 맞춤 |

아래 **질문 3개**의 `[Answer]:` 뒤에 보기 알파벳을 적고, 저장한 뒤 "완료"라고 알려 주세요. **(추천)**은 제 의견입니다.

---

## 범주별 검토

| 범주 | 질문 | 이유 |
|---|---|---|
| 배포 환경 | **질문 없음** | U1 결정: 로컬 Supabase + 운영 1개, 함수는 개발자가 `supabase functions deploy`로 수동 배포 |
| 컴퓨팅 | Q1, Q2 | 함수 2개의 실행 시각 (OI-4) |
| 스토리지 | **질문 없음** | 새 저장소 없음. PDF는 저장하지 않음(NFR-U3-15) |
| 메시징 | **질문 없음** | 큐 없음. pg_cron + pg_net, 공고 예약은 DB 컬럼(P-U3-R3) |
| 네트워크 | **질문 없음** | 함수 → 외부(data.go.kr, LH, GH, Gemini) HTTPS. 고정 IP 필요 없음(공공데이터 API는 키 인증) |
| 모니터링 | **질문 없음** | `collect_runs` + Supabase 함수 로그 (U1 Q5=A) |
| 외부 키 | Q3 | data.go.kr 데이터셋별 활용 신청 상태 확인 필요 |

---

## 질문

### Q1. 매일 수집(`collect`)은 몇 시에 할까요? (OI-4)
알림 시각은 0~23시 중 사용자가 고릅니다. 수집이 끝나야 그날 공고가 알림에 들어갑니다.

A) **매일 KST 05:00**: 대부분의 알림 시각(아침 이후)보다 앞섬. 0~4시 알림은 **전날 수집분** 기준으로 보냄. 공공기관 공고는 보통 오전 업무 시간에 올라오므로, 그날 올라온 공고는 다음 날 새벽에 잡힘 **(추천)**

B) **하루 2번**: KST 05:00 + 13:00. 오전에 올라온 공고를 당일 오후 알림에 넣을 수 있음 (API 호출 2배, 여전히 한도 안)

C) 매일 KST 00:30 (자정 직후)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q2. 매시간 AI 처리(`analyze`)는 매시 몇 분에 할까요?
U6 알림 발송(`dispatch`)은 매시 정각입니다. 그 전에 분석이 끝나야 정밀 판정이 알림에 반영됩니다.

A) **매시 30분** (정각 발송과 겹치지 않고, 분석 결과가 30분 뒤 발송에 반영) **(추천)**

B) 매시 45분 (발송 직전 — 분석이 늦어지면 겹칠 수 있음)

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

### Q3. data.go.kr API 활용 신청 상태는? (D4: cheongYak-radar 키 재사용)
data.go.kr은 **데이터셋마다 따로 활용 신청**을 해야 같은 키로 호출할 수 있습니다. U3가 쓰는 데이터셋은 세 개입니다: 청약홈 분양정보 **15098547**, LH 분양임대 공고 목록 **15058530**, LH 공고 상세 **15057999**.

A) **세 개 모두 cheongYak-radar 때 신청·승인됨** — 같은 키를 그대로 Supabase 시크릿에 등록

B) 일부만 승인됨 / 잘 모르겠음 — 설정 안내서에 신청 확인 단계를 넣고, 승인 전까지는 해당 소스를 목업 모드로 둠

X) 기타 (아래 [Answer]: 태그 뒤에 설명해 주세요)

[Answer]: A

---

## 실행 계획 (답변 확정 후 체크)

- [x] 1. 답변 분석, 모호하면 추가 질문 (Q1~Q3 모두 A. 함수 인증을 서버 키 대신 CRON_SECRET로 보완 — 새 sb_secret 키 형식 대응)
- [x] 2. `construction/U3-collection-pipeline/infrastructure-design/infrastructure-design.md` (함수 2개 매핑, pg_cron 작업·Vault 시크릿, 함수 시크릿, CPU 한도 대응, 로컬 실행)
- [x] 3. `.../deployment-architecture.md` (배포 절차, 첫 운영 실행 확인, 롤백)
- [x] 4. `construction/shared-infrastructure.md` U3 항목 갱신
