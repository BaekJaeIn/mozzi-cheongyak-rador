"use client";

// 휴대폰 뒤로 버튼 처리 (back-target.ts 규칙)
// 1) CloseWatcher가 있는 브라우저(Android Chrome 120 이상): 뒤로 버튼을 방문 기록 대신 앱이 받는다.
//    갈 곳이 있으면 replace하고 다시 받을 준비, 첫 화면이면 안내만 띄우고 2초 동안 받지 않는다 → 그 사이 한 번 더 누르면 앱이 닫힌다.
// 0) 화면 위에 창이 떠 있으면(useBackClose) 뒤로 버튼은 그 창만 닫는다 (변경 2 BR-U4-C25)
// 2) 없는 브라우저: 방문 기록에 지킴이 한 칸을 넣어 popstate로 받는다. Chrome은 사용자 조작 없이 넣은 칸을 뒤로 버튼에서 건너뛰므로
//    지킴이가 빠져 있으면 다음 터치 때 다시 넣는다.
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useProfile } from "@/features/profile/ProfileProvider";
import { backTarget, EXIT_WINDOW_MS, isListPath, type ListPath } from "./back-target";

let initialGuard = false; // 개발 모드에서 효과가 두 번 돌아도 지킴이는 한 칸만

interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherCtor = new () => CloseWatcherLike;
const closeWatcherCtor = (): CloseWatcherCtor | null =>
  typeof window !== "undefined" && "CloseWatcher" in window ? (window as unknown as { CloseWatcher: CloseWatcherCtor }).CloseWatcher : null;

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
  const [toast, setToast] = useState(0); // 띄운 시각(0 = 안 보임)

  useEffect(() => {
    current.current = pathname;
    if (isListPath(pathname)) lastList.current = pathname;
  }, [pathname]);
  useEffect(() => {
    hasProfile.current = stored !== null;
  }, [stored]);

  useEffect(() => {
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    const showExitHint = (rearm: () => void) => {
      setToast(Date.now());
      if (exitTimer) clearTimeout(exitTimer);
      exitTimer = setTimeout(() => {
        exitTimer = null;
        rearm(); // 2초 안에 다시 누르지 않았으면 다음 번을 위해 다시 받을 준비
      }, EXIT_WINDOW_MS);
    };
    const targetFrom = (from: string) => backTarget(from, { lastList: lastList.current, hasProfile: hasProfile.current });

    const Watcher = closeWatcherCtor();
    if (Watcher) {
      let watcher: CloseWatcherLike | null = null;
      const arm = () => {
        watcher?.destroy();
        const w = new Watcher();
        w.onclose = () => {
          watcher = null;
          if (closeTarget.current) {
            closeTarget.current();
            arm();
            return;
          }
          const target = targetFrom(current.current);
          if (target.kind === "go") {
            router.replace(target.href);
            arm();
          } else {
            showExitHint(arm);
          }
        };
        watcher = w;
      };
      arm();
      return () => {
        watcher?.destroy();
        if (exitTimer) clearTimeout(exitTimer);
      };
    }

    let guardOn = false;
    const pushGuard = () => {
      window.history.pushState(window.history.state, "", window.location.href);
      guardOn = true;
    };
    if (!initialGuard) {
      initialGuard = true;
      pushGuard();
    }
    // Next 라우터도 popstate로 처음 연 화면을 되살린다. 그 처리가 끝난 뒤에 움직여야 덮어쓰이지 않는다
    const onPop = () => {
      guardOn = false;
      const from = current.current;
      setTimeout(() => handle(from), 0);
    };
    const handle = (from: string) => {
      if (closeTarget.current) {
        closeTarget.current();
        pushGuard();
        return;
      }
      const target = targetFrom(from);
      if (target.kind === "go") {
        pushGuard();
        router.replace(target.href);
        return;
      }
      // 처음 연 화면이 지금 화면과 다르면(알림으로 상세를 열었던 경우 등) 그 칸을 지금 화면으로 바꾼다
      if (window.location.pathname !== from) router.replace(from);
      showExitHint(pushGuard);
    };
    const onTouch = () => {
      if (!guardOn && !exitTimer) pushGuard();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pointerdown", onTouch, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pointerdown", onTouch, true);
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(0), EXIT_WINDOW_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const getLastList = useCallback(() => lastList.current, []);

  return (
    <LastListContext.Provider value={getLastList}>
      <CloseTargetContext.Provider value={closeTarget}>{children}</CloseTargetContext.Provider>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
        {toast > 0 && <p className="rounded-full bg-ink/90 px-5 py-3 text-body text-surface shadow-card">뒤로 버튼을 한 번 더 누르면 종료돼요</p>}
      </div>
    </LastListContext.Provider>
  );
}
