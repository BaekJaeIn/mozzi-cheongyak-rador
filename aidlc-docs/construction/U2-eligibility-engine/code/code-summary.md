# U2 eligibility-engine — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U2-eligibility-engine-code-generation-plan.md`
> 세부: [business-logic-summary.md](business-logic-summary.md) · [repository-summary.md](repository-summary.md)

## 1. 생성·변경 파일

| 영역 | 파일 |
|---|---|
| 도메인 (`_shared/domain/`) | `profile.ts`, `requirements.ts`, `supply-types.ts`, `district-matcher.ts`, `requirement-resolver.ts` |
| 판정 엔진 (`_shared/eligibility/`) | `types.ts`, `messages.ts`, `income-table.ts`, `criteria/{common,age,simple,income,savings,welfare}.ts`, `engine.ts`, `scoring.ts`, `visibility.ts`, `reference-data.ts` |
| 보안 (`_shared/security/`) | `amount-cipher.ts`, `profile-codec.ts` |
| 서비스 (`_shared/services/`) | `judgement-service.ts` |
| `_shared/db/` (변경) | `repositories.ts`(인터페이스 갱신), `types.ts`·`mappers.ts`(`areaKeywords`) |
| Node (`src/server/`) | 신규 `db/{profile,notice,judgement}-repository.ts`, `security/keyring.ts` / 변경 `db/reference-repository.ts`, `deps.ts` |
| DB | `supabase/migrations/0006_eligibility_reference.sql`, `supabase/tests/reference.test.sql`(신규), `supabase/tests/rpc.test.sql`(판정 저장 4건 추가) |
| 테스트 | `_shared/__tests__/{fixtures,memory-repos}.ts`, `arbitraries/eligibility.ts`, 예시 7개 파일, PBT 5개 파일, 상태 기반 1, 성능 1, SQL 대조 1, `src/server/db/__tests__/u2-repositories.test.ts` |
| 문서 | `README.md`에 "연간 갱신", "암호화 키 교체" 절 |

## 2. 검증 결과 (Step 15)

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 오류 없음 |
| `npm run lint` | ✅ 오류·경고 없음 |
| `npm test` | ✅ 31개 파일, **210개 테스트** 통과 (U1 97 + U2 113), 서로 다른 seed로 반복 확인 |
| 성능 (NFR-U2-01·02) | ✅ 공고 2,000건 판정 1초 미만, 1건 평균 1ms 미만 (`performance.test.ts`) |
| SQL 시드 = TS 원본 | ✅ 공급유형 9, 소득표 15행, 지구 6 (`reference-data.test.ts`) |
| `npm run build` | ✅ 성공 |
| `deno check`, pgTAP(`rpc` 25건, `reference` 9건) | ⏸ 이 PC에 Deno·Docker 없음 → push 후 GitHub Actions(`ci`, `db-and-e2e`)에서 확인 |

## 3. 테스트가 찾은 문제 (모두 수정)

| # | 찾은 방법 | 문제 | 조치 |
|---|---|---|---|
| 1 | 예시 테스트 | 형식이 틀린 키 문자열이면 `DOMException`이 그대로 나감 | `AmountCipherError`로 감쌈 |
| 2 | **PBT** | 0~9만원(예: 자동차 없음 = 0) 암호문 23자가 형식 검사(24자 이상)에 걸려 **프로필 복호화 불가** — 그 기기는 판정이 전혀 안 됐을 것 | 최소 23자로 수정 + 회귀 예시 |
| 3 | **변이 검사** | "정보 감소" 속성이 나이 규칙 버그를 못 잡음 | 조건별 판정까지 비교하도록 강화 → 3/3 검출. "사유에 내 금액" 변이도 검출 확인 |
| 4 | 설계 확인 | PostgREST 1,000행 제한으로 공고 2,000건 중 일부가 판정에서 조용히 빠질 수 있음 | 목록 조회 2곳에 페이지 나눔 |

## 4. 설계 대비 결정

| # | 내용 |
|---|---|
| CG-U2-1 | `EligibilityReference`는 `engine.ts`에, 재계산용 기준 데이터는 소득표만이라 `loadEligibilityReference` 대신 `loadIncomeThresholds` |
| CG-U2-2 | 기준 데이터 원본을 TS(`reference-data.ts`)에 두고 SQL 시드와 테스트로 대조 (NFR-U2-19 강화) |
| CG-U2-3 | `CriterionResult.code`(기계용 사유 코드) 추가 — 관측성(기준표 없음 집계)·U5 화면 분기용 |
| CG-U2-4 | 저장된 요건이 형식 검증에 실패하면 `{ unclassified: true }` → 확인 필요 (놓치지 않기) |
| CG-U2-5 | 행복주택 등 사유 문구에서 내 금액 제외를 PBT로 "금액만 다른 두 프로필의 사유가 같다"로 검증 |

## 5. PBT 준수 (Code Generation)

| 규칙 | 상태 | 근거 |
|---|---|---|
| PBT-01 | ✅ | 기능 설계 24개 속성 → 모두 구현 (business-logic-summary 표) |
| PBT-02 왕복 | ✅ | 암호화, 프로필 코덱, (U1) 행 변환에 지구 `areaKeywords` 반영 |
| PBT-03 불변식 | ✅ | 놓치지 않기 2종, 정보 감소, 금액·나이 단조, 가구 대칭, 지구 매칭, 면적, 점수, 사유 금액 독립 |
| PBT-04 멱등 | ✅ | 요건 확정 `resolve(S,S)=S`, 재계산 멱등 |
| PBT-05 오라클 | ✅ | 합성(순위 최대·최소), 노출 조건, 상태 기반 모델(전체 다시 계산) |
| PBT-06 상태 기반 | ✅ | `fc.commands` 5종(저장·공고 추가/삭제·전체 재계산·오래된 저장), 명령 최대 20, 실행 횟수 기본/2 |
| PBT-07 생성기 | ✅ | `arbitraries/eligibility.ts` 공용 (U3·U5·U6 재사용) |
| PBT-08 재현 | ✅ | U1 seed 설정 승계, shrinking 기본값 (실패 시 축소된 반례 출력 확인) |
| PBT-09 프레임워크 | ✅ | fast-check + @fast-check/vitest (U1) |
| PBT-10 보완 | ✅ | 핵심 시나리오 9개 예시 + PBT 발견 회귀 예시 |

## 6. 스토리 기여

US-04·06·07(입력 항목·지구·면적 규칙), US-08·18(저장 후 재계산 서비스, 버전 보호), US-10·12(노출 조건 K5·정렬), US-14(조건별 사유·행동 문구·`userValue`). 화면·API는 U4·U5.
