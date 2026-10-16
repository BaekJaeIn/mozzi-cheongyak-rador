"use client";

// 설치·알림 연결 (U6 frontend-components §2~4, business-logic-model §2·3·6)
// - 서비스워커 등록, 설치 상태·Android 설치 창 보관
// - U4 PushPort 등록 (마법사 알림 단계·설정 스위치가 이것으로 알림을 켠다)
// - 앱을 열 때 권한이 허용이면 구독을 서버에 다시 저장 (PushResync, BR-U6-56·57)
// 권한 창은 버튼을 누른 그 순간에만 띄운다 — 공개 키는 미리 받아 둔다 (P-20)
import { base64UrlToBytes } from "@shared/encoding/base64url.ts";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getApiClient } from "@/features/device/api-client";
import { type PushPort, type PushSubscribeResult, setPushPort } from "@/features/profile/ui/push-port";
import { safeClickUrl, sameKey } from "./model/click-url";
import { installPlatform, isStandalone, type Platform, pushSupport, type PushSupport } from "./model/install";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  ready: boolean;
  installed: boolean;
  platform: Platform;
  support: PushSupport;
  /** Android 설치 창을 띄울 수 있나 */
  canPrompt: boolean;
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
  permission(): NotificationPermission | "unsupported";
}

const PwaContext = createContext<PwaState | null>(null);

function detect() {
  const platform = installPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const installed = isStandalone(
    window.matchMedia?.("(display-mode: standalone)").matches ?? false,
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const support = pushSupport({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    platform,
    installed,
  });
  return { platform, installed, support };
}

let publicKeyPromise: Promise<Uint8Array | null> | null = null;
/** 공개 키 — 실패하면 다음에 다시 받는다 */
function loadPublicKey(): Promise<Uint8Array | null> {
  publicKeyPromise ??= fetch("/api/push/key", { cache: "no-store" })
    .then(async (r) => (r.ok ? base64UrlToBytes(((await r.json()) as { publicKey: string }).publicKey) : null))
    .catch(() => null)
    .then((key) => {
      if (!key) publicKeyPromise = null;
      return key;
    });
  return publicKeyPromise;
}

/** 지금 브라우저 구독(없으면 새로)을 서버에 저장. 공개 키가 바뀌었으면 다시 구독 (키 교체) */
async function saveSubscription(): Promise<boolean> {
  const key = await loadPublicKey();
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(key) });
  const r = await getApiClient().request("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return r.ok;
}

function createPushPort(get: () => ReturnType<typeof detect>): PushPort {
  return {
    // 설치가 필요한 iPhone도 "지원"으로 두고 subscribe가 needs_install을 돌려준다 (U4 NotifyStep이 안내)
    supported: () => get().support !== "unsupported",
    async isSubscribed() {
      if (get().support !== "supported" || Notification.permission !== "granted") return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!(await reg?.pushManager.getSubscription());
    },
    async subscribe(): Promise<PushSubscribeResult> {
      const { support } = get();
      if (support === "needs_install") return "needs_install";
      if (support === "unsupported") return "unsupported";
      if (Notification.permission === "denied") return "denied"; // 다시 묻지 못한다 (BR-U6-81)
      // 사용자 동작 안에서 바로 권한 요청 (앞에 네트워크 await 없음)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return "denied";
      try {
        return (await saveSubscription()) ? "subscribed" : "error";
      } catch {
        return "error";
      }
    },
  };
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const envRef = useRef<ReturnType<typeof detect> | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const update = () => {
      envRef.current = detect();
      setEnv(envRef.current);
    };
    update();
    setPushPort(createPushPort(() => envRef.current ?? detect()));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    void loadPublicKey(); // 권한 창 전에 미리 (P-20)
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      update();
    };
    const mq = window.matchMedia?.("(display-mode: standalone)");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mq?.addEventListener?.("change", update);
    return () => {
      setPushPort(null);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq?.removeEventListener?.("change", update);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const value = useMemo<PwaState>(
    () => ({
      ready: env !== null,
      installed: env?.installed ?? false,
      platform: env?.platform ?? "other",
      support: env?.support ?? "unsupported",
      canPrompt: deferred !== null,
      promptInstall,
      permission: () => ("Notification" in window ? Notification.permission : "unsupported"),
    }),
    [env, deferred, promptInstall],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaState {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("PwaProvider 안에서만 쓸 수 있어요");
  return ctx;
}

/**
 * 기기 준비(DeviceBootstrap) 뒤: 권한이 허용이면 구독을 다시 저장한다 (BR-U6-56).
 * 서비스워커 메시지: resubscribe → 다시 저장 (BR-U6-57), navigate → 앱 안 이동 (BR-U6-85)
 */
export function PushResync() {
  const router = useRouter();
  useEffect(() => {
    const resync = () => {
      if (!("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
      void saveSubscription().catch(() => undefined);
    };
    resync();
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type === "resubscribe") resync();
      if (data?.type === "navigate") router.push(safeClickUrl(data.url, window.location.origin));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
