// 변경 3 U6 API 예시 — PUT /api/bookmarks, 알림 설정 deadlineEnabled (BR-U6-D1·D4·D5·D41)
import { describe, expect, it } from "vitest";
import { createRouteGuard } from "../../auth/route-guard";
import { createMemoryDevices, request, seedDevice } from "../../__tests__/helpers";
import { BOOKMARKS_MAX_BODY_BYTES, createBookmarksHandler, validateBookmarkIds } from "../bookmarks";
import { createNotifySettingsHandler, NOTIFY_MAX_BODY_BYTES } from "../profile-settings";

const NOW = new Date("2026-10-20T03:00:00Z");
const ID = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup() {
  const devices = createMemoryDevices();
  const credentials = await seedDevice(devices, NOW);
  const logs: string[] = [];
  const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), (line) => void logs.push(line));
  const server = new Map<string, string[]>();
  const bookmarks = withDevice(
    createBookmarksHandler(async (deviceId, ids) => {
      server.set(deviceId, [...ids]);
      return ids.length;
    }),
    { route: "PUT /api/bookmarks", maxBodyBytes: BOOKMARKS_MAX_BODY_BYTES },
  );
  const notify = withDevice(createNotifySettingsHandler(() => devices), { route: "PUT /api/notify-settings", maxBodyBytes: NOTIFY_MAX_BODY_BYTES });
  return { devices, credentials, logs, server, bookmarks, notify };
}

describe("PUT /api/bookmarks", () => {
  it("목록을 통째로 바꾸고 개수만 돌려준다, 로그에 공고 ID 없음", async () => {
    const t = await setup();
    const res = await t.bookmarks(request("PUT", { body: JSON.stringify({ ids: [ID(1), ID(2)] }), credentials: t.credentials }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 2 });
    expect(t.server.get(t.credentials.deviceId)).toEqual([ID(1), ID(2)]);
    expect(t.logs.join("\n")).not.toContain(ID(1));
  });

  it("인증 없으면 401", async () => {
    const t = await setup();
    const res = await t.bookmarks(request("PUT", { body: JSON.stringify({ ids: [] }) }));
    expect(res.status).toBe(401);
  });

  it("형식 검사: uuid·중복·100개·다른 키 (BR-U6-D5)", () => {
    expect(validateBookmarkIds({ ids: [] })).toEqual([]);
    expect(validateBookmarkIds({ ids: [ID(1).toUpperCase()] })).toEqual([ID(1)]);
    expect(validateBookmarkIds({ ids: ["x"] })).toBeNull();
    expect(validateBookmarkIds({ ids: [ID(1), ID(1)] })).toBeNull();
    expect(validateBookmarkIds({ ids: Array.from({ length: 101 }, (_, i) => ID(i)) })).toBeNull();
    expect(validateBookmarkIds({ ids: [], extra: 1 })).toBeNull();
    expect(validateBookmarkIds([ID(1)])).toBeNull();
  });

  it("틀린 형식은 400", async () => {
    const t = await setup();
    const res = await t.bookmarks(request("PUT", { body: JSON.stringify({ ids: ["x"] }), credentials: t.credentials }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/notify-settings — 마감 알림 (BR-U6-D41)", () => {
  it("deadlineEnabled는 선택: 있으면 저장, 없으면 그대로 (옛 앱)", async () => {
    const t = await setup();
    const id = t.credentials.deviceId;
    const on = await t.notify(request("PUT", { body: JSON.stringify({ hour: 9, enabled: true, deadlineEnabled: false }), credentials: t.credentials }));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ hour: 9, enabled: true, deadlineEnabled: false });
    expect(t.devices.notify.get(id)).toEqual({ hour: 9, enabled: true, deadlineEnabled: false });
    const old = await t.notify(request("PUT", { body: JSON.stringify({ hour: 8, enabled: true }), credentials: t.credentials }));
    expect(old.status).toBe(200);
    expect(t.devices.notify.get(id)).toEqual({ hour: 8, enabled: true });
  });

  it("deadlineEnabled가 불이 아니거나 모르는 키면 400", async () => {
    const t = await setup();
    for (const body of [{ hour: 9, enabled: true, deadlineEnabled: "yes" }, { hour: 9, enabled: true, other: 1 }]) {
      const res = await t.notify(request("PUT", { body: JSON.stringify(body), credentials: t.credentials }));
      expect(res.status).toBe(400);
    }
  });
});
