# U6 알림·설치 — 운영 반영 안내

> 대상: 저장소 주인(운영 작업을 직접 하는 사람). 순서대로 한 단계씩 하고, 각 단계의 "확인"이 맞으면 다음으로 넘어가세요.
> 근거: `infrastructure-design/deployment-architecture.md` §2 (Q4=A)
> **비밀값(VAPID 개인 키, CRON_SECRET)은 채팅·문서·저장소에 붙여넣지 마세요.**

명령은 PowerShell 기준입니다. 저장소 폴더에서 실행하세요. `docker`가 안 잡히면 Docker Desktop을 켜 두세요(Supabase CLI가 씀).

---

## 0. CI 통과 확인

GitHub → Actions에서 최신 커밋의 `ci`, `db-and-e2e`가 모두 초록인지 확인합니다.

## ① DB 반영 (0008)

```powershell
npx supabase db push
```

**확인** (Supabase 대시보드 → SQL Editor):

```sql
select jobname, schedule from cron.job where jobname in ('dispatch-hourly', 'cleanup-push');
select to_regclass('public.dispatch_runs'), to_regclass('public.push_test_log');
```

- 두 작업(`0 * * * *`, `10 19 * * *`)과 두 표가 보이면 됩니다.
- 이때부터 ⑥ 전까지 `collect_runs`에 매시 "Vault 값 없음: dispatch_url"이 쌓입니다. **정상**입니다(아직 발송을 켜지 않았다는 뜻).

## ② VAPID 키 만들고 등록

```powershell
npm run vapid:generate
```

화면에 세 줄이 나옵니다: `VAPID_PUBLIC_KEY=…`, `VAPID_PRIVATE_KEY=…`, `VAPID_SUBJECT=…`. **이 창을 닫기 전에** 아래 두 곳에 넣으세요.

**Supabase 함수 비밀값** — 값을 화면에 남기지 않게 하나씩 입력받아 넣습니다:

```powershell
$pub = Read-Host "VAPID_PUBLIC_KEY 붙여넣기"
$priv = Read-Host "VAPID_PRIVATE_KEY 붙여넣기" -AsSecureString
$privPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($priv))
npx supabase secrets set "VAPID_PUBLIC_KEY=$pub" "VAPID_PRIVATE_KEY=$privPlain" "VAPID_SUBJECT=https://mozzi-cheongyak-rador.vercel.app"
Remove-Variable priv, privPlain
```

**Vercel** — 대시보드 → 프로젝트 → Settings → Environments → **Production** 행을 눌러 들어가서(옛 화면은 Settings → Environment Variables) 같은 이름 3개를 추가합니다. Preview·Development에는 넣지 않습니다.

**확인**

```powershell
npx supabase secrets list
```

이름 목록에 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`가 보이면 됩니다(값은 해시로만 보입니다).

## ③ `dispatch` 함수 배포

```powershell
npx supabase functions deploy dispatch
```

**확인**: Supabase 대시보드 → Edge Functions에 `dispatch`가 보입니다.

## ④ 코드 push (Vercel 자동 배포)

②의 Vercel 환경 변수를 넣은 **뒤에** push합니다(먼저 push했다면 Vercel에서 Redeploy).

**확인** (브라우저로 열기):

- `https://mozzi-cheongyak-rador.vercel.app/manifest.webmanifest` — "청약 알리미"가 보임
- `https://mozzi-cheongyak-rador.vercel.app/api/push/key` — `{"publicKey":"…"}` (503이면 ② Vercel 값이 아직 안 들어간 것)

## ⑤ 어머니 휴대폰에서 알림 켜기 + 시험 알림

**iPhone**

1. Safari로 앱 주소를 엽니다(카카오톡 안 브라우저가 아니라 Safari).
2. 공유 버튼 → "홈 화면에 추가" → "추가". 홈 화면에 강아지 아이콘이 생깁니다.
3. **그 아이콘으로** 앱을 엽니다(Safari로 열면 알림이 안 됩니다).
4. 설정 → 알림 스위치를 켭니다 → "허용"을 누릅니다.
5. [시험 알림 보내기] → 잠시 뒤 "알림이 잘 와요"가 오면 성공. 알림을 누르면 설정 화면이 열립니다.

**Android**

1. Chrome(또는 삼성 인터넷)으로 앱 주소를 엽니다.
2. 피드 위 안내 띠의 [설치 방법 보기] → [홈 화면에 설치](또는 메뉴 ⋮ → 홈 화면에 추가).
3. 설정 → 알림 켜기 → 허용 → [시험 알림 보내기].

**확인** (SQL Editor): `select count(*) from push_subscriptions;` — 켠 휴대폰 수만큼.

## ⑥ 자동 발송 켜기

SQL Editor에서(`<ref>`는 Supabase 프로젝트 ref):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch', 'dispatch_url');
```

다음 정각부터 매시 자동 실행됩니다.

## ⑦ 한 번 직접 불러 보기

```powershell
$secret = Read-Host "CRON_SECRET 붙여넣기" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret))
curl.exe -s -X POST "https://<ref>.supabase.co/functions/v1/dispatch" -H "Authorization: Bearer $plain" -H "content-type: application/json" -d "{}"
Remove-Variable secret, plain
```

**확인**: `{"hour":…, "devices":…, "sent":…}` 형태의 응답.

- 지금 시각이 아무 기기의 알림 시각도 아니면 `"devices":0`이 **정상**입니다.
- `{"error":"unauthorized"}`면 비밀값이 다른 것입니다(U3 때와 같은 값).

```sql
select started_at, hour, devices, sent, skipped_empty, failed, removed_subscriptions, error
from dispatch_runs order by started_at desc limit 24;
```

## ⑧ 다음 날 알림 시각에 확인

기본 알림 시각은 **오전 9시**입니다. 그 시각에 새로 맞는 공고가 있으면 알림이 옵니다. 없으면 오지 않습니다(정상).

```sql
-- 최근 발송 결과
select started_at, hour, devices, sent, skipped_empty, failed from dispatch_runs order by started_at desc limit 5;
-- 기기별 알린 공고 수
select device_id, kind, count(*) from notification_log group by 1, 2;
```

---

## 문제가 생기면

| 상황 | 할 일 |
|---|---|
| 알림이 잘못 나감(문구·대상) | `delete from vault.secrets where name = 'dispatch_url';` → 다음 정각부터 멈춤. 고친 뒤 ⑥ 다시 |
| 함수 배포 문제 | 이전 커밋에서 `npx supabase functions deploy dispatch` |
| 화면 문제 | Vercel 대시보드에서 이전 배포로 Promote (서비스워커는 화면을 저장하지 않아 남는 문제 없음) |
| 알림이 하나도 안 옴 | ① `dispatch_runs`의 `devices`가 0이면 알림 시각·켜짐·구독을 확인 ② `failed`가 늘면 함수 로그(`push.rejected` 상태 코드) 확인 — 401·403이면 VAPID 키가 Supabase와 Vercel에서 서로 다른지 확인 |
| `dispatch.too_many` 경고 | 한 시각 기기가 400대를 넘음. cron을 나눠 부르기로 바꿈: 본문 `{"part":0,"parts":3}` … (infrastructure-design §4) |

## VAPID 키 교체 (새어 나갔을 때만)

1. ②를 다시 해서 새 값을 Supabase·Vercel에 넣고 ③ 다시 배포, Vercel Redeploy.
2. 각 휴대폰에서 앱을 한 번 열면 공개 키가 바뀐 것을 알아채고 **자동으로 다시 구독**합니다(알림 권한은 그대로).
3. 옛 구독은 발송 때 실패하다가 7일 뒤 자동 정리됩니다.
