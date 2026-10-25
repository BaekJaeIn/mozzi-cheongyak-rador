// 휴대폰 뒤로 버튼 상태 기계 (변경 4 U5 frontend-components §10.2, BR-U5-E10~E23) — 브라우저 API를 부르지 않는 순수 함수
// 뒤로 버튼은 두 길로 들어온다: CloseWatcher(있는 브라우저만)와 방문 기록 지킴이 한 칸(모든 브라우저). 한 번 누르면 둘 중 하나만 받는다.
import type { BackTarget } from "./back-target";

export interface BackState {
  /** 브라우저에 CloseWatcher가 있다 */
  supported: boolean;
  /** 방문 기록 지킴이 칸이 있다 (많아야 한 칸) */
  guard: boolean;
  /** CloseWatcher가 켜져 있다 */
  watcher: boolean;
  /** 종료 안내 중 (EXIT_WINDOW_MS) — 뒤로 버튼을 받지 않는다 */
  exiting: boolean;
  /** 조용히 뺀 지킴이의 popstate는 처리하지 않는다 */
  ignoreNextPop: boolean;
}

export type BackEvent =
  | { kind: "start"; watcherSupported: boolean }
  /** 사용자 조작(pointerup·click·keydown)을 처리하는 중 — 이때 넣은 칸만 브라우저가 건너뛰지 않는다 */
  | { kind: "gesture" }
  /** sticky: 이 페이지가 한 번이라도 사용자 조작을 받았다(navigator.userActivation.hasBeenActive) — 그러면 조작 밖에서 넣은 칸도 건너뛰어지지 않는다 */
  | { kind: "back"; via: "watcher" | "history"; target: BackTarget; overlay: boolean; sticky: boolean }
  | { kind: "exitTimeout"; sticky: boolean };

export type BackAction =
  | { kind: "pushGuard" }
  | { kind: "silentHistoryBack" }
  | { kind: "armWatcher" }
  | { kind: "disarmWatcher" }
  | { kind: "closeOverlay" }
  | { kind: "navigate"; href: string }
  | { kind: "showExitHint" }
  | { kind: "startExitTimer" };

export const INITIAL_BACK_STATE: BackState = { supported: false, guard: false, watcher: false, exiting: false, ignoreNextPop: false };

export function step(state: BackState, event: BackEvent): { state: BackState; actions: BackAction[] } {
  switch (event.kind) {
    case "start":
      // 지킴이는 넣지 않는다 — 조작 전에 넣은 칸은 건너뛰어진다 (BR-U5-E11). 조작 전 뒤로 버튼은 CloseWatcher가 받는다 (E13)
      return event.watcherSupported
        ? { state: { ...INITIAL_BACK_STATE, supported: true, watcher: true }, actions: [{ kind: "armWatcher" }] }
        : { state: { ...INITIAL_BACK_STATE }, actions: [] };

    case "gesture":
      if (state.exiting || state.guard) return { state, actions: [] }; // 많아야 한 칸 (E12), 안내 중엔 받지 않는다 (E21)
      return { state: { ...state, guard: true }, actions: [{ kind: "pushGuard" }] };

    case "exitTimeout": {
      const rearm = state.supported && !state.watcher;
      const guard = event.sticky && !state.guard; // 조작한 적이 있으면 바로, 없으면 다음 조작 때 (E22)
      const actions: BackAction[] = [];
      if (guard) actions.push({ kind: "pushGuard" });
      if (rearm) actions.push({ kind: "armWatcher" });
      return { state: { ...state, exiting: false, watcher: state.watcher || state.supported, guard: state.guard || guard }, actions };
    }

    case "back": {
      // 받은 길은 이 누름으로 써 버렸다
      let next: BackState = event.via === "history" ? { ...state, guard: false } : { ...state, watcher: false };
      if (event.via === "history" && state.ignoreNextPop) return { state: { ...next, ignoreNextPop: false }, actions: [] };
      if (state.exiting) return { state: next, actions: [] };

      const handled: BackAction | null = event.overlay
        ? { kind: "closeOverlay" }
        : event.target.kind === "go"
          ? { kind: "navigate", href: event.target.href }
          : null;
      if (handled) {
        // CloseWatcher는 바로 다시 켠다 (E13). 지킴이는 조작한 적이 있으면 바로(이동 전에), 없으면 다음 조작 때 (E12)
        const rearm = event.via === "watcher" && state.supported;
        const guard = event.sticky && !next.guard;
        const actions: BackAction[] = [...(guard ? [{ kind: "pushGuard" } as const] : []), handled, ...(rearm ? [{ kind: "armWatcher" } as const] : [])];
        return { state: { ...next, watcher: next.watcher || rearm, guard: next.guard || guard }, actions };
      }

      // 종료 안내: 3초 동안 받는 것이 없게 — 감시를 끄고 남은 지킴이를 조용히 뺀다 (E21)
      const actions: BackAction[] = [{ kind: "showExitHint" }, { kind: "startExitTimer" }];
      if (next.watcher) actions.push({ kind: "disarmWatcher" });
      if (next.guard) actions.push({ kind: "silentHistoryBack" });
      next = { ...next, exiting: true, watcher: false, guard: false, ignoreNextPop: next.guard };
      return { state: next, actions };
    }
  }
}
