"use client";

// 휴대폰 뒤로 버튼 처리 (back-target.ts 갈 곳, back-controller.ts 상태 기계 — 변경 4 BR-U5-E10~E23)
// 두 길을 함께 쓴다: ① CloseWatcher(Android Chrome 120 이상) ② 방문 기록 지킴이 한 칸(모든 브라우저, 삼성 인터넷 등).
// - 지킴이는 사용자 조작(pointerup·keydown) 처리 중에만 넣는다. 조작 없이 넣은 칸은 브라우저가 뒤로 버튼에서 건너뛰고,
//   터치는 손가락을 뗄 때 조작으로 인정된다 (pointerdown은 아님)
// - 화면 위에 창이 떠 있으면(useBackClose) 뒤로 버튼은 그 창만 닫는다 (변경 2 BR-U4-C25)
// - 첫 화면에서는 안내를 띄우고 3초 동안 아무것도 받지 않는다 → 그 사이 한 번 더 누르면 브라우저가 앱을 닫는다
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useProfile } from "@/features/profile/ProfileProvider";
import { type BackAction, type BackEvent, INITIAL_BACK_STATE, step } from "./back-controller";
import { backTarget, EXIT_HINT, EXIT_WINDOW_MS, isListPath, type ListPath } from "./back-target";

interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherCtor = new () => CloseWatcherLike;
const closeWatcherCtor = (): CloseWatcherCtor | null =>
  typeof window !== "undefined" && "CloseWatcher" in window ? (window as unknown as { CloseWatcher: CloseWatcherCtor }).CloseWatcher : null;

/** popstate 뒤 할 일을 미루는 시간 — WebKit은 방문 기록 이동이 끝나기 전에 넣은 칸을 잃을 때가 있다 (E2E로 확인, 0ms에서 5회 중 2~3회) */
const POP_SETTLE_MS = 50;

/** 이 페이지가 한 번이라도 사용자 조작을 받았나 — 모르는 브라우저는 false(다음 조작 때 지킴이를 넣는다) */
const hasBeenActive = (): boolean =>
  typeof navigator !== "undefined" && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;

const LastListContext = createContext<() => ListPath>(() => "/");
const CloseTargetContext = createContext<{ current: (() => void) | null }>({ current: null });

/** 떠 있는 창을 뒤로 버튼으로 닫게 한다. open인 동안만 onClose를 등록 */
export function useBackClose(open: boolean, onClose: () => void): void {
  const closeTargetRef = useContext(CloseTargetContext);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const handler = () => latest.current();
    closeTargetRef.current = handler;
    return () => {
      if (closeTargetRef.current === handler) closeTargetRef.current = null;
    };
  }, [open, closeTargetRef]);
}

/** 상세 화면의 [뒤로]가 돌아갈 목록 */
export function useLastList(): () => ListPath {
  return useContext(LastListContext);
}

export function BackNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { stored } = useProfile();
  const current = useRef(pathname);
  const lastList = useRef<ListPath>("/");
  const hasProfile = useRef(false);
  const closeTarget = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    current.current = pathname;
    if (isListPath(pathname)) lastList.current = pathname;
  }, [pathname]);
  useEffect(() => {
    hasProfile.current = stored !== null;
  }, [stored]);

  useEffect(() => {
    const Watcher = closeWatcherCtor();
    let state = INITIAL_BACK_STATE;
    let watcher: CloseWatcherLike | null = null;
    let exitTimer: ReturnType<typeof setTimeout> | null = null;

    const backEvent = (via: "watcher" | "history", from: string): BackEvent => ({
      kind: "back",
      via,
      target: backTarget(from, { lastList: lastList.current, hasProfile: hasProfile.current }),
      overlay: closeTarget.current !== null,
      sticky: hasBeenActive(),
    });

    const run = (event: BackEvent): BackAction[] => {
      const result = step(state, event);
      state = result.state;
      execute(result.actions);
      return result.actions;
    };

    const execute = (actions: readonly BackAction[]) => {
      for (const action of actions) {
        switch (action.kind) {
          case "pushGuard":
            window.history.pushState(window.history.state, "", window.location.href);
            break;
          case "silentHistoryBack":
            window.history.back();
            break;
          case "armWatcher": {
            if (!Watcher) break;
            watcher?.destroy();
            const w = new Watcher();
            w.onclose = () => {
              if (watcher === w) watcher = null;
              run(backEvent("watcher", current.current));
            };
            watcher = w;
            break;
          }
          case "disarmWatcher": {
            const w = watcher;
            watcher = null;
            w?.destroy();
            break;
          }
          case "closeOverlay":
            closeTarget.current?.();
            break;
          case "navigate":
            router.replace(action.href);
            break;
          case "showExitHint":
            setToast(true);
            break;
          case "startExitTimer":
            if (exitTimer) clearTimeout(exitTimer);
            exitTimer = setTimeout(() => {
              exitTimer = null;
              setToast(false);
              run({ kind: "exitTimeout", sticky: hasBeenActive() });
            }, EXIT_WINDOW_MS);
            break;
        }
      }
    };

    // 상태는 바로 바꾼다 — 바로 이어진 터치가 "지킴이가 아직 있다"고 보지 않게.
    // 할 일은 미룬다 — Next 라우터도 popstate로 그 칸의 화면을 되살리므로, 그 처리가 끝난 뒤에 움직여야 덮어쓰이지 않는다
    const onPop = () => {
      const from = current.current;
      const result = step(state, backEvent("history", from));
      state = result.state;
      setTimeout(() => {
        execute(result.actions);
        // 되살아난 칸이 지금 화면과 다르면(알림으로 상세를 열었던 경우, 조용히 뺀 칸 등) 그 칸을 지금 화면으로 (BR-U5-E23)
        if (!result.actions.some((a) => a.kind === "navigate") && window.location.pathname !== from) router.replace(from);
      }, POP_SETTLE_MS);
    };
    const onGesture = () => run({ kind: "gesture" });

    run({ kind: "start", watcherSupported: Watcher !== null });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pointerup", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pointerup", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      const w = watcher;
      watcher = null;
      w?.destroy();
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [router]);

  const getLastList = useCallback(() => lastList.current, []);

  return (
    <LastListContext.Provider value={getLastList}>
      <CloseTargetContext.Provider value={closeTarget}>{children}</CloseTargetContext.Provider>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
        {toast && <p className="rounded-full bg-ink/90 px-5 py-3 text-body text-surface shadow-card">{EXIT_HINT}</p>}
      </div>
    </LastListContext.Provider>
  );
}
