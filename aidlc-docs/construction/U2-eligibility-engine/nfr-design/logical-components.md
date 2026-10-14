# U2 eligibility-engine — 논리 컴포넌트

---

## 1. 컴포넌트 목록

| ID | 컴포넌트 | 위치 | 역할 | 패턴 |
|---|---|---|---|---|
| L-U2-1 | **Engine** (`judgeNotice`, `judgeUnit`, 조건별 판정기, 합성) | `_shared/eligibility/` | 순수 판정 | P-U2-R4, P-U2-P3 |
| L-U2-2 | **Messages** | `_shared/eligibility/messages.ts` | 사유·행동 문구 템플릿 (금액 인자 없음) | P-U2-S3 |
| L-U2-3 | **Matcher / Classifier / Resolver** | `_shared/domain/` | 지구 매칭, 공급유형 분류, 요건 확정 | |
| L-U2-4 | **Scoring / Visibility** | `_shared/eligibility/` | 점수, 정렬 비교, 노출 조건(K5) | |
| L-U2-5 | **AmountCipher + Keyring** | `_shared/security/` | 버전별 `CryptoKey` 보관, 암·복호화 | P-U2-S1 |
| L-U2-6 | **ProfileCodec** | `_shared/security/` | 평문 프로필 ↔ 저장 형식 | P-U2-S2 |
| L-U2-7 | **JudgementService** | `_shared/services/` | `recomputeForDevice`, `recomputeAll` (Repository·Keyring·asOf 주입) | P-U2-R1~R3 |
| L-U2-8 | **Node Repository 구현 추가** | `src/server/db/` | 아래 §2 메서드의 Node 구현 | P-U2-P2 |
| L-U2-9 | **DB 함수 변경·추가** | `supabase/migrations/0006_*.sql` | 아래 §3 | P-U2-R3 |
| L-U2-10 | **기준 데이터 시드** | `supabase/migrations/0006_*.sql` | 지구 6개, 기준표 2026, 표준 요건 8+1 | NFR-U2-19 |

Deno Repository 구현은 U3에서 같은 인터페이스로 만든다 (CG-1).

## 2. Repository 인터페이스 추가 (`_shared/db/repositories.ts`)

| 인터페이스 | 메서드 | 비고 |
|---|---|---|
| `ProfileRepository` | `get(deviceId): StoredProfile \| null` | U1 인터페이스에 이미 선언, U2에서 Node 구현 |
| | `listDeviceIdsWithProfile(): string[]` | 추가 |
| `NoticeRepository` | `listRetainedWithUnits(): NoticeWithUnits[]` | 추가. 공고 + 주택형 + 지구 ID를 한 번에 |
| `ReferenceDataRepository` | `loadEligibilityReference(): { districts, incomeThresholds, supplyTypeStandards }` | 추가. 재계산 1회 1번 |
| `JudgementRepository` | `replaceForDevice(deviceId, profileVersion, judgements): "saved" \| "stale"` | **시그니처 변경** (U1은 버전 없음) |

## 3. DB 변경 (`0006_eligibility_reference.sql`)

| 대상 | 변경 |
|---|---|
| `districts` | `area_keywords text[] not null default '{}'` 추가, 6개 지구 시드 |
| `income_asset_thresholds` | `amount_manwon` → `amount_won bigint`, `kind` 체크를 `monthly_income`만, `basis` 체크 `urban_worker`·`median`, 2026 시드 |
| `supply_type_standards` | 8개 코드 + `other` 시드 (출처 주석) |
| `replace_judgements_for_device` | `(uuid, integer, jsonb)` 새 시그니처로 교체: 프로필 행 잠금 + 버전 비교, 오래된 계산은 `-1` 반환. 옛 `(uuid, jsonb)` 함수 삭제 |
| `replace_judgements_for_notices` | 사용처가 없어 삭제 (U1 틀) |
| pgTAP | `rpc.test.sql`에 버전 비교 경우 추가(같은 버전 저장, 낮은 버전 건너뜀, 프로필 없음) |

## 4. 호출 관계

```text
[U4 저장 API — Node]
 PUT /api/profile -> save_device_profile RPC -> 새 profileVersion
                  -> JudgementService.recomputeForDevice(deviceId)
                       -> ProfileRepository.get -> ProfileCodec.decode(Keyring)
                       -> ReferenceDataRepository.loadEligibilityReference
                       -> NoticeRepository.listRetainedWithUnits
                       -> Engine.judgeNotice (공고마다)
                       -> JudgementRepository.replaceForDevice(version) -> RPC (버전 확인)

[U3 일일 수집 — Deno]
 collect -> ... -> JudgementService.recomputeAll(asOf)
                    -> ReferenceData·공고 1번 로드
                    -> 기기마다 위 decode -> judge -> replace (실패·stale 격리)
                    -> 요약 반환 -> collect_runs 기록

[U5 피드·상세 — Node]  judgements 읽기 + Visibility(K5) + Scoring 정렬
[U6 발송 — Deno]       judgements 읽기 + Visibility(K5)
```

## 5. PBT 준수 요약 (이 단계)

| 항목 | 반영 |
|---|---|
| PBT-01 보완 | 버전 확인: "낮은 버전 저장 시도는 저장된 판정을 바꾸지 않는다"를 상태 기반 테스트 명령(PBT-06)에 포함 — 메모리 Repository가 같은 규칙을 구현 |
| PBT-06 | 재계산 상태 기반 테스트의 모델에 profileVersion 규칙 반영 |

Blocking finding 없음.
