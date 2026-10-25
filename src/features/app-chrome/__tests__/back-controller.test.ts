// 뒤로 버튼 상태 기계 — 시나리오 S1~S6 (U5 business-logic-model §12.1) + 속성 P-U5-E1~E4 (§12.2)
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { type BackAction, type BackEvent, type BackState, INITIAL_BACK_STATE, step } from "../back-controller";
import type { BackTarget } from "../back-target";

const GO_LIST: BackTarget = { kind: "go", href: "/" };
const EXIT: BackTarget = { kind: "exit" };
const back = (via: "watcher" | "history", target: BackTarget, overlay = false, sticky = false): BackEvent => ({ kind: "back", via, target, overlay, sticky });
const timeout = (sticky = false): BackEvent => ({ kind: "exitTimeout", sticky });

function play(events: BackEvent[], from: BackState = INITIAL_BACK_STATE): { state: BackState; actions: BackAction[][] } {
  let state = from;
  const actions: BackAction[][] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    actions.push(r.actions);
  }
  return { state, actions };
}
const kinds = (a: BackAction[]) => a.map((x) => x.kind);
/** 지금 상태에서 뒤로 버튼이 들어올 길 — 감시가 켜져 있으면 감시가 먼저 받는다 */
const viaOf = (s: BackState): "watcher" | "history" | null => (s.watcher ? "watcher" : s.guard ? "history" : null);

describe("시나리오 (BR-U5-E10~E23)", () => {
  it("S1 CloseWatcher 있음: 열기 → 터치 → 상세에서 뒤로 → 목록, 감시는 바로 다시 켬", () => {
    const { state, actions } = play([{ kind: "start", watcherSupported: true }, { kind: "gesture" }, back("watcher", GO_LIST)]);
    expect(kinds(actions[0]!)).toEqual(["armWatcher"]);
    expect(kinds(actions[1]!)).toEqual(["pushGuard"]);
    expect(actions[2]).toEqual([{ kind: "navigate", href: "/" }, { kind: "armWatcher" }]);
    expect(state).toMatchObject({ watcher: true, guard: true });
  });

  it("S2 CloseWatcher 없음: 앱을 열 때는 지킴이를 넣지 않고, 터치 때 넣는다 → 상세에서 뒤로(방문 기록) → 목록", () => {
    const { state, actions } = play([{ kind: "start", watcherSupported: false }, { kind: "gesture" }, back("history", GO_LIST)]);
    expect(actions[0]).toEqual([]);
    expect(kinds(actions[1]!)).toEqual(["pushGuard"]);
    expect(actions[2]).toEqual([{ kind: "navigate", href: "/" }]);
    expect(state).toMatchObject({ guard: false, watcher: false }); // 다음 터치 때 다시 넣는다
    expect(kinds(step(state, { kind: "gesture" }).actions)).toEqual(["pushGuard"]);
  });

  it("S3 맞춤 공고에서 뒤로 → 안내 → 3초 안에는 받는 것이 없다 (남은 지킴이는 조용히 뺀다)", () => {
    const { state, actions } = play([{ kind: "start", watcherSupported: true }, { kind: "gesture" }, back("watcher", EXIT)]);
    expect(kinds(actions[2]!)).toEqual(["showExitHint", "startExitTimer", "silentHistoryBack"]);
    expect(state).toMatchObject({ exiting: true, watcher: false, guard: false, ignoreNextPop: true });
    // 조용히 뺀 칸의 popstate는 처리하지 않는다
    const popped = step(state, back("history", EXIT));
    expect(popped.actions).toEqual([]);
    expect(viaOf(popped.state)).toBeNull(); // 두 번째 뒤로 = 브라우저가 앱을 닫는다
    expect(step(popped.state, { kind: "gesture" }).actions).toEqual([]); // 안내 중 터치해도 지킴이를 넣지 않는다
  });

  it("S3' 방문 기록으로 받은 경우: 감시를 끄고 안내", () => {
    const { state, actions } = play([{ kind: "start", watcherSupported: true }, { kind: "gesture" }, timeout()]);
    expect(actions[2]).toEqual([]); // 이미 켜져 있으면 다시 켜지 않는다
    const r = step({ ...state, watcher: true, guard: true }, back("history", EXIT));
    expect(kinds(r.actions)).toEqual(["showExitHint", "startExitTimer", "disarmWatcher"]);
    expect(viaOf(r.state)).toBeNull();
  });

  it("S4 3초가 지나면 감시를 켜고, 터치하면 지킴이 → 다시 안내", () => {
    const { state, actions } = play([
      { kind: "start", watcherSupported: true },
      back("watcher", EXIT),
      timeout(),
      { kind: "gesture" },
      back("watcher", EXIT),
    ]);
    expect(kinds(actions[2]!)).toEqual(["armWatcher"]);
    expect(kinds(actions[3]!)).toEqual(["pushGuard"]);
    expect(kinds(actions[4]!)).toEqual(["showExitHint", "startExitTimer", "silentHistoryBack"]);
    expect(state.exiting).toBe(true);
  });

  it("S5 알림으로 상세를 바로 열고 조작 없이 뒤로 → CloseWatcher가 받아 맞춤 공고", () => {
    const { actions } = play([{ kind: "start", watcherSupported: true }, back("watcher", GO_LIST)]);
    expect(actions[1]).toEqual([{ kind: "navigate", href: "/" }, { kind: "armWatcher" }]);
  });

  it("S7 한 번이라도 조작한 페이지: 처리 직후 지킴이를 바로 넣는다 — 설정 → 뒤로 → (터치 없이) 뒤로 = 안내", () => {
    const { state, actions } = play([{ kind: "start", watcherSupported: false }, { kind: "gesture" }, back("history", GO_LIST, false, true)]);
    expect(actions[2]).toEqual([{ kind: "pushGuard" }, { kind: "navigate", href: "/" }]); // 이동 전에 넣어 새 칸이 이동한 화면이 된다
    expect(state.guard).toBe(true);
    const exit = step(state, back("history", EXIT, false, true));
    expect(kinds(exit.actions)).toEqual(["showExitHint", "startExitTimer"]);
    expect(viaOf(exit.state)).toBeNull();
    const after = step(exit.state, timeout(true));
    expect(after.actions).toEqual([{ kind: "pushGuard" }]); // 3초 뒤 바로 다시 받을 준비 (E22)
  });

  it("S6 창이 떠 있으면 창만 닫는다 (갈 곳·종료보다 먼저)", () => {
    const { actions } = play([{ kind: "start", watcherSupported: false }, { kind: "gesture" }, back("history", EXIT, true)]);
    expect(actions[2]).toEqual([{ kind: "closeOverlay" }]);
  });
});

// ---------- 속성 (P-U5-E1~E4) ----------
const targetArb = fc.constantFrom<BackTarget>(GO_LIST, { kind: "go", href: "/settings" }, EXIT);
/** 실제로 일어날 수 있는 사건 순서: 뒤로 버튼은 받을 길이 있을 때 그 길로, 없으면 브라우저가 앱을 닫으므로 사건 없음 */
const stepArb = fc.oneof(
  fc.constant<"gesture">("gesture"),
  fc.constant<"timeout">("timeout"),
  fc.record({ target: targetArb, overlay: fc.boolean(), sticky: fc.boolean() }),
);
type Step = "gesture" | "timeout" | { target: BackTarget; overlay: boolean; sticky: boolean };

function realistic(supported: boolean, steps: Step[]) {
  let state = step(INITIAL_BACK_STATE, { kind: "start", watcherSupported: supported }).state;
  const log: { before: BackState; event: BackEvent; actions: BackAction[]; after: BackState }[] = [];
  const apply = (event: BackEvent) => {
    const r = step(state, event);
    log.push({ before: state, event, actions: r.actions, after: r.state });
    state = r.state;
    // 조용히 뺀 칸은 곧 popstate로 돌아온다
    if (r.actions.some((a) => a.kind === "silentHistoryBack")) apply(back("history", EXIT));
  };
  let sticky = false; // 한 번 조작하면 계속 true
  for (const s of steps) {
    if (s === "gesture") {
      sticky = true;
      apply({ kind: "gesture" });
    } else if (s === "timeout") {
      if (state.exiting) apply(timeout(sticky));
    } else {
      const via = viaOf(state);
      if (via) apply(back(via, s.target, s.overlay, sticky && s.sticky));
    }
  }
  return { state, log };
}

test.prop([fc.boolean(), fc.array(stepArb, { maxLength: 30 })])("P-U5-E1 지킴이는 많아야 한 칸이고, pushGuard는 조작 사건이거나 조작한 적이 있을 때만 나온다", (supported, steps) => {
  for (const { event, actions, after } of realistic(supported, steps).log) {
    const pushes = actions.filter((a) => a.kind === "pushGuard").length;
    expect(pushes).toBeLessThanOrEqual(1);
    if (pushes > 0) expect(event.kind === "gesture" || ("sticky" in event && event.sticky)).toBe(true);
    if (pushes > 0) expect(actions.some((a) => a.kind === "silentHistoryBack")).toBe(false);
    expect(typeof after.guard).toBe("boolean");
  }
});

test.prop([fc.boolean(), fc.array(stepArb, { maxLength: 30 })])("P-U5-E2 종료 안내 직후에는 받는 것이 없다 — 다음 뒤로는 앱을 닫는다", (supported, steps) => {
  const { log } = realistic(supported, steps);
  for (const [i, entry] of log.entries()) {
    if (!entry.actions.some((a) => a.kind === "showExitHint")) continue;
    // 조용히 뺀 칸의 popstate까지 지난 뒤
    const settled = log[i + 1]?.event.kind === "back" && entry.after.ignoreNextPop ? log[i + 1]!.after : entry.after;
    expect(viaOf(settled)).toBeNull();
    expect(settled.exiting).toBe(true);
  }
});

test.prop([fc.boolean(), fc.array(stepArb, { maxLength: 30 }), targetArb.filter((t) => t.kind === "go")])(
  "P-U5-E3 안내 중이 아니면 갈 곳이 있는 뒤로는 어느 길로 와도 navigate 하나",
  (supported, steps, target) => {
    const { state } = realistic(supported, steps);
    if (state.exiting) return;
    for (const via of ["watcher", "history"] as const) {
      const r = step({ ...state, watcher: via === "watcher" || state.watcher, guard: via === "history" || state.guard, ignoreNextPop: false }, back(via, target));
      expect(r.actions.filter((a) => a.kind === "navigate")).toEqual([{ kind: "navigate", href: (target as { href: string }).href }]);
    }
  },
);

test.prop([fc.boolean(), fc.array(stepArb, { maxLength: 30 })])("P-U5-E4 어떤 순서 뒤에도 3초가 지나고 터치하면 다시 받을 준비가 된다", (supported, steps) => {
  let { state } = realistic(supported, steps);
  if (state.exiting) state = step(state, timeout()).state;
  state = step(state, { kind: "gesture" }).state;
  expect(state.guard).toBe(true);
  expect(state.watcher).toBe(supported);
});
