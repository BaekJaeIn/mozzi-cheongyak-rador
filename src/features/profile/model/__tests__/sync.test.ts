// 예시 기반 테스트 — 동기화 대기열 (domain-entities §4, BR-U4-62~69)
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import { describe, expect, it } from "vitest";
import { toProfile } from "../convert";
import { commitNotify, commitProfile, loadStoredNotify, loadStoredProfile } from "../storage";
import { type ApiOutcome, createProfileSync, type SyncApi } from "../sync";
import { memoryStorage, MINIMAL_ANSWERS, MOTHER_ANSWERS } from "./helpers";

const T0 = new Date("2026-10-15T00:00:00Z");

function fakeApi(responses: ApiOutcome[] = []) {
  const sent: { kind: "profile" | "notify"; value: unknown }[] = [];
  let hook: (() => void) | null = null;
  const next = async (): Promise<ApiOutcome> => {
    hook?.();
    hook = null;
    return responses.shift() ?? { ok: true };
  };
  const api: SyncApi = {
    putProfile: async (p) => {
      sent.push({ kind: "profile", value: p });
      return next();
    },
    putNotify: async (n) => {
      sent.push({ kind: "notify", value: n });
      return next();
    },
  };
  return { api, sent, onNextSend: (f: () => void) => (hook = f) };
}

describe("ProfileSync", () => {
  it("대기 없음 → 아무것도 보내지 않는다", async () => {
    const { api, sent } = fakeApi();
    expect(await createProfileSync({ storage: memoryStorage(), api }).flush()).toEqual({ profile: "nothing", notify: "nothing" });
    expect(sent).toEqual([]);
  });

  it("성공 → synced", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    const { api, sent } = fakeApi();
    expect((await createProfileSync({ storage, api, now: () => T0 }).flush()).profile).toBe("synced");
    expect(sent).toHaveLength(1);
    expect(loadStoredProfile(storage)?.sync).toEqual({ state: "synced", at: T0.toISOString() });
  });

  it("오프라인(0·5xx) → pending 유지, 시도 수 증가, 다음 flush에서 다시 보낸다", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    const { api, sent } = fakeApi([{ ok: false, status: 0 }, { ok: false, status: 503 }]);
    const sync = createProfileSync({ storage, api, now: () => T0 });
    expect((await sync.flush()).profile).toBe("offline");
    expect((await sync.flush()).profile).toBe("offline");
    expect(loadStoredProfile(storage)?.sync).toMatchObject({ state: "pending", attempts: 2 });
    expect((await sync.flush()).profile).toBe("synced");
    expect(sent).toHaveLength(3);
  });

  it("400 → failed, 다시 보내지 않는다. 새로 저장하면 다시 보낸다", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    const { api, sent } = fakeApi([{ ok: false, status: 400 }]);
    const sync = createProfileSync({ storage, api });
    expect((await sync.flush()).profile).toBe("rejected");
    expect((await sync.flush()).profile).toBe("nothing");
    expect(loadStoredProfile(storage)?.sync).toEqual({ state: "failed", code: "BAD_REQUEST" });
    commitProfile(storage, toProfile(MINIMAL_ANSWERS), new Date("2026-10-15T01:00:00Z"));
    expect((await sync.flush()).profile).toBe("synced");
    expect(sent).toHaveLength(2);
  });

  it("보내는 중에 새로 저장되면 끝난 뒤 최신 값을 한 번 더 보낸다 (마지막 저장이 이김)", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    const { api, sent, onNextSend } = fakeApi();
    onNextSend(() => commitProfile(storage, toProfile(MINIMAL_ANSWERS), new Date("2026-10-15T00:00:01Z")));
    expect((await createProfileSync({ storage, api }).flush()).profile).toBe("synced");
    expect(sent).toHaveLength(2);
    expect((sent[1]!.value as HouseholdProfile).residence.sido).toBe("부산");
    expect(loadStoredProfile(storage)?.sync.state).toBe("synced");
  });

  it("동시에 부르면 한 번만 보낸다", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    const { api, sent } = fakeApi();
    const sync = createProfileSync({ storage, api });
    await Promise.all([sync.flush(), sync.flush(), sync.flush()]);
    expect(sent).toHaveLength(1);
  });

  it("알림 설정도 같은 방식, 기본값(저장 없음)은 보내지 않는다", async () => {
    const storage = memoryStorage();
    const { api, sent } = fakeApi();
    const sync = createProfileSync({ storage, api });
    expect((await sync.flush()).notify).toBe("nothing");
    commitNotify(storage, { hour: 20, enabled: false }, T0);
    expect((await sync.flush()).notify).toBe("synced");
    expect(sent).toEqual([{ kind: "notify", value: { hour: 20, enabled: false } }]);
    expect(loadStoredNotify(storage)?.sync.state).toBe("synced");
  });

  it("기기 재등록 → 프로필·알림 설정을 다시 보낸다 (BR-U4-67)", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), T0);
    commitNotify(storage, { hour: 7, enabled: true }, T0);
    const { api, sent } = fakeApi();
    const sync = createProfileSync({ storage, api });
    await sync.flush();
    sync.markAllPending();
    await sync.flush();
    expect(sent.map((s) => s.kind)).toEqual(["profile", "notify", "profile", "notify"]);
  });
});
