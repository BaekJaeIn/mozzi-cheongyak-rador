// 변경 3 U6 — 관심 공고 ID 동기화 (domain-entities §8.5, BR-U6-D1~D3, P-U6-D5)
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { memoryStorage } from "@/features/profile/model/__tests__/helpers";
import { toProfile } from "@/features/profile/model/convert";
import { MOTHER_ANSWERS } from "@/features/profile/model/__tests__/helpers";
import { BOOKMARKS_SYNC_KEY, clearAllPersonal, commitProfile } from "@/features/profile/model/storage";
import { type ApiOutcome, createProfileSync, type SyncApi } from "@/features/profile/model/sync";
import { createBookmarkStore } from "../store";
import { INITIAL_STAMP, loadBookmarkChannel, loadBookmarkSync, markBookmarksPending } from "../sync";

const SNAP = { title: "공고", complexName: null, districts: [], applyStart: null, applyEnd: "2026-10-21", supplyTypes: [] };
const NOW = new Date("2026-10-20T00:00:00Z");

function api(outcomes: ApiOutcome[] = []) {
  const sent: string[][] = [];
  const server: { ids: string[] } = { ids: [] };
  const value: SyncApi = {
    putProfile: async () => ({ ok: true }),
    putNotify: async () => ({ ok: true }),
    putBookmarks: async (ids) => {
      sent.push([...ids]);
      const o = outcomes.shift() ?? { ok: true };
      if (o.ok) server.ids = [...ids];
      return o;
    },
  };
  return { value, sent, server };
}

describe("관심 공고 동기화", () => {
  it("기록이 없고 별표도 없으면 보내지 않는다", async () => {
    const storage = memoryStorage();
    const a = api();
    await createProfileSync({ storage, api: a.value }).flush();
    expect(a.sent).toEqual([]);
    expect(loadBookmarkChannel(storage, NOW)).toBeNull();
  });

  it("업데이트 뒤 처음: 기존 별표를 한 번 보내고 synced (BR-U6-D3)", async () => {
    const storage = memoryStorage();
    createBookmarkStore(storage).toggle("n1", SNAP, NOW);
    expect(loadBookmarkChannel(storage, NOW)).toMatchObject({ value: ["n1"], stamp: INITIAL_STAMP, sync: { state: "pending" } });
    const a = api();
    const sync = createProfileSync({ storage, api: a.value });
    expect((await sync.flush()).bookmarks).toBe("synced");
    expect(a.sent).toEqual([["n1"]]);
    expect(loadBookmarkSync(storage)?.sync.state).toBe("synced");
    await sync.flush();
    expect(a.sent).toHaveLength(1);
  });

  it("실패는 pending으로 남고 다음에 다시 보낸다 (BR-U6-D2)", async () => {
    const storage = memoryStorage();
    createBookmarkStore(storage).toggle("n1", SNAP, NOW);
    markBookmarksPending(storage, NOW);
    const a = api([{ ok: false, status: 0 }]);
    const sync = createProfileSync({ storage, api: a.value });
    expect((await sync.flush()).bookmarks).toBe("offline");
    expect(loadBookmarkSync(storage)?.sync.state).toBe("pending");
    expect((await sync.flush()).bookmarks).toBe("synced");
    expect(a.server.ids).toEqual(["n1"]);
  });

  it("기기 재등록이면 다시 보낸다, 모두 지우기는 동기화 상태도 지운다", async () => {
    const storage = memoryStorage();
    createBookmarkStore(storage).toggle("n1", SNAP, NOW);
    const a = api();
    const sync = createProfileSync({ storage, api: a.value });
    await sync.flush();
    sync.markAllPending();
    await sync.flush();
    expect(a.sent).toHaveLength(2);
    clearAllPersonal(storage);
    expect(storage.getItem(BOOKMARKS_SYNC_KEY)).toBeNull();
  });
});

describe("보내는 중에 다시 부르기 (피드 no_profile 복구, 2026-10-20 E2E에서 찾음)", () => {
  it("관심 공고를 보내는 중에 모두 다시 보내기로 표시하고 flush를 부르면, 끝난 뒤 한 번 더 돌아 프로필도 보낸다", async () => {
    const storage = memoryStorage();
    commitProfile(storage, toProfile(MOTHER_ANSWERS), NOW);
    const sent: string[] = [];
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const inBookmarks = new Promise<void>((r) => (entered = r));
    let first = true;
    const api: SyncApi = {
      putProfile: async () => (sent.push("profile"), { ok: true }),
      putNotify: async () => ({ ok: true }),
      putBookmarks: async () => {
        sent.push("bookmarks");
        if (first) {
          first = false;
          const wait = new Promise<void>((r) => (release = r));
          entered();
          await wait;
        }
        return { ok: true };
      },
    };
    const sync = createProfileSync({ storage, api });
    await sync.flush(); // 프로필 보냄
    createBookmarkStore(storage).toggle("n1", SNAP, NOW);
    const running = sync.flush(); // 관심 공고 처음 보내기 — 멈춰 있음
    await inBookmarks;
    sync.markAllPending(); // 피드가 no_profile을 받아 모두 다시 보내기
    const again = sync.flush();
    release();
    await running;
    await again;
    expect(sent.filter((x) => x === "profile")).toHaveLength(2);
  });
});

const opArb = fc.oneof(
  fc.record({ kind: fc.constant("toggle" as const), id: fc.constantFrom("n1", "n2", "n3", "n4") }),
  fc.record({ kind: fc.constant("flush" as const), ok: fc.boolean() }),
);

test.prop([fc.array(opArb, { maxLength: 30 })])("P-U6-D5 어떤 별표·해제·실패 순서 뒤에도 마지막 성공 보내기 뒤 서버 목록 = 기기 목록", async (ops) => {
  const storage = memoryStorage();
  const outcomes: ApiOutcome[] = [];
  const a = api(outcomes);
  const sync = createProfileSync({ storage, api: a.value });
  const store = createBookmarkStore(storage);
  for (const op of ops) {
    if (op.kind === "toggle") {
      store.toggle(op.id, SNAP, NOW);
      markBookmarksPending(storage, new Date(NOW.getTime() + ops.indexOf(op)));
    } else {
      outcomes.push(op.ok ? { ok: true } : { ok: false, status: 0 });
      await sync.flush();
      outcomes.length = 0;
    }
  }
  await sync.flush(); // 마지막은 성공
  const device = store.list().map((b) => b.id).sort();
  expect([...a.server.ids].sort()).toEqual(loadBookmarkChannel(storage, NOW) === null ? [] : device);
});
