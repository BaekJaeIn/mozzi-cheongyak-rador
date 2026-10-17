// E2E — 설치·알림 (U6: US-01·03, BR-U6-56~81, 접근성 NFR-1)
// 테스트 브라우저는 실제 푸시 서비스에 구독할 수 없으므로 권한·구독 API를 가짜로 바꿔 우리 흐름(권한 → 구독 → 서버 저장)을 확인한다.
// 실제 알림 도착은 실기기에서 확인한다 (setup-guide-u6.md).
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { hasLocalDb, releaseRegistrationLimit, seedStoredProfile, subscriptionCount } from "./helpers";

test.beforeEach(releaseRegistrationLimit);

const UA_KEYS = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
}

/** 알림 권한·구독을 가짜로 (Chromium) — 권한 창 결과를 정한다 */
async function fakePush(page: Page, answer: "granted" | "denied") {
  await page.addInitScript(
    ({ answer, keys }) => {
      let permission: NotificationPermission = "default";
      Object.defineProperty(Notification, "permission", { get: () => permission, configurable: true });
      Notification.requestPermission = async () => (permission = answer);
      let sub: unknown = null;
      PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
        const key = options?.applicationServerKey as Uint8Array;
        const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}`;
        sub = {
          endpoint,
          options: { applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) },
          toJSON: () => ({ endpoint, expirationTime: null, keys }),
          unsubscribe: async () => ((sub = null), true),
        };
        return sub as PushSubscription;
      };
      PushManager.prototype.getSubscription = async () => sub as PushSubscription | null;
    },
    { answer, keys: UA_KEYS },
  );
}

/** iPhone Safari(홈 화면 앱 아님)처럼: 웹 푸시 기능이 없다 */
async function likeIphoneSafari(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.PushManager;
    delete w.Notification;
  });
}

async function openSettings(page: Page) {
  await seedStoredProfile(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "설정" })).toBeVisible();
}

async function toggleNotifyOn(page: Page) {
  const sw = page.getByRole("switch", { name: /새 공고 알림 받기/ });
  await sw.click(); // 끄기
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click(); // 켜기 → 구독 흐름
  await expect(sw).toHaveAttribute("aria-checked", "true");
}

test("앱 정보·서비스워커·아이콘·공개 키 (US-01, NFR-U6-26)", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "모찌네 청약 알리미", short_name: "모찌네 청약 알리미", display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i: { purpose: string; sizes: string }) => `${i.purpose}:${i.sizes}`)).toEqual([
    "any:192x192",
    "any:512x512",
    "maskable:192x192",
    "maskable:512x512",
  ]);
  for (const path of ["/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const key = await request.get("/api/push/key");
  expect(key.status()).toBe(200);
  expect((await key.json()).publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);

  await seedStoredProfile(page);
  await page.goto("/");
  const script = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? null);
  expect(script).toMatch(/\/sw\.js$/);
});

test("피드 위 설치 안내 띠: 닫으면 7일 동안 안 보인다 (BR-U6-72)", async ({ page }) => {
  await seedStoredProfile(page);
  await page.goto("/");
  const banner = page.getByRole("region", { name: "홈 화면에 추가하면 알림을 받고 더 쉽게 열 수 있어요" });
  await expect(banner).toBeVisible();
  await axe(page);
  await banner.getByRole("button", { name: "닫기" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.evaluate(() =>
    window.localStorage.setItem("mz.installHint", JSON.stringify({ version: 1, dismissedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() })),
  );
  await page.reload();
  await expect(banner).toBeVisible();
});

test("설정의 설치 칸 → 기기에 맞는 설치 안내 (US-01, BR-U6-73·74)", async ({ page }, testInfo) => {
  await openSettings(page);
  await page.getByRole("button", { name: "설치 방법 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "홈 화면에 추가하기" });
  await expect(dialog).toBeVisible();
  if (testInfo.project.name === "iphone") {
    await expect(dialog.getByText("① 화면 아래 가운데의 공유 버튼을 눌러요")).toBeVisible();
    await expect(dialog.getByRole("img", { name: "오른쪽 위의 추가 버튼" })).toBeVisible();
  } else {
    await expect(dialog.getByText("‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요")).toBeVisible();
  }
  await axe(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("알림 켜기 → 권한 허용 → 구독을 서버에 저장, 다시 열면 다시 저장 (US-03, BR-U6-56)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android" || !hasLocalDb(), "Chromium + 로컬 Supabase에서 확인");
  await fakePush(page, "granted");
  await openSettings(page);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/push/subscribe"));
  await toggleNotifyOn(page);
  expect((await saved).status()).toBe(200);
  await expect(page.getByText("알림이 켜졌어요.")).toBeVisible();
  const deviceId = await page.evaluate(() => JSON.parse(window.localStorage.getItem("mz.device")!).deviceId as string);
  expect(await subscriptionCount(deviceId)).toBe(1);
});

test("알림을 거부하면 기기에 맞는 다시 켜는 방법 (BR-U6-80)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android", "Chromium에서 확인");
  await fakePush(page, "denied");
  await openSettings(page);
  await toggleNotifyOn(page);
  await expect(page.getByText("주소창 왼쪽의 자물쇠(또는 설정) 표시를 눌러요")).toBeVisible();
  await expect(page.getByText("다른 기능은 그대로 쓰실 수 있어요.")).toBeVisible();
});

test("iPhone Safari에서는 홈 화면 추가가 먼저 (BR-U6-61, NFR-U6-22)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone", "iPhone에서 확인");
  await likeIphoneSafari(page);
  await openSettings(page);
  await toggleNotifyOn(page);
  await expect(page.getByText("알림을 받으려면 먼저 홈 화면에 추가해 주세요.")).toBeVisible();
  await page.getByRole("button", { name: "설치 방법 보기" }).last().click();
  await expect(page.getByText("② 메뉴를 위로 밀어 ‘홈 화면에 추가’를 눌러요")).toBeVisible();
});

test("시험 알림: 구독이 없으면 먼저 알림을 켜라고 안내 (BR-U6-67)", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "시험 알림 보내기" }).click();
  await expect(page.getByText("먼저 알림을 켜 주세요.")).toBeVisible();
  await axe(page);
});
