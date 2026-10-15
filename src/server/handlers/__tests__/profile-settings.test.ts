// 예시 기반 테스트 — U4 API (BR-U4-100~104)
import type { ProfileRepository } from "@shared/db/repositories.ts";
import { testKey } from "@shared/__tests__/fixtures.ts";
import { createKeyring } from "@shared/security/amount-cipher.ts";
import { decodeProfile, type ProfileStorageFields } from "@shared/security/profile-codec.ts";
import { describe, expect, it } from "vitest";
import { toProfile } from "@/features/profile/model/convert";
import { MOTHER_ANSWERS } from "@/features/profile/model/__tests__/helpers";
import { createRouteGuard } from "../../auth/route-guard";
import { createMemoryDevices, request, seedDevice } from "../../__tests__/helpers";
import {
  createDeleteDeviceHandler,
  createNotifySettingsHandler,
  createSaveProfileHandler,
  NOTIFY_MAX_BODY_BYTES,
  PROFILE_MAX_BODY_BYTES,
} from "../profile-settings";

const NOW = new Date("2026-10-15T03:00:00Z");
const PROFILE = toProfile(MOTHER_ANSWERS);

async function setup(options: { recomputeFails?: boolean } = {}) {
  const devices = createMemoryDevices();
  const credentials = await seedDevice(devices, NOW);
  const logs: string[] = [];
  const sink = (line: string) => void logs.push(line);
  const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), sink);
  const saved: { deviceId: string; fields: ProfileStorageFields }[] = [];
  const recomputed: { deviceId: string; asOf: string }[] = [];
  const profiles: ProfileRepository = {
    async save(deviceId, fields) {
      saved.push({ deviceId, fields });
      return saved.length;
    },
    get: async () => null,
    listDeviceIdsWithProfile: async () => [],
  };
  const keyring = await createKeyring({ 1: testKey(3) }, 1);

  const saveProfile = withDevice(
    createSaveProfileHandler({
      profiles: () => profiles,
      keyring: async () => keyring,
      activeDistrictIds: async () => ["wangsuk", "gyosan", "changneung", "daejang", "gyeyang", "gwangmyeong_siheung"],
      recompute: async (deviceId, asOf) => {
        if (options.recomputeFails) throw new Error("db down");
        recomputed.push({ deviceId, asOf });
      },
      now: () => NOW,
    }),
    { route: "PUT /api/profile", maxBodyBytes: PROFILE_MAX_BODY_BYTES },
  );
  const notify = withDevice(createNotifySettingsHandler(() => devices), { route: "PUT /api/notify-settings", maxBodyBytes: NOTIFY_MAX_BODY_BYTES });
  const del = withDevice(createDeleteDeviceHandler(() => devices), { route: "DELETE /api/device" });
  return { devices, credentials, logs, saved, recomputed, keyring, saveProfile, notify, del };
}

describe("PUT /api/profile", () => {
  it("200 { savedAt, profileVersion }, 금액은 암호화해 저장, 이 기기 판정 재계산 (오늘 KST)", async () => {
    const t = await setup();
    const res = await t.saveProfile(request("PUT", { body: JSON.stringify(PROFILE), credentials: t.credentials }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedAt: NOW.toISOString(), profileVersion: 1 });

    const { fields } = t.saved[0]!;
    expect(JSON.stringify(fields.data)).not.toContain("monthlyIncome");
    expect(fields.encMonthlyIncome).not.toContain("450");
    expect(await decodeProfile(fields, t.keyring)).toEqual(PROFILE);
    expect(t.recomputed).toEqual([{ deviceId: t.credentials.deviceId, asOf: "2026-10-15" }]);
  });

  it("형식이 틀리면 400, 로그에는 틀린 항목 이름만", async () => {
    const t = await setup();
    const bad = { ...PROFILE, money: { ...PROFILE.money, monthlyIncome: -1 } };
    const res = await t.saveProfile(request("PUT", { body: JSON.stringify(bad), credentials: t.credentials }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(t.saved).toEqual([]);
    const warn = t.logs.find((l) => l.includes("profile.invalid"))!;
    expect(JSON.parse(warn).fields).toEqual(["money"]);
  });

  it("모르는 지구 ID면 400", async () => {
    const t = await setup();
    const bad = { ...PROFILE, prefs: { ...PROFILE.prefs, districtIds: ["gyosan", "nowhere"] } };
    const res = await t.saveProfile(request("PUT", { body: JSON.stringify(bad), credentials: t.credentials }));
    expect(res.status).toBe(400);
  });

  it("JSON이 아니면 400, 16KB 초과면 413, 인증 없으면 401", async () => {
    const t = await setup();
    expect((await t.saveProfile(request("PUT", { body: "{", credentials: t.credentials }))).status).toBe(400);
    const big = JSON.stringify({ ...PROFILE, pad: "x".repeat(PROFILE_MAX_BODY_BYTES) });
    expect((await t.saveProfile(request("PUT", { body: big, credentials: t.credentials }))).status).toBe(413);
    expect((await t.saveProfile(request("PUT", { body: JSON.stringify(PROFILE) }))).status).toBe(401);
  });

  it("재계산이 실패해도 저장은 200 (BR-U4-68·104)", async () => {
    const t = await setup({ recomputeFails: true });
    const res = await t.saveProfile(request("PUT", { body: JSON.stringify(PROFILE), credentials: t.credentials }));
    expect(res.status).toBe(200);
    expect(t.logs.some((l) => l.includes("recompute.device.failed"))).toBe(true);
  });

  it("로그에 프로필 내용·금액이 없다 (BR-U4-103)", async () => {
    const t = await setup();
    await t.saveProfile(request("PUT", { body: JSON.stringify(PROFILE), credentials: t.credentials }));
    const all = t.logs.join("\n");
    for (const secret of ["1963-07-01", "하남시", "\"450\"", "20000", "monthlyIncome"]) expect(all).not.toContain(secret);
  });
});

describe("PUT /api/notify-settings", () => {
  it("200, 저장된다", async () => {
    const t = await setup();
    const res = await t.notify(request("PUT", { body: JSON.stringify({ hour: 20, enabled: false }), credentials: t.credentials }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hour: 20, enabled: false });
    expect(t.devices.notify.get(t.credentials.deviceId)).toEqual({ hour: 20, enabled: false });
  });

  for (const body of [{ hour: 24, enabled: true }, { hour: 9.5, enabled: true }, { hour: "9", enabled: true }, { hour: 9 }, { hour: 9, enabled: true, x: 1 }, [9, true]]) {
    it(`형식이 틀리면 400: ${JSON.stringify(body)}`, async () => {
      const t = await setup();
      const res = await t.notify(request("PUT", { body: JSON.stringify(body), credentials: t.credentials }));
      expect(res.status).toBe(400);
      expect(t.devices.notify.size).toBe(0);
    });
  }
});

describe("DELETE /api/device", () => {
  it("204, 기기와 알림 설정이 지워진다. 다시 부르면 401 DEVICE_UNKNOWN", async () => {
    const t = await setup();
    await t.notify(request("PUT", { body: JSON.stringify({ hour: 7, enabled: true }), credentials: t.credentials }));
    const res = await t.del(request("DELETE", { credentials: t.credentials }));
    expect(res.status).toBe(204);
    expect(t.devices.records.has(t.credentials.deviceId)).toBe(false);
    expect(t.devices.notify.size).toBe(0);
    const again = await t.del(request("DELETE", { credentials: t.credentials }));
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ code: "DEVICE_UNKNOWN" });
  });
});
