// 속성 기반 테스트(fast-check) 워커 설정 — PBT-08
// seed와 실행 횟수는 vitest.global-setup.ts가 정해 환경 변수로 넘긴다.
// shrinking은 fast-check 기본값(켜짐)을 그대로 쓴다.
import fc from "fast-check";

const seed = Number(process.env.FC_SEED);
const numRuns = Number(process.env.FC_NUM_RUNS ?? "100");

if (!Number.isInteger(seed)) {
  throw new Error(`FC_SEED must be an integer, got: ${process.env.FC_SEED}`);
}

fc.configureGlobal({ seed, numRuns });
