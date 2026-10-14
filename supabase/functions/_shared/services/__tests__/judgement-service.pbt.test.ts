// 속성 기반 테스트 — 재계산 서비스 (멱등, 실패 격리, 상태 기반 PBT-06 / NFR-U2-22)
import { fc, test } from "@fast-check/vitest";
import { expect, it } from "vitest";
import type { HouseholdProfile } from "../../domain/profile.ts";
import { judgeNotice } from "../../eligibility/engine.ts";
import { createIncomeTable } from "../../eligibility/income-table.ts";
import { INCOME_THRESHOLDS } from "../../eligibility/reference-data.ts";
import type { NoticeForJudgement } from "../../eligibility/types.ts";
import { createKeyring, type Keyring } from "../../security/amount-cipher.ts";
import { encodeProfile } from "../../security/profile-codec.ts";
import { createJudgementService, toJudgementRow } from "../judgement-service.ts";
import { noticeArb, profileArb } from "../../__tests__/arbitraries/eligibility.ts";
import { testKey } from "../../__tests__/fixtures.ts";
import { createMemoryStore, type MemoryStore, memoryRepos } from "../../__tests__/memory-repos.ts";

const AS_OF = "2026-10-14";
const NOW = new Date("2026-10-14T00:00:00Z");
const REF = { incomeTable: createIncomeTable(INCOME_THRESHOLDS) };
const keyringPromise = createKeyring({ 1: testKey(3) }, 1);
const DEVICES = ["d1", "d2", "d3"] as const;

function build(store: MemoryStore, keyring: Keyring) {
  const repos = memoryRepos(store);
  return { repos, service: createJudgementService({ ...repos, keyring: async () => keyring, now: () => NOW }) };
}

/** 모델이 기대하는 판정: 현재 공고 전체를 현재 프로필로 다시 계산 */
function expected(deviceId: string, profile: HouseholdProfile, version: number, notices: NoticeForJudgement[]) {
  return notices
    .map((n) => toJudgementRow(deviceId, version, judgeNotice(profile, n, REF, AS_OF), NOW))
    .sort((a, b) => a.noticeId.localeCompare(b.noticeId));
}

const stored = (store: MemoryStore, deviceId: string) =>
  [...(store.judgements.get(deviceId)?.rows ?? [])].sort((a, b) => a.noticeId.localeCompare(b.noticeId));

test.prop([fc.uniqueArray(noticeArb, { selector: (n) => n.id, maxLength: 5 }), profileArb()])(
  "같은 입력으로 두 번 재계산하면 저장 결과가 같다 (멱등)",
  async (notices, profile) => {
    const keyring = await keyringPromise;
    const store = createMemoryStore({ notices, thresholds: [...INCOME_THRESHOLDS] });
    const { repos, service } = build(store, keyring);
    await repos.profiles.save("d1", await encodeProfile(profile, keyring));
    await service.recomputeAll(AS_OF);
    const first = structuredClone(store.judgements.get("d1"));
    await service.recomputeAll(AS_OF);
    expect(store.judgements.get("d1")).toEqual(first);
  },
);

test.prop([fc.uniqueArray(noticeArb, { selector: (n) => n.id, maxLength: 4 }), profileArb(), profileArb()])(
  "기기 하나의 복호화 실패가 다른 기기 결과를 바꾸지 않는다",
  async (notices, good, bad) => {
    const keyring = await keyringPromise;
    const store = createMemoryStore({ notices, thresholds: [...INCOME_THRESHOLDS] });
    const { repos, service } = build(store, keyring);
    await repos.profiles.save("good", await encodeProfile(good, keyring));
    await repos.profiles.save("bad", { ...(await encodeProfile(bad, keyring)), encTotalAsset: "v9.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA" });
    const summary = await service.recomputeAll(AS_OF);
    expect(summary.failed).toBe(1);
    expect(stored(store, "good")).toEqual(expected("good", good, 1, notices));
  },
);

// ---------- 상태 기반 테스트 (PBT-06) ----------

interface Model {
  profiles: Map<string, { profile: HouseholdProfile; version: number }>;
  notices: NoticeForJudgement[];
}
interface Real {
  store: MemoryStore;
  repos: ReturnType<typeof memoryRepos>;
  service: ReturnType<typeof createJudgementService>;
  keyring: Keyring;
}
type Cmd = fc.AsyncCommand<Model, Real>;

/** 저장된 판정은 항상 현재 프로필 버전 이하로 계산된 것이어야 한다 */
function checkVersionInvariant(m: Model, r: Real) {
  for (const [deviceId, saved] of r.store.judgements) {
    const current = m.profiles.get(deviceId)?.version;
    expect(current).toBeDefined();
    expect(saved.profileVersion).toBeLessThanOrEqual(current!);
  }
}

class SaveProfile implements Cmd {
  constructor(readonly deviceId: string, readonly profile: HouseholdProfile) {}
  check = () => true;
  async run(m: Model, r: Real) {
    const version = await r.repos.profiles.save(this.deviceId, await encodeProfile(this.profile, r.keyring));
    m.profiles.set(this.deviceId, { profile: this.profile, version });
    const { status } = await r.service.recomputeForDevice(this.deviceId, AS_OF);
    expect(status).toBe("saved");
    expect(stored(r.store, this.deviceId)).toEqual(expected(this.deviceId, this.profile, version, m.notices));
    checkVersionInvariant(m, r);
  }
  toString = () => `SaveProfile(${this.deviceId})`;
}

class AddNotice implements Cmd {
  constructor(readonly notice: NoticeForJudgement) {}
  check = (m: Readonly<Model>) => !m.notices.some((n) => n.id === this.notice.id);
  async run(m: Model, r: Real) {
    m.notices.push(this.notice);
    r.store.notices.push(this.notice);
    checkVersionInvariant(m, r);
  }
  toString = () => `AddNotice(${this.notice.id.slice(0, 8)})`;
}

class RemoveNotice implements Cmd {
  constructor(readonly index: number) {}
  check = (m: Readonly<Model>) => m.notices.length > 0;
  async run(m: Model, r: Real) {
    const i = this.index % m.notices.length;
    m.notices.splice(i, 1);
    r.store.notices.splice(i, 1);
    checkVersionInvariant(m, r);
  }
  toString = () => `RemoveNotice(${this.index})`;
}

class RecomputeAll implements Cmd {
  check = () => true;
  async run(m: Model, r: Real) {
    const summary = await r.service.recomputeAll(AS_OF);
    expect(summary).toMatchObject({ devices: m.profiles.size, succeeded: m.profiles.size, failed: 0, skippedStale: 0 });
    for (const [deviceId, { profile, version }] of m.profiles) {
      expect(stored(r.store, deviceId)).toEqual(expected(deviceId, profile, version, m.notices));
    }
  }
  toString = () => "RecomputeAll";
}

class StaleWrite implements Cmd {
  constructor(readonly deviceId: string) {}
  check = (m: Readonly<Model>) => (m.profiles.get(this.deviceId)?.version ?? 0) > 1;
  async run(m: Model, r: Real) {
    const before = structuredClone(r.store.judgements.get(this.deviceId));
    const outcome = await r.repos.judgements.replaceForDevice(this.deviceId, m.profiles.get(this.deviceId)!.version - 1, []);
    expect(outcome).toBe("stale");
    expect(r.store.judgements.get(this.deviceId)).toEqual(before);
  }
  toString = () => `StaleWrite(${this.deviceId})`;
}

const commandsArb = fc.commands(
  [
    fc.tuple(fc.constantFrom(...DEVICES), profileArb()).map(([d, p]) => new SaveProfile(d, p)),
    noticeArb.map((n) => new AddNotice(n)),
    fc.nat().map((i) => new RemoveNotice(i)),
    fc.constant(new RecomputeAll()),
    fc.constantFrom(...DEVICES).map((d) => new StaleWrite(d)),
  ],
  { maxCommands: 20 },
);

const baseRuns = Number(process.env.FC_NUM_RUNS ?? "100");

it("상태 기반: 저장·공고 변경·재계산·오래된 저장을 섞어도 저장된 판정 = 모델 (PBT-06)", async () => {
  const keyring = await keyringPromise;
  await fc.assert(
    fc.asyncProperty(commandsArb, async (cmds) => {
      const store = createMemoryStore({ thresholds: [...INCOME_THRESHOLDS] });
      const { repos, service } = build(store, keyring);
      await fc.asyncModelRun(() => ({ model: { profiles: new Map(), notices: [] }, real: { store, repos, service, keyring } }), cmds);
    }),
    { numRuns: Math.max(10, Math.floor(baseRuns / 2)) },
  );
}, 120_000);
