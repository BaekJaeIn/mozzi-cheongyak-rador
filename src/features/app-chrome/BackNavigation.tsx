"use client";

// 휴대폰 뒤로 버튼 처리 (back-target.ts 규칙)
// 방문 기록은 항상 [처음 연 화면, 지킴이] 두 칸이다. 뒤로 버튼을 누르면 지킴이가 빠지면서 popstate가 오고,
// 여기서 갈 곳으로 replace한 뒤 지킴이를 다시 넣는다.
// 종료: 첫 화면에서 누르면 안내를 띄우고 2초 동안 지킴이를 넣지 않는다 → 그 사이 한 번 더 누르면 기록 맨 앞이라 앱이 닫힌다.
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useProfile } from "@/features/profile/ProfileProvider";
import { backTarget, EXIT_WINDOW_MS, isListPath, type ListPath } from "./back-target";

let initialGuard = false; // 개발 모드에서 효과가 두 번 돌아도 지킴이는 한 칸만

const LastListContext = createContext<() => ListPath>(() => "/");

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
  const [toast, setToast] = useState(0); // 띄운 시각(0 = 안 보임)

  useEffect(() => {
    current.current = pathname;
    if (isListPath(pathname)) lastList.current = pathname;
  }, [pathname]);
  useEffect(() => {
    hasProfile.current = stored !== null;
  }, [stored]);

  useEffect(() => {
    const pushGuard = () => window.history.pushState(window.history.state, "", window.location.href);
    if (!initialGuard) {
      initialGuard = true;
      pushGuard();
    }
    let exitTimer: ReturnType<typeof setTimeout> | null = null;

    // Next 라우터도 popstate로 처음 연 화면을 되살린다. 그 처리가 끝난 뒤에 움직여야 덮어쓰이지 않는다
    const onPop = () => {
      const from = current.current;
      setTimeout(() => handle(from), 0);
    };
    const handle = (from: string) => {
      const target = backTarget(from, { lastList: lastList.current, hasProfile: hasProfile.current });
      if (target.kind === "go") {
        pushGuard();
        router.replace(target.href);
        return;
      }
      // 처음 연 화면이 지금 화면과 다르면(알림으로 상세를 열었던 경우 등) 그 칸을 지금 화면으로 바꾼다
      if (window.location.pathname !== from) router.replace(from);
      setToast(Date.now());
      if (exitTimer) clearTimeout(exitTimer);
      exitTimer = setTimeout(() => {
        exitTimer = null;
        pushGuard(); // 2초 안에 다시 누르지 않았으면 다음 번을 위해 지킴이를 다시 넣는다
      }, EXIT_WINDOW_MS);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
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
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
        {toast > 0 && <p className="rounded-full bg-ink/90 px-5 py-3 text-body text-surface shadow-card">뒤로 버튼을 한 번 더 누르면 종료돼요</p>}
      </div>
    </LastListContext.Provider>
  );
}
