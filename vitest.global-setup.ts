// PBT seed를 실행 전체에서 한 번만 정하고 출력한다 — PBT-08
// FC_SEED가 없으면 새로 만들어 환경 변수에 넣고, 각 테스트 워커(vitest.setup.ts)가 같은 값을 읽는다.
// 재현: FC_SEED=<seed> npm test -- <파일>
export default function setup(): void {
  if (process.env.FC_SEED === undefined || process.env.FC_SEED === "") {
    process.env.FC_SEED = String((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  }
  process.env.FC_NUM_RUNS ??= "100";
  process.stdout.write(`\n[PBT] seed=${process.env.FC_SEED} numRuns=${process.env.FC_NUM_RUNS}\n`);
}
