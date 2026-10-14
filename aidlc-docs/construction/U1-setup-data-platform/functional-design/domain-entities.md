# U1 setup-data-platform — 도메인 엔티티

> 근거: U1 기능 설계 계획 답변 (Q1=A 대표 공고로 묶음, Q2=B 마감 1년 후 삭제, Q3=A 180일 미접속 삭제, Q4=B 누구나 등록, Q5=A 새 기기로 시작)
> 기술 중립 표기 (타입은 논리 타입). 물리 스키마(SQL)는 Code Generation에서 작성한다.
> 금액 단위는 모두 **만원**.

---

## 1. 엔티티 관계 개요

```text
District 1---N NoticeDistrict N---1 Notice 1---N HousingUnit
                                     Notice 1---N SourceNotice
SupplyTypeStandard 1---N HousingUnit (supply_type)
IncomeAssetThreshold (연도별 기준표, 독립)

Device 1---0..1 DeviceProfile
Device 1---N PushSubscription
Device 1---N Judgement N---1 Notice
Device 1---N NotificationLog N---1 Notice
CollectRun (독립)
```

삭제 연쇄: `Device` 삭제 → DeviceProfile, PushSubscription, Judgement, NotificationLog 모두 삭제.
`Notice` 삭제 → NoticeDistrict, HousingUnit, SourceNotice, Judgement, NotificationLog 모두 삭제.

---

## 2. 공고 영역

### E1 District (지구)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | text | PK | 예: `wangsuk`, `gyosan` |
| name | text | 필수 | "남양주 왕숙" |
| sido | text | 필수 | |
| sigungu | text[] | 1개 이상 | 보조 매칭용 |
| keywords | text[] | 1개 이상 | 키워드 매칭용 |
| active | boolean | 기본 true | 1차 UI는 6개 모두 active |
| sortOrder | int | | 화면 표시 순서 |

값(시드)은 U2 책임 (Q-U6).

### E2 SourceNotice (원천 공고, 소스별)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| source | enum | 필수 | `applyhome` / `lh_rental` / `myhome_complex` / `sh` / `gh` |
| sourceNoticeNo | text | 필수 | 소스의 공고 번호 |
| noticeId | uuid | FK → Notice, 필수 | 묶인 대표 공고 |
| originalUrl | text | 필수 | 이 소스의 원문 링크 |
| raw | json | | 원천 응답 일부 (디버깅·재정규화용) |
| contentHash | text | 필수 | 변경 감지 (같으면 재처리 생략) |
| firstSeenAt / lastSeenAt | timestamp | 필수 | |
| | | **UNIQUE(source, sourceNoticeNo)** | 재실행 안전 (NFR-3.2) |

### E3 Notice (대표 공고) (Q1=A)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 피드·알림·북마크·상세 URL이 쓰는 ID |
| dedupKey | text | **UNIQUE** | 같은 공고를 묶는 키 (생성 규칙은 U3) |
| title | text | 필수 | |
| complexName | text | | 단지명 |
| location | text | | 공급 위치 |
| sido / sigungu | text | | |
| provider | text | 필수 | LH / SH / GH / 민간 등 |
| primarySource | enum | 필수 | 대표 원문 링크를 줄 소스 |
| tenure | enum | 필수 | `sale`(분양) / `rent`(임대) |
| announcedAt, applyStart, applyEnd, resultAt, contractStart, contractEnd | date | 모두 선택 | 일정 |
| summary | json | | AI 요약 `{ eligibilityPlain, forSeniorCouple, generatedAt }` |
| summaryStatus | enum | 기본 `pending` | `pending` / `done` / `failed` |
| firstSeenAt | timestamp | 필수 | NEW 배지·첫 등장 기준 |
| updatedAt | timestamp | 필수 | |

파생값 (저장하지 않음):
- `status`: 오늘 기준 `upcoming`(접수 예정) / `open`(접수 중) / `closed`(마감). `applyEnd`가 없으면 `upcoming`으로 본다 (놓치지 않기)
- `retentionBaseDate` = `applyEnd` ?? `announcedAt` ?? `firstSeenAt`의 날짜

### E4 NoticeDistrict (공고 ↔ 지구, 다대다)
| 속성 | 타입 | 제약 |
|---|---|---|
| noticeId | uuid | FK → Notice, PK 일부 |
| districtId | text | FK → District, PK 일부 |

하나의 공고가 여러 지구에 걸칠 수 있다 (FR-2.5).

### E5 HousingUnit (주택형·공급유형 단위)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| noticeId | uuid | FK → Notice, 필수 | |
| label | text | | 원천 표기 (예: "59A") |
| supplyType | text | FK → SupplyTypeStandard, 필수 | 모르면 `other` |
| exclusiveAreaM2 | decimal | ≥ 0 | |
| supplyCount | int | ≥ 0 | |
| standardRequirements | json | | 공급유형 표준 요건 사본 |
| extractedRequirements | json | | AI 추출 요건 (검증 통과분만) |
| requirements | json | 필수 | 최종 요건 (U2 RequirementResolver 결과) |

### E6 SupplyTypeStandard (공급유형 표준 요건)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| code | text | PK | 예: `happy_senior`, `public_sale_general`, `other` |
| formalLabel / plainLabel | text | 필수 | "행복주택 고령자 계층" / "어르신 우선 행복주택" |
| tenure | enum | 필수 | sale / rent |
| requirements | json | 필수 | 표준 요건 (구조는 U2) |
| effectiveFrom | date | 필수 | 기준 변경 대비 |

### E7 IncomeAssetThreshold (연도별 기준표)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| year | int | PK 일부 | 적용 연도 |
| kind | enum | PK 일부 | `monthly_income` / `total_asset` / `car_value` |
| householdSize | int | PK 일부 | 가구원 수 (자산·자동차는 0 = 무관) |
| basis | text | PK 일부 | 예: `urban_worker_100` (도시근로자 월평균소득 100%), `rental_asset_limit` |
| amountManwon | int | ≥ 0 | 금액 (만원) |

---

## 3. 기기 영역

### E8 Device
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 기기가 만든 device_id (UUID v4) |
| tokenHash | text | 필수 | 비밀 토큰의 SHA-256 (원문 저장 금지) |
| notifyHour | smallint | 0~23, 기본 9 | KST 알림 시각 (D16, A1) |
| notifyEnabled | boolean | 기본 true | 구독이 없으면 발송 대상 아님 |
| createdAt | timestamp | 필수 | |
| lastSeenAt | timestamp | 필수 | 마지막 접속 (Q3 판단 기준) |

### E9 DeviceProfile (기기당 0~1개)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| deviceId | uuid | PK, FK → Device | |
| schemaVersion | int | 필수 | 프로필 형식 버전 |
| data | json | 필수 | **금액을 제외한** 프로필 (생년월일·거주·주택·통장·선호) |
| encMonthlyIncome / encTotalAsset / encCarValue | text | 선택 | 암호문 (없으면 "모름") |
| profileVersion | int | 필수, 저장마다 +1 | 판정이 어떤 프로필로 계산됐는지 추적 |
| updatedAt | timestamp | 필수 | |

### E10 PushSubscription
| 속성 | 타입 | 제약 |
|---|---|---|
| endpoint | text | PK |
| deviceId | uuid | FK → Device, 필수 |
| p256dh / auth | text | 필수 |
| createdAt / lastSuccessAt | timestamp | |

### E11 Judgement (기기 × 대표 공고)
| 속성 | 타입 | 제약 | 설명 |
|---|---|---|---|
| deviceId | uuid | PK 일부, FK | |
| noticeId | uuid | PK 일부, FK | |
| verdict | enum | 필수 | `eligible` / `ineligible` / `unknown` |
| inDistrict | boolean | 필수 | 관심 지구 해당 여부 (노출 조건 K5에 사용) |
| score | decimal | | 추천 점수 |
| detail | json | 필수 | 주택형별 `{ unitId, verdict, criteria: [{ key, verdict, reason, action }] }` |
| profileVersion | int | 필수 | 계산에 쓴 프로필 버전 |
| computedAt | timestamp | 필수 | |

### E12 NotificationLog
| 속성 | 타입 | 제약 |
|---|---|---|
| deviceId | uuid | PK 일부, FK |
| noticeId | uuid | PK 일부, FK |
| notifiedAt | timestamp | 필수 |

**PK(deviceId, noticeId)**가 중복 발송을 막는다 (NFR-3.2).

### E13 CollectRun
| 속성 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| runId | uuid | 한 번의 수집 실행 묶음 |
| source | enum / `all` | |
| ok | boolean | |
| fetchedCount / upsertedCount | int | |
| deletedCount | int | 정리 작업 삭제 건수 (Code Generation에서 추가) |
| warning / error | text | 0건 경고 등 |
| startedAt / finishedAt | timestamp | |

---

## 4. 기기 측 저장 (localStorage)

| 키 | 내용 | 소유 Unit |
|---|---|---|
| `mz.device` | `{ deviceId, token }` | U1 |
| `mz.profile` | 프로필 원본 (금액 평문 포함, 기기 안에만) | U4 |
| `mz.wizardDraft` | 마법사 진행 상태 | U4 |
| `mz.syncPending` | 서버 동기화 대기 여부·시각 | U4 |
| `mz.bookmarks` | 북마크 + 공고 요약 사본 | U5 |
| `mz.displayMode` | `normal` / `easy` | U4 |

(접두사 `mz.` = 모찌네)
