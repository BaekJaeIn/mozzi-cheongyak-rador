// U6 화면 순수 로직 — 예시 + PBT (P-U6-9·10)
import { fc, test } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { memoryStorage } from "@/features/profile/model/__tests__/helpers";
import { safeClickUrl, sameKey } from "../click-url";
import {
  deniedHelp,
  HINT_SNOOZE_MS,
  installPlatform,
  isStandalone,
  loadHintDismissedAt,
  pushSupport,
  saveHintDismissed,
  shouldShowInstallHint,
} from "../install";

const ORIGIN = "https://mozzi-cheongyak-rador.vercel.app";

describe("기기 판별·지원", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", 5, "ios_safari"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1", 5, "ios_other"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.6.5", 5, "ios_other"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", 5, "ios_safari"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36", 5, "android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", 0, "other"],
  ] as const)("%s", (ua, touch, platform) => {
    expect(installPlatform(ua, touch)).toBe(platform);
  });

  it("홈 화면 앱 여부", () => {
    expect(isStandalone(true, undefined)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
  });

  it("iPhone Safari(홈 화면 앱 아님)는 설치가 먼저", () => {
    const base = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, platform: "android" as const, installed: false };
    expect(pushSupport(base)).toBe("supported");
    expect(pushSupport({ ...base, hasPushManager: false, hasNotification: false, platform: "ios_safari", installed: false })).toBe("needs_install");
    expect(pushSupport({ ...base, hasPushManager: false, platform: "other" })).toBe("unsupported");
  });

  it("거부 안내는 기기별", () => {
    expect(deniedHelp("ios_safari", true).steps[1]).toContain("모찌네 청약 알리미");
    expect(deniedHelp("android", true).steps[0]).toContain("애플리케이션");
    expect(deniedHelp("android", false).steps[0]).toContain("자물쇠");
  });
});

describe("설치 안내 띠 (BR-U6-72)", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  it("닫으면 7일 동안 숨김, 설치됐으면 항상 숨김", () => {
    const s = memoryStorage();
    expect(shouldShowInstallHint(false, loadHintDismissedAt(s), now)).toBe(true);
    saveHintDismissed(s, now);
    expect(shouldShowInstallHint(false, loadHintDismissedAt(s), new Date(now.getTime() + HINT_SNOOZE_MS - 1))).toBe(false);
    expect(shouldShowInstallHint(false, loadHintDismissedAt(s), new Date(now.getTime() + HINT_SNOOZE_MS))).toBe(true);
    expect(shouldShowInstallHint(true, null, now)).toBe(false);
    expect(loadHintDismissedAt(memoryStorage({ "mz.installHint": "x" }))).toBeNull();
  });
});

describe("알림 클릭 주소 (BR-U6-86)", () => {
  it.each([
    ["/notice/abc", "/notice/abc"],
    ["/", "/"],
    ["/?x=1#y", "/?x=1#y"],
    ["https://evil.com/notice", "/"],
    ["//evil.com/x", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/null"],
  ])("%s → %s", (url, expected) => {
    expect(safeClickUrl(url, ORIGIN)).toBe(expected);
  });

  it("서비스워커의 같은 함수와 결과가 같다", () => {
    const src = readFileSync("public/sw.js", "utf8");
    const body = /\/\/ --- safeClickUrl:[\s\S]*?\n(function safeClickUrl[\s\S]*?)\n\/\/ --- safeClickUrl 끝/.exec(src)![1]!;
    const swFn = new Function(`${body}; return safeClickUrl;`)() as (u: unknown, o: string) => string;
    for (const u of ["/notice/1", "https://evil.com", "//x", "javascript:1", "", "/a?b#c"]) expect(swFn(u, ORIGIN)).toBe(safeClickUrl(u, ORIGIN));
  });

  it("공개 키 비교", () => {
    expect(sameKey(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]))).toBe(true);
    expect(sameKey(new Uint8Array([1, 3]).buffer, new Uint8Array([1, 2]))).toBe(false);
    expect(sameKey(null, new Uint8Array([1]))).toBe(false);
  });
});

test.prop([fc.boolean(), fc.option(fc.integer({ min: 0, max: 30 * 86_400_000 }), { nil: null }), fc.integer({ min: 0, max: 30 * 86_400_000 }), fc.integer({ min: 0, max: 30 * 86_400_000 })])(
  "P-U6-9 안내 띠: 설치됨이면 숨김, 닫은 지 7일 미만이면 숨김, 시간이 지날수록 숨김 → 보임으로만",
  (installed, dismissedOffset, a, b) => {
    const base = Date.UTC(2026, 9, 1);
    const dismissedAt = dismissedOffset === null ? null : new Date(base + dismissedOffset).toISOString();
    const [t1, t2] = a <= b ? [a, b] : [b, a];
    const s1 = shouldShowInstallHint(installed, dismissedAt, new Date(base + t1));
    const s2 = shouldShowInstallHint(installed, dismissedAt, new Date(base + t2));
    if (installed) expect(s1 || s2).toBe(false);
    if (s1) expect(s2).toBe(true);
    if (dismissedOffset !== null && t1 >= dismissedOffset && t1 - dismissedOffset < HINT_SNOOZE_MS) expect(s1).toBe(false);
  },
);

test.prop([fc.oneof(fc.webUrl(), fc.webPath(), fc.string())])("P-U6-10 클릭 주소는 항상 같은 사이트의 / 경로이고 서비스워커와 같다", (url) => {
  const out = safeClickUrl(url, ORIGIN);
  expect(out.startsWith("/")).toBe(true);
  expect(out.startsWith("//")).toBe(false);
  expect(new URL(out, ORIGIN).origin).toBe(ORIGIN);
});
