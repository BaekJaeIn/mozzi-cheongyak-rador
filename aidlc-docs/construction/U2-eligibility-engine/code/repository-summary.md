# U2 — Repository 요약 (Step 9~11)

## 생성·변경 파일

| 파일 | 내용 |
|---|---|
| `src/server/db/profile-repository.ts` (신규) | `save`(RPC `save_device_profile` → 새 버전), `get`, `listDeviceIdsWithProfile`(1,000행 페이지) |
| `src/server/db/notice-repository.ts` (신규) | `listRetainedWithUnits`: `notices` + `housing_units` + `notice_districts` 임베딩을 1,000행 페이지로. 저장된 요건이 형식 검증에 실패하면 `{ unclassified: true }`(→ 확인 필요). `getById` |
| `src/server/db/judgement-repository.ts` (신규) | `replaceForDevice(deviceId, profileVersion, rows)` → RPC, `-1`이면 `stale` |
| `src/server/db/reference-repository.ts` (변경) | `loadIncomeThresholds`(bigint 문자열 → 숫자), 지구 조회에 `area_keywords` |
| `src/server/security/keyring.ts` (신규) | ServerEnv → 키링, 인스턴스당 1번, 실패는 캐시 안 함 |
| `src/server/deps.ts` (변경) | `profileRepository`, `judgementService()` 조립 (U4가 사용) |
| `_shared/db/types.ts`·`mappers.ts` (변경) | `District.areaKeywords` / `area_keywords` |

**확인한 점**: Supabase PostgREST는 한 번에 최대 1,000행만 돌려준다. 공고는 최대 2,000건까지 보관하므로(NFR-U1-01) 페이지 나눔이 없으면 판정에서 공고가 조용히 빠진다. 그래서 목록 조회 두 곳에 페이지 나눔을 넣었다.

## 테스트

`src/server/db/__tests__/u2-repositories.test.ts` (예시 7건): 저장 RPC 인자, 행 → 프로필, 1,000 + 3행 두 페이지 읽기, 공고 묶음 변환(면적 문자열 → 숫자, 깨진 요건 → 분류 실패), 기준표 bigint, 판정 저장 인자(기기 ID·버전 분리), `-1` → stale. U1 `mappers.pbt.test.ts`의 지구 생성기에 `areaKeywords` 추가.

**실행 결과**: 전체 29개 파일, 206개 테스트 통과, `tsc` 오류 없음.
