# 단위 테스트 안내 (예시 + 속성 기반)

## 실행

```bash
npm test                    # Vitest: src/**/*.test.ts, supabase/functions/_shared/**/*.test.ts
FC_SEED=123456 npm test     # PBT seed 고정 재현 (README "PBT seed 재현")
```

- 실행마다 seed가 바뀌고 첫 줄에 `[PBT] seed=… numRuns=100`이 찍힌다. 실패하면 그 seed로 다시 돌려 재현한다.
- 재시도는 끈다(`retry: 0`) — PBT 실패를 덮지 않는다.

## 기대 결과 (2026-10-17)

| 항목 | 값 |
|---|---|
| 테스트 파일 | 54 |
| 테스트 | **611** (모두 통과) |
| seed 반복 | 서로 다른 seed 3회 이상 통과 |

Unit별 주요 대상:

| Unit | 예시 | 속성 기반(PBT) |
|---|---|---|
| U1 | 토큰·인증 헤더·route guard·저장소 | 토큰·해시 성질 |
| U2 | 판정 조건별·소득 기준표·점수 | 판정 단조성·코덱 왕복 등 |
| U3 | 실제 응답 픽스처 파서(청약홈·LH·GH)·정규화·묶기 | 정규화 멱등·날짜 파싱 |
| U4 | 마법사 화면 순서·금액·동기화 | P-U4-1~10 |
| U5 | D-day·타임라인·판정 묶기·캘린더·API | P-U5-1~13 |
| U6 | **RFC 8291 부록 A 시험 값**·VAPID 서명·발송 실행기·API | P-U6-1~10, 1,000대 시뮬레이션 |

## 실패했을 때

1. 출력의 실패 테스트 이름과 `Counterexample`(PBT) 확인
2. 출력된 seed로 `FC_SEED=<seed> npx vitest run <파일>` 재현
3. 코드를 고치고 다른 seed로 몇 번 더 실행
