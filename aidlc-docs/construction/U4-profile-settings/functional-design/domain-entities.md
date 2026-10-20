# U4 profile-settings — 도메인 엔티티

> `HouseholdProfile`(프로필 본체)은 U2 domain-entities §1 그대로 쓴다. 여기서는 U4에서 새로 생기는 **마법사 초안·기기 저장 형식·알림 설정·화면 모드·API 형식**을 정의한다.

---

## 1. 마법사 화면 정의 `WizardStep`

```ts
type StepId =
  | "selfBirth" | "household" | "householdMore" | "spouseBirth" | "head"
  | "residence" | "residenceYears"
  | "homeOwned" | "homeCount" | "homelessYears"
  | "savingsHas" | "savingsKind" | "savingsPeriod" | "savingsAmount"
  | "income" | "spouseEarns" | "asset" | "car" | "welfare"
  | "districts" | "area" | "tenurePrefs"
  | "review" | "notify";

type GroupId = "basic" | "residence" | "housing" | "savings" | "money" | "districts" | "prefs";

interface WizardStep {
  id: StepId;
  group: GroupId | "review" | "notify";
  /** 지금까지의 답으로 이 화면을 보일지 (BR-U4-10) */
  visible(answers: WizardAnswers): boolean;
  /** 필수 화면: [잘 모르겠어요] 없음, 답이 있어야 [다음] (BR-U4-50) */
  required: boolean;
  /** [잘 모르겠어요] 버튼 (필수·선호 화면에는 없음, BR-U4-52) */
  allowUnknown: boolean;
  /** 이 화면이 채우는 답 키 (안 보이게 되면 지울 키, BR-U4-12) */
  fields: AnswerKey[];
}
```

`GroupId` → 설정 화면의 그룹 7개와 같다 (BR-U4-70). `districts`·`prefs`는 설정에서 따로 보이고 마법사에서는 "관심 지구·선호" 진행 표시를 같이 쓴다.

## 2. 답 `WizardAnswers`

화면에서 받은 값을 그대로 둔다. **"아직 안 답함"(키 없음)**과 **"잘 모르겠어요"(`UNKNOWN`)**를 구분한다 — 이어서 하기와 진행 표시에 필요하다. 프로필로 바꿀 때는 둘 다 `null`이 된다.

```ts
const UNKNOWN = "unknown" as const;
type Maybe<T> = T | typeof UNKNOWN;

interface WizardAnswers {
  selfBirth?: IsoDate;
  householdType?: "couple" | "single" | "other";
  householdSize?: number;                 // other일 때 2~8
  hasSpouse?: boolean;                    // other일 때
  spouseBirth?: Maybe<IsoDate>;
  head?: Maybe<"self" | "spouse" | "other">;
  sido?: string;                          // 줄임 이름
  sigungu?: string | null;                // 서울·경기·인천만 값, 그 밖 null
  residenceYearsBand?: Maybe<YearBand>;
  homeOwned?: Maybe<boolean>;
  homeCount?: Maybe<1 | 2 | 3 | 4 | 5>;   // 5 = 5채 이상
  homelessYearsBand?: Maybe<HomelessBand>;
  savingsHas?: Maybe<boolean>;
  savingsKind?: Maybe<SavingsKind>;
  savingsMonthsBand?: Maybe<MonthsBand>;
  paymentCount?: Maybe<number>;
  depositManwon?: Maybe<number>;
  monthlyIncome?: Maybe<number>;
  spouseEarns?: Maybe<boolean>;
  totalAsset?: Maybe<number>;
  carValue?: Maybe<number>;
  welfare?: Maybe<WelfareStatus>;
  districtIds?: string[];
  areaBands?: AreaBand[];
  tenure?: TenurePref;
  lowFloor?: boolean;
}
type AnswerKey = keyof WizardAnswers;
```

### 2.1 구간 (BR-U4-30·31)

```ts
type YearBand     = "lt1" | "1to2" | "2to3" | "3to5" | "5to10" | "ge10";          // → 0,1,2,3,5,10
type HomelessBand = "lt1" | "1to2" | "2to3" | "3to5" | "5to10" | "10to15" | "ge15";  // → 0,1,2,3,5,10,15
type MonthsBand   = "lt6" | "6to12" | "12to24" | "24to60" | "60to120" | "ge120"; // → 0,6,12,24,60,120

interface BandDef<B extends string> { band: B; label: string; lower: number }
// lowerOf(band) = 저장 값, bandOf(value) = lower ≤ value 인 가장 큰 lower의 구간
```

### 2.2 답 ↔ 프로필 변환

| 함수 | 설명 |
|---|---|
| `toProfile(answers): HouseholdProfile` | 보이지 않는 화면의 답은 무시, `UNKNOWN`·없음 → `null`, 구간 → 아래 값, `householdType`→`householdSize`·`spouse`(BR-U4-13), `homeOwned=true` → `homeless=false`·`homelessYears=null`, `homeOwned=false` → `homeless=true`·`ownedCount=0`, 통장 없음 → 통장 항목 모두 `null`·`has=false`. 필수가 비면 오류 |
| `fromProfile(profile): WizardAnswers` | 고치기·처음부터 다시 입력(BR-U4-71·73)에서 지금 값으로 채움. 값 `null` → `UNKNOWN`(필수 항목 제외) |
| 왕복 | 필수가 채워진 모든 답 `a`에 대해 `toProfile(fromProfile(toProfile(a))) = toProfile(a)` (§6 PBT) |

## 3. 기기 저장 형식 (localStorage, Q7=A — 암호화 없음)

| 키 | 값 | 비고 |
|---|---|---|
| `mz.device` | `{ deviceId, token }` | U1 (그대로) |
| `mz.profile` | `StoredProfile` | 저장된 프로필 + 동기화 상태 |
| `mz.profile.draft` | `WizardDraft` | 처음 입력 중일 때만 (BR-U4-02·72) |
| `mz.notify` | `StoredNotify` | 알림 설정 + 동기화 상태 |
| `mz.display` | `"normal" \| "easy"` | 화면 모드 (BR-U4-82) |
| `mz.bookmarks` | (U5) | 모두 지우기에서 함께 지움 (BR-U4-94) |

```ts
type SyncState =
  | { state: "synced"; at: string }                   // 서버에 반영됨
  | { state: "pending"; since: string; attempts: number }  // 보낼 차례 (BR-U4-63·64)
  | { state: "failed"; code: "BAD_REQUEST" };          // 형식 오류 — 다음 저장까지 보내지 않음 (BR-U4-66)

interface StoredProfile {
  version: 1;
  profile: HouseholdProfile;   // 평문
  savedAt: string;             // 기기에 저장한 시각 (ISO)
  sync: SyncState;
}

interface WizardDraft {
  version: 1;
  answers: WizardAnswers;
  stepId: StepId;              // 이어서 할 화면
  updatedAt: string;
}

interface StoredNotify {
  version: 1;
  hour: number;                // 0~23, 기본 9
  enabled: boolean;            // 기본 true
  sync: SyncState;
}
```

| 규칙 | |
|---|---|
| 읽기 실패 | JSON이 깨졌거나 `version`이 다르면 그 키를 없는 것으로 본다(초안은 지우고 처음 실행, 프로필은 지우지 않고 오류 로그 후 처음 실행 — 다시 입력하게) |
| 기본 알림 설정 | `mz.notify`가 없으면 `{ hour: 9, enabled: true }`이고 서버 기본값과 같으므로 보낼 필요 없음 (`synced`로 봄) |
| 저장 실패 | localStorage가 꽉 찼거나 막혀 있으면 "이 휴대폰에 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요"(저장 버튼 화면에 표시) |

## 4. 동기화 대기열 `ProfileSync`

```ts
interface ProfileSync {
  /** 대기 중이면 기기의 최신 값을 1번 보낸다. 보내는 중이면 그 결과를 기다린다 (BR-U4-64·65) */
  flush(): Promise<FlushResult>;
  /** 기기 재등록 때 (BR-U4-67) */
  markAllPending(): void;
}
type FlushResult =
  | { kind: "nothing" }                 // 대기 없음
  | { kind: "synced" }
  | { kind: "offline" }                 // 네트워크·5xx → pending 유지, attempts+1
  | { kind: "rejected" };               // 400 → failed
```

상태 전이 (프로필·알림 각각):

| 지금 | 일 | 다음 |
|---|---|---|
| 아무 상태 | 기기에 새로 저장 | `pending(attempts 0)` |
| `pending` | 보내기 성공(200) | `synced` |
| `pending` | 네트워크 오류·408·5xx (U1 클라이언트 1회 재시도 후) | `pending(attempts+1)` |
| `pending` | 400 | `failed` |
| `synced`·`failed` | 기기 재등록 | `pending(attempts 0)` |
| `failed` | 다음 저장 | `pending` |

보내는 중에 새로 저장되면, 보내기가 끝난 뒤 그 결과는 **덮어쓰지 않고**(최신 저장이 `pending`이므로) 한 번 더 보낸다.

## 5. API 형식 (S3)

```ts
// PUT /api/profile
type PutProfileRequest = HouseholdProfile;
interface PutProfileResponse { savedAt: string; profileVersion: number }

// PUT /api/notify-settings
interface NotifySettings { hour: number; enabled: boolean }
type PutNotifyResponse = NotifySettings;

// DELETE /api/device → 204 (본문 없음)

// 오류 (공통, U1): { code: ApiErrorCode; message: string }
```

| 상태 | 코드 | 언제 |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON 아님, 형식 검증 실패, 모르는 지구 ID |
| 401 | `AUTH_MISSING`·`DEVICE_UNKNOWN`·`TOKEN_MISMATCH` | U1 route guard |
| 413 | `PAYLOAD_TOO_LARGE` | 프로필 16KB·알림 1KB 초과 |
| 500 | `SERVER` | DB·암호화 키 문제 |

## 6. 속성 기반 테스트 대상 (PBT-01 식별)

| # | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U4-1 | 필수가 채워진 **모든 답 조합**에서 `toProfile` 결과가 U2 `validateProfile`을 통과한다 (BR-U4-55) | `toProfile` | 불변식 |
| P-U4-2 | 보이는 화면 목록은 항상 필수 화면(1·2·6·20·23)을 포함하고, 보이는 조건이 거짓인 화면은 없다. 순서는 표 순서의 부분열 | `visibleSteps` | 불변식 |
| P-U4-3 | 안 보이는 화면에 남은 답은 `toProfile`에 영향을 주지 않는다 (BR-U4-12) | `toProfile` | 불변식 |
| P-U4-4 | `toProfile(fromProfile(toProfile(a))) = toProfile(a)` | 변환 | 왕복 |
| P-U4-5 | 구간: `bandOf(lowerOf(b)) = b`, `lowerOf(bandOf(v)) ≤ v`, `bandOf`는 단조 | 구간 | 왕복·단조 |
| P-U4-6 | 한글 금액: 0~1,000,000만원에서 `parseKoreanManwon(formatManwon(n)) = n`, 서로 다른 값은 다른 문자열 | 금액 표시 | 왕복 |
| P-U4-7 | 단위 실수 확인은 단조: 값 x에서 확인을 묻으면 더 큰 y에서도 묻는다 | `needsConfirm` | 단조 |
| P-U4-8 | 그룹 고치기는 다른 그룹의 (계속 보이는) 값을 바꾸지 않는다 (BR-U4-71) | 고치기 병합 | 불변식 |
| P-U4-9 | 동기화: 임의의 저장·성공·실패 순서 뒤에 서버에 마지막으로 반영된 값 = 기기의 마지막 저장 값(마지막 응답이 성공일 때), 보내는 횟수 ≤ 저장 횟수 + 실패 횟수 | `ProfileSync` (가짜 서버) | 상태 기반 |
| P-U4-10 | 알림 시각 표기: 0~23이 서로 다른 24개 문구, 문구 → 시각 왕복 | `hourLabel` | 왕복 |

---

## 7. 변경 요청 2 (2026-10-19)

> 계획: `plans/U4-profile-settings-change-2-functional-design-plan.md` (Q1~Q4 모두 A). 프로필 v2 본체(`savings.owner`, `prefs.regions`)와 v1 → v2 옮기기(`parseProfile`)는 U2 domain-entities 변경 2 절 그대로. 아래 내용이 앞 절과 다르면 이 절을 따른다.

### 7.1 마법사 화면 ID·그룹

```ts
type StepId =
  | "selfBirth" | "household" | "householdMore" | "spouseBirth" | "head"
  | "residence" | "residenceYears"
  | "homeOwned" | "homeCount" | "homelessYears"
  | "savingsOwner" | "savingsKind" | "savingsPeriod" | "savingsAmount"   // savingsHas → savingsOwner
  | "income" | "spouseEarns" | "asset" | "car" | "welfare"
  | "districts" | "regions" | "area" | "tenurePrefs"                     // regions 추가 (Q1=A 두 화면)
  | "review";
```

- 그룹 ID `districts`는 그대로 두고 이름만 **"관심 지역"**으로 바꾼다 (화면 `districts`·`regions` 두 개가 속함). 경로 `/profile/edit/districts`도 그대로
- 마법사 모드에 **`update`(짧은 입력 화면)** 추가: `mode: "setup" | "edit" | "update"`

### 7.2 답 `WizardAnswers` 바뀐 키

```ts
type SavingsOwnerAnswer = "self" | "spouse" | "both" | "none";

interface WizardAnswers {
  // savingsHas 삭제
  savingsOwner?: Maybe<SavingsOwnerAnswer>;  // 혼자 사는 가구는 "self"(있음) | "none"(없음) | UNKNOWN
  regions?: RegionPick[];                    // 다른 지역 (U2 RegionPick, 시도 전체 = sigungu null)
  // 나머지 키 그대로
}
```

| 답 `savingsOwner` | 프로필 `savings` |
|---|---|
| `self` · `spouse` · `both` | `has: true`, `owner: 그 값`, 자세한 정보는 화면 12~14 답 |
| `none` | `has: false`, `owner: null`, 나머지 `null` |
| `UNKNOWN` · 없음 | `has: null`, `owner: null`, 나머지 `null` |

`fromProfile`: `has: true` → `owner ?? "self"`, `has: false` → `none`, `has: null` → `UNKNOWN`. `regions` → 그대로 복사.

### 7.3 초안 버전 2

```ts
interface WizardDraft { version: 2; answers: WizardAnswers; stepId: StepId; updatedAt: string }
```

| 읽은 초안 | 처리 |
|---|---|
| 버전 2 | 그대로 |
| 버전 1 | 옮긴다: `savingsHas: true` → `savingsOwner: "self"`, 그 밖(`false`·`UNKNOWN`)은 키를 지워 그 화면을 다시 묻는다. 화면 ID `savingsHas` → `savingsOwner`. `regions`는 없음(화면에 처음 갈 때 기본값, BR-U4-C11) |
| 그 밖 | 지금처럼 버린다 |

`StoredProfile`은 바깥 형식 `version: 1` 그대로 두고 안의 `profile`을 `parseProfile`로 읽는다(U2에서 이미 바꿈). 저장할 때는 항상 v2로 쓴다.

### 7.4 업데이트 안내 기록 `mz.updates` (기기에만)

```ts
type UpdateItem = "savings" | "regions";

interface StoredUpdates {
  version: 1;
  /** 이 기기가 본 마지막 안내 번호 (0 = 아직 안 봄) */
  noticeSeen: number;
  /** 아직 입력하지 않은 새 항목 — 비면 띠가 사라진다 */
  pending: UpdateItem[];
}

interface WhatsNew {
  notice: number;              // 안내 번호. 변경 2 = 1. 다음 변경에서 올린다
  lines: string[];             // 카드 본문 2~3줄
  items: UpdateItem[];         // 이 안내가 묻는 새 항목
}
```

| 규칙 | |
|---|---|
| 없을 때 | `mz.updates`가 없거나 깨졌으면 아래 "처음 기록"으로 만든다 |
| 처음 기록 | 프로필이 **없으면** `{ noticeSeen: 지금 번호, pending: [] }` (처음 설치, FR-C2-18). 프로필이 **버전 1에서 옮겨졌으면** `{ noticeSeen: 0, pending: 옮긴 프로필로 정한 항목 }`(BR-U4-C21). 프로필이 이미 버전 2면 `{ noticeSeen: 지금 번호, pending: [] }` |
| 모두 지우기 | 함께 지운다 (BR-U4-94 목록에 추가). 지운 뒤에는 처음 설치와 같다 |

### 7.5 짧은 입력 화면 정의

```ts
/** update 모드에서 보일 화면: pending 항목과 예전 값으로 정한다 (BR-U4-C30·C31) */
function updateSteps(pending: UpdateItem[], before: HouseholdProfile, answers: WizardAnswers): StepId[];
```

| 항목 | 화면 |
|---|---|
| `savings` | `savingsOwner` → (`before.savings.has !== true`이고 답이 있음(`self`·`spouse`·`both`)이면) `savingsKind`·`savingsPeriod`·`savingsAmount` |
| `regions` | `regions` |
| 끝 | 마지막 화면의 [다음] 자리에 **[저장]** (확인 화면 없음) |

### 7.6 속성 기반 테스트 대상 추가 (PBT-01)

| # | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U4-C1 | 필수가 채워진 모든 답(새 `savingsOwner`·`regions` 포함)에서 `toProfile` 결과가 U2 `validateProfile`(v2)을 통과한다 | `toProfile` | 불변식 |
| P-U4-C2 | `toProfile(fromProfile(toProfile(a))) = toProfile(a)` — 통장 명의·다른 지역 포함 | 변환 | 왕복 |
| P-U4-C3 | 버전 1 초안 옮기기는 멱등: 옮긴 결과를 다시 읽어도 같다. 옮긴 초안은 버전 2 화면 정의로 읽힌다 | 초안 옮기기 | 멱등 (NFR-C2-4) |
| P-U4-C4 | 업데이트 기록: 처음 기록을 두 번 만들어도 같다. `pending`은 항목을 입력하면 줄기만 하고 늘지 않는다(같은 안내 번호에서) | `mz.updates` | 멱등·단조 |
| P-U4-C5 | 짧은 입력 화면 저장은 `pending` 항목 밖의 프로필 값을 바꾸지 않는다 (통장 그룹·다른 지역 밖 값 그대로, 3기 신도시 지구 그대로) | update 병합 | 불변식 |
| P-U4-C6 | 다른 지역 고르기: 어떤 누름 순서 뒤에도 결과는 `isValidRegionPicks`를 통과하고 `normalizeRegionPicks`의 고정점이다 | `toggleRegion` | 불변식 |
| P-U4-C7 | 배우자가 없는 답에서는 `savingsOwner`가 `spouse`·`both`로 남지 않는다 (BR-U4-12 확장) | `pruneHidden` | 불변식 |

---

## 8. 변경 요청 3 (2026-10-20)

> 계획: `plans/U4-profile-settings-change-3-functional-design-plan.md` (Q1~Q5 모두 A). 프로필 v3 본체(`householdKind`, `newlywed`, `money.spouseMonthlyIncome`)와 v1·v2 → v3 옮기기는 U2 domain-entities 변경 3 절 그대로. 아래 내용이 앞 절과 다르면 이 절을 따른다.

### 8.1 마법사 화면 ID·그룹

```ts
type StepId =
  | "householdKind"                                                         // 새: 처음 입력 첫 화면
  | "selfBirth" | "household" | "householdMore" | "spouseBirth" | "head"
  | "marriage" | "marriageDate" | "children"                                // 새: 결혼·자녀 (신혼만)
  | "residence" | "residenceYears"
  | "homeOwned" | "homeCount" | "homelessYears"
  | "neverOwned" | "incomeTax"                                             // 새: 생애최초 (신혼만)
  | "savingsOwner" | "savingsKind" | "savingsPeriod" | "savingsAmount"
  | "spouseSavingsKind" | "spouseSavingsPeriod" | "spouseSavingsAmount"     // 새: 배우자 통장 (신혼만)
  | "income" | "spouseIncome" | "spouseEarns" | "asset" | "car" | "welfare" // spouseIncome 새 (신혼만)
  | "districts" | "regions" | "area" | "tenurePrefs"
  | "review";

type GroupId = "kind" | "basic" | "marriage" | "residence" | "housing" | "savings" | "money" | "districts" | "prefs";
```

| 그룹 | 이름 | 노부부 | 신혼 |
|---|---|:-:|:-:|
| `kind` | 가구 종류 | 처음 입력 첫 화면만 (설정은 따로 한 줄) | 같음 |
| `basic` | 기본 정보 | ✅ | ✅ |
| `marriage` | 결혼·자녀 | – | ✅ |
| `residence`·`housing`·`savings`·`money`·`districts`·`prefs` | 지금 이름 | ✅ | ✅ |

`groupOrder(kind)`: 노부부 = 지금 7개 그대로, 신혼 = `basic` 다음에 `marriage`를 넣은 8개 (Q5=A).

### 8.2 답 `WizardAnswers` 새 키

```ts
interface WizardAnswers {
  householdKind?: HouseholdKind;                    // "senior" | "newlywed" (필수)
  marriage?: Maybe<MarriageStatus>;                  // "engaged" | "married"
  marriageDate?: Maybe<IsoDate>;                     // 예비신혼 = 연·월(일은 01), 신혼 = 연·월·일 (Q1=A)
  children?: Maybe<0 | 1 | 2 | 3>;                   // 3 = 3명 이상, 태아 포함
  neverOwned?: Maybe<boolean>;                       // 세대원 모두 집을 가진 적 없음
  incomeTax5y?: Maybe<boolean>;                      // 5년 이상 소득세 낸 분 있음
  spouseSavingsKind?: Maybe<SavingsKind>;            // 배우자 통장 (Q2=A)
  spouseSavingsMonthsBand?: Maybe<MonthsBand>;
  spousePaymentCount?: Maybe<number>;
  spouseDepositManwon?: Maybe<number>;
  spouseIncome?: Maybe<number>;                      // 배우자 월소득 (Q3=A). 신혼은 monthlyIncome = 본인 월소득
  // 나머지 키 그대로
}
```

- **같은 키, 다른 뜻 하나**: `monthlyIncome`은 노부부 = 부부 합계, 신혼 = **본인** 월소득. 화면 문구가 다르고(BR-U4-D30), 변환이 가구 종류를 보고 처리한다
- 신혼 가구에서 `savingsKind`·`savingsMonthsBand`·`paymentCount`·`depositManwon`은 **본인 통장**, `spouse*` 키는 배우자 통장

### 8.3 답 ↔ 프로필 변환 (신혼)

| 프로필 | 신혼 답에서 |
|---|---|
| `householdKind` | `"newlywed"` (노부부 답은 `"senior"`, 키가 없으면 노부부 — 옛 초안) |
| `householdType`·`householdSize`·`spouse` | 항상 `couple`, 2 + 자녀 수(모름 → 0), 배우자 있음 (BR-U2-D3) |
| `newlywed.marriage`·`marriageDate` | 답 그대로, 모름 → `null`. 상태 모름이면 날짜도 `null` |
| `newlywed.children` | 답 그대로 (3 = 3명 이상), 모름 → `null` |
| `newlywed.neverOwnedHome` | `homeOwned = true`면 `false`, 아니면 `neverOwned` 답 |
| `newlywed.incomeTax5y` | 답 그대로 |
| `savings` · `newlywed.spouseSavings` | 아래 표 |
| `money.monthlyIncome` | 본인 + 배우자 (둘 다 알 때만, 하나라도 모름 → `null`, BR-U2-D23) |
| `money.spouseMonthlyIncome` | `spouseIncome` 답, 모름 → `null` |
| `money.spouseEarns` | 배우자 소득을 알면 `> 0`, 모름 → `null` |
| `welfare` | `null` (묻지 않음) |

| 답 `savingsOwner` | `savings` (본인) | `newlywed.spouseSavings` |
|---|---|---|
| `self` | `has: true`, `owner: "self"`, 본인 화면 값 | `has: false`, 나머지 `null` |
| `spouse` | `has: false`, 나머지 `null` | `has: true`, `owner: "spouse"`, 배우자 화면 값 |
| `both` | `has: true`, `owner: "self"`, 본인 값 | `has: true`, `owner: "spouse"`, 배우자 값 |
| `none` | `has: false` | `has: false` |
| `UNKNOWN`·없음 | `has: null` | `null` (본인 통장만 보고 확인 필요, U2 `evaluateCoupleSavings`) |

`fromProfile`(신혼): 본인 `has`·배우자 `has`로 `both` / `self` / `spouse` / `none`(둘 다 false, 배우자 null도 포함) / `UNKNOWN`(본인 null이고 배우자가 true가 아님). `monthlyIncome`(합계)과 배우자 소득을 둘 다 알면 본인 = 합계 − 배우자, 아니면 본인 `UNKNOWN`.

> 본인 소득만 알고 배우자 소득을 모르면 합계를 저장할 수 없어(BR-U2-D23) 본인 소득도 남지 않는다. 확인 화면 소득 줄에 "두 분 소득을 모두 넣어야 소득 조건을 볼 수 있어요"를 보여 준다(BR-U4-D32).

### 8.4 가구 종류 바꾸기 `switchKind(answers, kind)`

설정에서 종류를 바꿀 때(Q4=A) 지금 답을 새 종류의 답으로 옮긴다. 결과는 `pruneHidden`을 거쳐 마법사 시작값이 된다.

| 답 | 노부부 → 신혼 | 신혼 → 노부부 |
|---|---|---|
| 생년월일·배우자 생년월일·세대주·사는 곳·집(지금 집·채 수·무주택 기간)·자산·자동차·관심 지역·원하는 집 | 그대로 | 그대로 |
| 가구 구성 | `couple`로 (혼자였으면 배우자 생년월일은 비어 있어 다시 묻는다) | 자녀 0·모름 → `couple`, 자녀 ≥ 1 → `other` + 2 + 자녀 수 + 배우자 있음 |
| 통장 명의·자세한 값 | `self`·`none`·모름 → 그대로, `spouse` → 자세한 값을 배우자 키로 옮김, `both` → 통장 답 모두 지움(어느 통장 값인지 몰라서 다시 묻는다) | `self`·`none`·모름 → 그대로, `spouse` → 배우자 키를 본인 키 자리로, `both` → 가입 기간이 긴 쪽 통장(같으면 본인)을 남김 |
| 소득 | `monthlyIncome`(합계)·`spouseEarns` 지움 — 뜻이 달라 다시 묻는다 | 본인·배우자 소득을 둘 다 알면 합계 → `monthlyIncome`, 배우자 소득 > 0 → `spouseEarns`. 아니면 지움 |
| 신혼만 있는 답 (결혼·자녀·생애최초·배우자 통장·배우자 소득) | 비어 있음 → 묻는다 | 지움 (자녀 수는 가구 구성에 쓴 뒤) |
| 복지 대상 | 지움 | 비어 있음 → 묻는다 |

### 8.5 초안 버전 3

```ts
interface WizardDraft { version: 3; answers: WizardAnswers; stepId: StepId; updatedAt: string }
```

| 읽은 초안 | 처리 |
|---|---|
| 버전 3 | 그대로 |
| 버전 2 | `householdKind: "senior"`를 넣는다(화면·답 키는 그대로). 화면 ID도 그대로 |
| 버전 1 | 지금처럼 v1 → v2 옮긴 뒤 위 규칙 |
| 그 밖 | 버린다 |

`StoredProfile` 바깥 형식은 그대로, 안의 `profile`은 `parseProfile`(U2, v3)로 읽는다. 저장은 항상 v3. **업데이트 안내 번호(`WHATS_NEW.notice`)는 1 그대로** — 부모님 기기에 묻는 것이 없다(FR-C3-2). `mz.updates` 처음 기록 규칙의 "저장된 프로필이 버전 2"는 "버전 2 이상"으로 읽는다.

### 8.6 속성 기반 테스트 대상 추가 (PBT-01)

| # | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U4-D1 | **노부부 불변**: 노부부 답 `a`에 대해 보이는 화면 = [`householdKind`] + 변경 3 전 화면 목록, `toProfile(a)` = 변경 3 전 `toProfile(a)` + `householdKind: "senior"`·`newlywed: null` (변경 3 전 코드 사본과 비교) | 화면·변환 | 불변식 (NFR-C3-1) |
| P-U4-D2 | 필수가 채워진 모든 신혼 답에서 `toProfile` 결과가 U2 `validateProfile`(v3)을 통과한다 | `toProfile` | 불변식 |
| P-U4-D3 | 신혼 답 왕복 `toProfile(fromProfile(toProfile(a))) = toProfile(a)` | 변환 | 왕복 |
| P-U4-D4 | 초안 옮기기(v1·v2 → v3) 멱등, 옮긴 초안은 노부부 | 초안 | 멱등 (NFR-C3-2) |
| P-U4-D5 | `switchKind` 뒤 `pruneHidden`한 답은 새 종류 화면 정의에 맞다(안 보이는 키 없음). 노부부 → 신혼 → 노부부로 돌아와도 공통 답(생년월일·사는 곳·집·자산·자동차·관심 지역·원하는 집)은 그대로 | `switchKind` | 불변식·왕복(부분) |
| P-U4-D6 | `pruneHidden` 뒤 노부부 답에는 신혼 키가, 신혼 답에는 `welfare`·`spouseEarns`·`householdMore` 키가 없다 | `pruneHidden` | 불변식 |
