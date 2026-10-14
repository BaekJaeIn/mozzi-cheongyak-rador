// E2E — 앱 뼈대 (US-02 기기 등록, 하단 메뉴, 접근성 NFR-U1-27)
// 실행 전제: 로컬 Supabase(Docker) + 마이그레이션 적용 + .env.local
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("첫 실행 시 기기를 등록하고 이후에는 네트워크 없이 뜬다", async ({ page }) => {
  const registrations: number[] = [];
  page.on("response", (res) => {
    if (res.url().endsWith("/api/device") && res.request().method() === "POST") registrations.push(res.status());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "맞춤 공고" })).toBeVisible();
  expect(registrations).toEqual([201]);

  const stored = await page.evaluate(() => window.localStorage.getItem("mz.device"));
  expect(JSON.parse(stored!)).toMatchObject({ deviceId: expect.any(String), token: expect.any(String) });

  await page.reload();
  await expect(page.getByRole("heading", { name: "맞춤 공고" })).toBeVisible();
  expect(registrations).toEqual([201]);
});

test("하단 메뉴 3개로 이동하고 현재 위치가 표시된다", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "주요 메뉴" });

  await nav.getByRole("link", { name: "관심 공고" }).click();
  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(nav.getByRole("link", { name: "관심 공고" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "설정" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await nav.getByRole("link", { name: "맞춤 공고" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("하단 메뉴 터치 영역은 48px 이상", async ({ page }) => {
  await page.goto("/");
  for (const link of await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
});

for (const path of ["/", "/bookmarks", "/settings"]) {
  test(`접근성 위반 0건: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
}
