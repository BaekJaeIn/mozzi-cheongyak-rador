# 모찌네 청약 알리미 — 컴포넌트 메서드 시그니처

> 입력/출력 형태와 목적만 정의한다. 판정 기준·경계값·점수 가중치 같은 **상세 규칙은 Functional Design**에서 정한다.
> 표기는 TypeScript. `Result<T>`는 `{ ok: true; value: T } | { ok: false; error: AppError }`.

---

## C1 DomainTypes (주요 타입)

```ts
type Verdict = 'eligible' | 'ineligible' | 'unknown';          // 충족 / 미충족 / 확인 필요
type CriterionKey = 'age' | 'homeless' | 'income' | 'asset' | 'car'
                  | 'savingsAccount' | 'residence' | 'household';

interface District { id: string; name: string; sido: string; sigungu: string[]; keywords: string[] }

interface Notice {
  id: string; source: SourceCode; sourceNoticeNo: string;
  title: string; complexName?: string; location?: string;
  districtIds: string[]; provider: string; originalUrl: string;
  schedule: { announcedAt?: string; applyStart?: string; applyEnd?: string;
              resultAt?: string; contractStart?: string; contractEnd?: string };
  units: HousingUnit[]; summary?: AiSummary; firstSeenAt: string;
}

interface HousingUnit {
  id: string; supplyType: SupplyTypeCode; exclusiveAreaM2?: number;
  supplyCount?: number; requirements: Requirements;
}

/** 조건별 요건. 각 조건은 값이 있거나, 없거나(요건 없음), unknown(확인 필요) */
type Requirements = { [K in CriterionKey]?: RequirementValue<K> | 'unknown' };

interface HouseholdProfile {
  schemaVersion: number;
  self: { birthDate: string }; spouse?: { birthDate: string };
  householdType: 'couple' | 'other';
  residence: { sido: string; sigungu: string; years?: number };
  housing: { homeless?: boolean; homelessYears?: number; ownedCount?: number };
  savings: { has?: boolean; kind?: string; months?: number; paymentCount?: number; recognizedAmount?: number };
  money: { monthlyIncome?: number; totalAsset?: number; carValue?: number };   // 만원 단위, undefined = 모름
  prefs: { districtIds: string[]; areaBands: AreaBand[]; tenure: 'sale' | 'rent' | 'both'; lowFloor: boolean };
}

interface CriterionResult { key: CriterionKey; verdict: Verdict; reason: string; action?: string }
interface UnitJudgement  { unitId: string; verdict: Verdict; criteria: CriterionResult[] }
interface NoticeJudgement { noticeId: string; verdict: Verdict; units: UnitJudgement[]; score?: number }
```

## C2 DistrictMatcher
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `matchDistricts(text: NoticeText, districts: District[]): string[]` | 키워드 + 시군구 보조 매칭으로 해당 지구 ID 목록 (여러 개 가능) | 공고 텍스트 필드, 지구 정의 → 지구 ID 배열 |

## C3 SupplyTypeClassifier
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `classify(raw: RawUnitInfo): SupplyTypeCode` | 원천 공급유형 문자열·필드를 표준 코드로 | 원천 정보 → 코드 (모르면 `other`) |
| `plainLabel(code: SupplyTypeCode): { formal: string; plain: string }` | 화면용 정식 명칭 + 쉬운 말 | 코드 → 라벨 |

## C4 RequirementResolver
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `resolveRequirements(standard: Requirements, extracted: Requirements \| null): Requirements` | 표준 요건과 AI 추출 요건 병합, 불일치 조건은 `'unknown'` | 두 요건 → 최종 요건 |
| `validateExtracted(json: unknown): Result<Requirements>` | AI 추출 JSON 형식 검증 | 임의 JSON → 검증된 요건 또는 오류 |

## C5 EligibilityEngine
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `judgeNotice(profile, notice, ref: ReferenceData, asOf: Date): NoticeJudgement` | 공고 단위 판정 (주택형 중 하나라도 충족/확인 필요면 그 결과를 공고 결과로) | → 공고 판정 |
| `judgeUnit(profile, unit, ref, asOf): UnitJudgement` | 주택형 단위 판정 | → 주택형 판정 |
| `evaluate<K>(key: K, profile, req: Requirements[K], ref, asOf): CriterionResult` | 조건별 판정기 (나이·무주택·소득·자산·자동차·통장·거주·세대) | → 조건 판정 + 사유 문구 |
| `combine(results: Verdict[]): Verdict` | 조건 결과 합성 (하나라도 미충족 → 미충족, 아니면 하나라도 확인 필요 → 확인 필요) | → 최종 판정 |

## C6 Recommender
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `score(notice: Notice, prefs: HouseholdProfile['prefs'], asOf: Date): number` | 정렬용 추천 점수 (공고를 숨기지 않음) | → 점수 |

## C7 AmountCipher
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `encrypt(plain: number, key: CryptoKey): Promise<string>` | 금액 암호화 (AES-GCM, IV 포함 문자열) | 숫자 → 암호문 |
| `decrypt(cipher: string, key: CryptoKey): Promise<number>` | 복호화 | 암호문 → 숫자 |
| `importKey(raw: string): Promise<CryptoKey>` | 시크릿에서 키 로드 | → 키 |

## C8 ProfileCodec
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `encode(profile, cipher): Promise<StoredProfile>` | 서버 저장 형식으로 (금액 필드만 암호화) | → 저장 형식 |
| `decode(stored, cipher): Promise<HouseholdProfile>` | 역변환, 구버전 스키마 마이그레이션 포함 | → 프로필 |

---

## C9 Collector / C10 MockProvider
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `collect(ctx: CollectContext): Promise<Result<RawNotice[]>>` | 소스에서 원천 공고 수집 (`ctx`: 기간, API 키, fetch, 목업 여부) | → 원천 공고 목록 또는 오류 |
| `readonly source: SourceCode` | 소스 식별자 | |

## C11 Normalizer
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `normalize(raw: RawNotice): Result<NormalizedNotice>` | 공통 형식 변환 (매칭·분류 전) | 원천 → 정규화 공고 |

## C12 AiSummarizer
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `summarize(notice: NormalizedNotice): Promise<Result<AiSummary>>` | 쉬운 말 자격 요약 + 노부부 관점 설명 | 공고 정보만 → 요약 |
| `extractRequirements(notice: NormalizedNotice): Promise<Result<unknown>>` | 주택형별 요건 JSON 추출 (검증은 C4) | → 원시 JSON |

## C13 CollectRunLog
| 메서드 | 목적 |
|---|---|
| `record(run: { source: SourceCode; ok: boolean; count: number; warning?: string; error?: string }): Promise<void>` | 소스별 실행 결과 기록 |

---

## C14 DispatchPlanner
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `plan(nowKst: Date): Promise<DispatchItem[]>` | 이 시각 대상 기기 × 아직 알리지 않은 충족·확인 필요 공고 묶음 | → `{ deviceId, noticeIds, counts: { eligible, unknown } }[]` |

## C15 PushSender
| 메서드 | 목적 | 입력 → 출력 |
|---|---|---|
| `send(sub: PushSubscription, payload: PushPayload): Promise<'sent' \| 'gone' \| 'failed'>` | 발송, `gone`(404/410)이면 호출 측이 구독 삭제 | → 결과 |
| `buildPayload(item: DispatchItem): PushPayload` | 문구("새 공고 N건 (충족 a · 확인 필요 b)")와 이동 URL(1건이면 상세, 여러 건이면 피드) | → 알림 내용 |

## C16 NotificationLedger
| 메서드 | 목적 |
|---|---|
| `filterUnnotified(deviceId, noticeIds): Promise<string[]>` | 이미 알린 공고 제외 |
| `markNotified(deviceId, noticeIds, at): Promise<void>` | 이력 기록 (유일 제약으로 중복 무시) |

---

## C17~C20 Repository (주요 메서드)
```ts
NoticeRepository:      upsertMany(notices): Promise<UpsertResult>; listOpen(asOf): Promise<Notice[]>;
                       getById(id): Promise<Notice | null>
ReferenceDataRepository: load(): Promise<ReferenceData>   // 지구, 기준표, 표준 요건
DeviceRepository:      create(deviceId, tokenHash); verify(deviceId, tokenHash): Promise<boolean>;
                       saveProfile(deviceId, stored); getProfile(deviceId); listActiveProfiles();
                       saveNotifySettings(deviceId, { hour, enabled }); listByNotifyHour(hour);
                       saveSubscription(deviceId, sub); deleteSubscription(endpoint);
                       deleteAll(deviceId)                // 프로필·구독·판정·이력 모두
JudgementRepository:   replaceForDevice(deviceId, judgements); replaceForNotices(noticeIds, judgements);
                       listVisible(deviceId, asOf)       // 충족·확인 필요 + 열린 공고
                       get(deviceId, noticeId)
```

## C21 DeviceAuth
| 메서드 | 목적 |
|---|---|
| `authenticate(req: Request): Promise<Result<{ deviceId: string }>>` | 헤더 `x-device-id`, `x-device-token` 확인 (토큰 해시 대조) |

## C22 API Routes
| 경로 | 입력 | 출력 | 스토리 |
|---|---|---|---|
| `POST /api/device` | `{ deviceId, token }` | 201 | US-02 |
| `PUT /api/profile` | `HouseholdProfile` | `{ savedAt }` (저장 후 이 기기 판정 재계산) | US-08, 18 |
| `PUT /api/notify-settings` | `{ hour: 0-23, enabled }` | 200 | US-09 |
| `POST /api/push/subscribe` | `PushSubscriptionJSON` | 201 | US-03 |
| `DELETE /api/device` | — | 204 (모두 삭제) | US-20 |
| `GET /api/feed` | — | `FeedItem[]` (충족·확인 필요, 정렬됨) | US-12 |
| `GET /api/notices/[id]` | — | `NoticeDetail` (+ 이 기기 판정 사유, 피드 밖 공고도 허용) | US-13, 14 |

---

## C23~C32 클라이언트 (주요 함수·훅)
```ts
DeviceIdentity:   ensureDevice(): Promise<{ deviceId; token }>; authHeaders(): HeadersInit
LocalProfileStore: load(): HouseholdProfile | null; saveDraft(step, partial); commit(profile);
                   pendingSync(): boolean; flushSync(): Promise<Result<void>>
ProfileWizard:    <ProfileWizard initial? onDone />   // 단계 정의 배열 기반
FeedView:         useFeed(): { items, loading, error, reload }
NoticeDetailView: useNoticeDetail(id); toCalendarLink(notice): string | null
BookmarkStore:    list(); toggle(noticeId, snapshot); remove(noticeId)
SettingsView:     <SettingsView />
DisplayMode:      useDisplayMode(): { mode: 'normal' | 'easy'; setMode }
PwaShell:         registerSW(); promptInstall(); isIosStandalone(); subscribePush(): Promise<Result<void>>
```
