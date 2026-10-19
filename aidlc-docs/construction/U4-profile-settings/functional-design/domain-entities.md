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
