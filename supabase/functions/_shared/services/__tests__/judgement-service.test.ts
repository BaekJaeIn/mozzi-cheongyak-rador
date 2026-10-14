// 예시 기반 테스트 — 재계산 서비스 (BR-U2-80~84, P-U2-R1~R3)
import { describe, expect, it } from "vitest";
import { createKeyring } from "../../security/amount-cipher.ts";
import { encodeProfile } from "../../security/profile-codec.ts";
import { INCOME_THRESHOLDS } from "../../eligibility/reference-data.ts";
import { createJudgementService } from "../judgement-service.ts";
import { makeNotice, makeProfile, makeUnit, testKey } from "../../__tests__/fixtures.ts";
import { createMemoryStore, memoryRepos } from "../../__tests__/memory-repos.ts";

async function setup() {
  const keyring = await createKeyring({ 1: testKey(1) }, 1);
  const store = createMemoryStore({
    notices: [makeNotice([makeUnit("happy_senior")], { id: "n1" }), makeNotice([makeUnit("private_sale_general", 84)], { id: "n2", tenure: "sale" })],
    thresholds: [...INCOME_THRESHOLDS],
  });
  const repos = memoryRepos(store);
  const service = createJudgementService({ ...repos, keyring: async () => keyring, now: () => new Date("2026-10-14T00:00:00Z") });
  const saveProfile = async (deviceId: string, overrides = {}) =>
    repos.profiles.save(deviceId, await encodeProfile(makeProfile(overrides), keyring));
  return { store, repos, service, keyring, saveProfile };
}

describe("recomputeForDevice", () => {
  it("프로필이 없으면 no_profile, 판정을 만들지 않는다 (BR-U2-84)", async () => {
    const { service, store } = await setup();
    await expect(service.recomputeForDevice("d1", "2026-10-14")).resolves.toMatchObject({ status: "no_profile" });
    expect(store.judgements.size).toBe(0);
  });

  it("모든 보관 공고를 판정해 저장 (BR-U2-80)", async () => {
    const { service, store, saveProfile } = await setup();
    await saveProfile("d1");
    const { status, counts } = await service.recomputeForDevice("d1", "2026-10-14");
    expect(status).toBe("saved");
    const saved = store.judgements.get("d1")!;
    expect(saved.rows.map((r) => r.noticeId).sort()).toEqual(["n1", "n2"]);
    expect(saved.profileVersion).toBe(1);
    expect(counts.eligible + counts.unknown + counts.ineligible).toBe(2);
  });
});

describe("recomputeAll", () => {
  it("기기 하나의 복호화 실패는 격리, 기존 판정 유지 (BR-U2-82)", async () => {
    const { service, store, saveProfile } = await setup();
    await saveProfile("good");
    await saveProfile("broken");
    await service.recomputeAll("2026-10-14");
    const before = store.judgements.get("broken");
    store.profiles.get("broken")!.encMonthlyIncome = "v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 위조
    const summary = await service.recomputeAll("2026-10-14");
    expect(summary).toMatchObject({ devices: 2, succeeded: 1, failed: 1, notices: 2 });
    expect(store.judgements.get("broken")).toBe(before);
  });

  it("같은 입력으로 두 번 계산하면 같은 판정 (멱등, NFR-U2-06)", async () => {
    const { service, store, saveProfile } = await setup();
    await saveProfile("d1");
    await service.recomputeAll("2026-10-14");
    const first = structuredClone(store.judgements.get("d1"));
    await service.recomputeAll("2026-10-14");
    expect(store.judgements.get("d1")).toEqual(first);
  });
});

describe("프로필 버전 확인 (P-U2-R3)", () => {
  it("옛 버전으로 계산한 저장은 stale로 건너뛴다", async () => {
    const { repos, store, saveProfile } = await setup();
    await saveProfile("d1"); // v1
    await saveProfile("d1", { money: { monthlyIncome: 100 } }); // v2
    await expect(repos.judgements.replaceForDevice("d1", 1, [])).resolves.toBe("stale");
    expect(store.judgements.has("d1")).toBe(false);
    await expect(repos.judgements.replaceForDevice("d1", 2, [])).resolves.toBe("saved");
  });
});
