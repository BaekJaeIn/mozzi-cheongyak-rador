// 설치·알림 지원 판단 (BR-U6-61·70~76·80·81, P-21) — React 없음
import type { KeyValueStorage } from "@/features/device/identity-store";

export type Platform = "ios_safari" | "ios_other" | "android" | "other";

const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//;

/** 설치 안내 종류를 고를 때만 쓴다 (기능 지원 판단은 기능 감지로, P-21) */
export function installPlatform(userAgent: string, maxTouchPoints: number): Platform {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return IOS_OTHER_BROWSER.test(userAgent) || !/Safari/.test(userAgent) ? "ios_other" : "ios_safari";
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/** 홈 화면 앱으로 열렸나 (BR-U6-70) */
export function isStandalone(displayModeStandalone: boolean, navigatorStandalone: boolean | undefined): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export type PushSupport = "supported" | "needs_install" | "unsupported";

/** iPhone은 홈 화면 앱에서만 웹 푸시가 된다 (NFR-U6-22) */
export function pushSupport(input: { hasServiceWorker: boolean; hasPushManager: boolean; hasNotification: boolean; platform: Platform; installed: boolean }): PushSupport {
  const ios = input.platform === "ios_safari" || input.platform === "ios_other";
  if (input.hasServiceWorker && input.hasPushManager && input.hasNotification) return "supported";
  if (ios && !input.installed && input.hasServiceWorker) return "needs_install";
  return "unsupported";
}

// ---------- 설치 안내 띠 (BR-U6-72·76) ----------

export const INSTALL_HINT_KEY = "mz.installHint";
export const HINT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowInstallHint(installed: boolean, dismissedAt: string | null, now: Date): boolean {
  if (installed) return false;
  if (!dismissedAt) return true;
  const t = Date.parse(dismissedAt);
  return Number.isNaN(t) || now.getTime() - t >= HINT_SNOOZE_MS;
}

export function loadHintDismissedAt(storage: KeyValueStorage): string | null {
  try {
    const raw = storage.getItem(INSTALL_HINT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { version?: unknown; dismissedAt?: unknown };
    return v.version === 1 && typeof v.dismissedAt === "string" ? v.dismissedAt : null;
  } catch {
    return null;
  }
}

export function saveHintDismissed(storage: KeyValueStorage, now: Date): void {
  try {
    storage.setItem(INSTALL_HINT_KEY, JSON.stringify({ version: 1, dismissedAt: now.toISOString() }));
  } catch {
    // 저장이 막혀도 이번에는 닫힌다
  }
}

// ---------- 알림 거부 안내 (BR-U6-80) ----------

export interface Help {
  intro: string;
  steps: string[];
}

export const KEEP_USING = "다른 기능은 그대로 쓰실 수 있어요.";

export function deniedHelp(platform: Platform, installed: boolean): Help {
  const intro = "알림이 꺼져 있어요. 아래 순서로 켜면 새 공고를 알려 드려요.";
  if (platform === "ios_safari" || platform === "ios_other") {
    return { intro, steps: ["휴대폰의 설정 앱을 열어요", "알림 → 청약 알리미를 눌러요", "알림 허용을 켜요"] };
  }
  if (platform === "android" && installed) {
    return { intro, steps: ["휴대폰 설정 → 애플리케이션을 열어요", "청약 알리미 → 알림을 눌러요", "알림 허용을 켜요"] };
  }
  return { intro, steps: ["주소창 왼쪽의 자물쇠(또는 설정) 표시를 눌러요", "권한 → 알림을 눌러요", "허용으로 바꿔요"] };
}
