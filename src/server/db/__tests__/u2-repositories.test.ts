// 예시 기반 테스트 — U2 Node Repository (조회 형태, 행 변환, 페이지 나눔, RPC 결과)
import { describe, expect, it } from "vitest";
import { createJudgementRepository } from "../judgement-repository";
import { createNoticeRepository } from "../notice-repository";
import { createProfileRepository } from "../profile-repository";
import { createReferenceRepository } from "../reference-repository";
import { createFakeDb } from "./fake-db";

const DEVICE = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

describe("ProfileRepository", () => {
  it("save는 RPC에 snake_case 프로필을 넘기고 새 버전을 돌려준다", async () => {
    const { db, calls } = createFakeDb(() => ({ data: 3, error: null }));
    const version = await createProfileRepository(db).save(DEVICE, {
      schemaVersion: 1,
      data: { a: 1 },
      encMonthlyIncome: "v1.x.y",
      encTotalAsset: null,
      encCarValue: null,
    });
    expect(version).toBe(3);
    expect(calls[0]).toMatchObject({
      name: "save_device_profile",
      args: { p_device_id: DEVICE, p_profile: { schema_version: 1, data: { a: 1 }, enc_monthly_income: "v1.x.y", enc_total_asset: null } },
    });
  });

  it("get은 행을 StoredProfile로 바꾼다", async () => {
    const { db } = createFakeDb(() => ({
      data: {
        device_id: DEVICE,
        schema_version: 1,
        data: {},
        enc_monthly_income: null,
        enc_total_asset: null,
        enc_car_value: null,
        profile_version: 2,
        updated_at: "2026-10-14T00:00:00.000Z",
      },
      error: null,
    }));
    expect(await createProfileRepository(db).get(DEVICE)).toMatchObject({ deviceId: DEVICE, profileVersion: 2 });
  });

  it("listDeviceIdsWithProfile은 1,000행씩 끝까지 읽는다", async () => {
    let page = 0;
    const { db, calls } = createFakeDb(() => {
      page += 1;
      const count = page === 1 ? 1000 : 3;
      return { data: Array.from({ length: count }, (_, i) => ({ device_id: `d${page}-${i}` })), error: null };
    });
    const ids = await createProfileRepository(db).listDeviceIdsWithProfile();
    expect(ids).toHaveLength(1003);
    expect(calls.map((c) => c.chain.find((x) => x.method === "range")?.args)).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe("NoticeRepository.listRetainedWithUnits", () => {
  it("공고 + 주택형 + 지구를 판정 입력으로 바꾸고, 깨진 요건은 분류 실패로", async () => {
    const { db, calls } = createFakeDb(() => ({
      data: [
        {
          id: "n1",
          tenure: "rent",
          announced_at: "2026-09-15",
          apply_start: null,
          apply_end: "2026-09-30",
          housing_units: [
            { id: "u1", supply_type: "happy_senior", exclusive_area_m2: "36.50", requirements: { homeless: { minYears: null } } },
            { id: "u2", supply_type: "happy_senior", exclusive_area_m2: null, requirements: { age: "sixty-five" } },
          ],
          notice_districts: [{ district_id: "gyosan" }],
        },
      ],
      error: null,
    }));
    const [notice] = await createNoticeRepository(db).listRetainedWithUnits();
    expect(notice).toEqual({
      id: "n1",
      tenure: "rent",
      announcedAt: "2026-09-15",
      applyStart: null,
      applyEnd: "2026-09-30",
      districtIds: ["gyosan"],
      units: [
        { id: "u1", supplyType: "happy_senior", exclusiveAreaM2: 36.5, requirements: { homeless: { minYears: null } } },
        { id: "u2", supplyType: "happy_senior", exclusiveAreaM2: null, requirements: { unclassified: true } },
      ],
    });
    expect(String(calls[0]?.chain[0]?.args[0])).toContain("housing_units(");
  });
});

describe("ReferenceDataRepository.loadIncomeThresholds", () => {
  it("bigint 문자열도 숫자로", async () => {
    const { db } = createFakeDb(() => ({
      data: [{ year: 2026, basis: "urban_worker", household_size: 2, amount_won: "5866270" }],
      error: null,
    }));
    expect(await createReferenceRepository(db).loadIncomeThresholds()).toEqual([
      { year: 2026, basis: "urban_worker", householdSize: 2, amountWon: 5_866_270 },
    ]);
  });
});

describe("JudgementRepository.replaceForDevice", () => {
  const judgement = {
    deviceId: DEVICE,
    noticeId: "n1",
    verdict: "eligible" as const,
    inDistrict: true,
    score: 2,
    detail: {},
    profileVersion: 2,
    computedAt: new Date("2026-10-14T00:00:00.000Z"),
  };

  it("행에서 기기 ID·버전을 빼고 버전은 따로 넘긴다", async () => {
    const { db, calls } = createFakeDb(() => ({ data: 1, error: null }));
    await expect(createJudgementRepository(db).replaceForDevice(DEVICE, 2, [judgement])).resolves.toBe("saved");
    expect(calls[0]?.args).toEqual({
      p_device_id: DEVICE,
      p_profile_version: 2,
      p_rows: [{ notice_id: "n1", verdict: "eligible", in_district: true, score: 2, detail: {}, computed_at: "2026-10-14T00:00:00.000Z" }],
    });
  });

  it("RPC가 -1이면 stale", async () => {
    const { db } = createFakeDb(() => ({ data: -1, error: null }));
    await expect(createJudgementRepository(db).replaceForDevice(DEVICE, 1, [])).resolves.toBe("stale");
  });
});
