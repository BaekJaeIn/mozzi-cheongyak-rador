# U2 eligibility-engine — 비기능 설계 패턴

> 근거: U2 NFR Design 답변 (Q1=A 저장 요청 안에서 재계산, Q2=A 저장 성공 + 재계산 실패 기록, Q3=A 프로필 버전 확인)
> U1 패턴(P-R1~4, P-P1~3, P-S1~7)은 그대로 적용한다.

---

## 1. 복원력

### P-U2-R1 기기 단위 실패 격리 (NFR-U2-05)
- `recomputeAll`은 기기마다 `try/catch`로 감싼다. 복호화·판정·저장 중 실패하면 그 기기는 건너뛰고(기존 판정 유지) 실패 수를 센다
- 결과: `{ devices, succeeded, skippedStale, failed }` (U3이 `collect_runs`에 기록)

### P-U2-R2 저장은 지키고 재계산은 나중에 (Q2=A)
```text
PUT /api/profile (U4)
 1. 프로필 저장 (RPC save_device_profile → 새 profileVersion)       실패 → 오류 응답
 2. recomputeForDevice(deviceId, profileVersion)                    실패 → 기록만
 3. 응답 200 { savedAt, profileVersion, judgementsUpdated: true|false }
    false면 화면은 "판정은 잠시 후 반영돼요"를 보여 준다 (U4)
```
- 다음 저장 또는 새벽 전체 재계산 때 다시 계산된다 (P-U2-R3 덕분에 순서가 뒤바뀌어도 안전)

### P-U2-R3 프로필 버전 확인으로 최신 판정 보호 (Q3=A)
- 재계산은 **읽은 프로필의 `profileVersion`**을 판정과 함께 저장 RPC에 넘긴다
- `replace_judgements_for_device(p_device_id, p_profile_version, p_rows)` (U1 함수를 U2 마이그레이션에서 교체):
  ```text
  1. select profile_version from device_profiles where device_id = p_device_id for update
     (행 잠금 → 같은 기기의 판정 저장이 동시에 끼어들지 못함)
  2. 프로필이 없거나 p_profile_version < 현재 버전이면 → 저장하지 않고 -1 반환 (오래된 계산)
  3. 아니면 기존 판정 삭제 + 새 판정 삽입, 삽입 수 반환
  ```
- 같은 버전끼리의 경쟁(예: 새벽 작업과 같은 프로필로 저장 재계산)은 둘 다 최신 프로필 기준이라 어느 쪽이 남아도 맞다
- 남는 경우: 공고 목록만 다른 두 계산이 겹치면 늦게 끝난 쪽의 공고 목록이 남을 수 있다 → 새로 들어온 공고의 판정이 다음 재계산까지 빠질 수 있음 (최대 하루, 허용)

### P-U2-R4 결정적 계산
- 판정은 `asOf`(한국 날짜)를 인자로 받고, 내부에서 현재 시각을 읽지 않는다 → 재실행해도 같은 결과 (NFR-U2-06)

## 2. 확장성 — 적용하지 않음

판정 ≤ 2만 건을 함수 하나에서 처리한다(NFR-U2-03). 병렬 처리·큐·배치 분할은 두지 않는다. 기기·공고 규모가 10배를 넘으면 기기 단위 분할 호출을 검토한다.

## 3. 성능

### P-U2-P1 요청 안 동기 재계산 (Q1=A)
- 저장 요청 안에서 기기 1대 재계산(≤ 1초, NFR-U2-02). U1 목표(API p95 < 500ms)를 넘을 수 있는 유일한 API이므로, U4 Code Generation에서 실제 시간을 측정해 기록한다. 1초를 넘으면 B안(응답 뒤 재계산)으로 바꾸는 것을 다시 묻는다

### P-U2-P2 묶음 조회
- 공고는 주택형·지구 ID까지 **한 번에** 읽는다 (`listRetainedWithUnits`: PostgREST 임베딩 `notices(*, housing_units(*), notice_districts(district_id))`). 공고마다 따로 조회하지 않는다
- 기준 데이터(지구·기준표·표준 요건)는 재계산 1회에 1번 (NFR-U2-04). 이 경로에서는 U1의 10분 캐시를 쓰지 않는다 (정확성 우선, P-P1)

### P-U2-P3 판정 내부
- 기준표는 `Map<"{year}|{basis}|{size}", won>`으로 바꿔 둔 뒤 조회
- 사유 문구는 판정 결과가 정해진 뒤 한 번만 만든다

## 4. 보안

### P-U2-S1 암호화 키 보관
- 실행 환경(Next 서버 인스턴스 / Edge Function 실행)마다 처음 한 번 `crypto.subtle.importKey('raw', …, 'AES-GCM', extractable=false, ['encrypt','decrypt'])`로 가져와 `Map<버전, CryptoKey>`에 보관
- 키 원문(base64url)은 가져온 직후 참조를 버린다. 로그·오류에 키·버전 외 정보를 넣지 않는다
- 키 공급은 주입: Node는 U1 `ServerEnv.amountEncKeys`, Deno는 `Deno.env`에서 읽는 어댑터 (U3)

### P-U2-S2 복호화 범위
- `decodeProfile`의 결과(평문 금액)는 `judgeNotice` 호출에만 쓰고, 재계산 함수가 끝나면 참조가 사라진다. 반환값·로그·오류 객체에 프로필을 넣지 않는다

### P-U2-S3 사유에 내 금액 넣지 않기 (NFR-U2-10·11)
- 사유 문구는 `messages.ts`의 템플릿으로만 만들고, 템플릿에는 **기준 값**과 **나이·가구원수**만 넣을 수 있다 (금액 인자를 받는 템플릿 없음 → 구조적으로 차단)
- `CriterionResult.userValue?: "monthlyIncome" | "totalAsset" | "carValue"`: 화면(U5)이 기기 프로필에서 해당 값을 찾아 "→ 월 450만원"을 붙인다
- PBT로 검증 (NFR-U2-11)

### P-U2-S4 로그
- 재계산 로그: 기기 ID 앞 8자리, 처리 공고 수, 판정 분포(eligible/unknown/ineligible 개수), 소요 시간만. 프로필·금액·사유 문구는 남기지 않는다 (U1 Logger의 가리기 규칙에 더해, 애초에 넣지 않음)

## 5. 관측성

| 항목 | 내용 |
|---|---|
| 재계산 요약 | `{ devices, succeeded, skippedStale, failed, notices, ms }` → U3이 `collect_runs`에 기록, U4는 구조화 로그 |
| 판정 분포 | 실행마다 eligible·unknown·ineligible 개수, "기준표 없음" 사유 개수(RK-U2-1을 알아채는 단서) |
| 오래된 계산 건너뜀 | `skippedStale` 수 (P-U2-R3이 실제로 동작했는지) |
