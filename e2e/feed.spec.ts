// E2E — 피드·상세·관심 공고 (U5: US-12~17, US-11 경로, 접근성 NFR-1)
// 실행 전제: 로컬 Supabase(Docker) + 마이그레이션 적용. 공고는 로컬 DB에만 넣고, 판정은 실제 U2 재계산으로 만든다
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { cleanupFeedNotices, type FeedFixture, hasLocalDb, releaseRegistrationLimit, seedFeedNotices, seedStoredProfile } from "./helpers";

test.skip(!hasLocalDb(), "로컬 Supabase에서만 실행 (운영 DB에는 공고를 넣지 않는다)");

let fx: FeedFixture;
test.beforeAll(async ({}, testInfo) => {
  fx = await seedFeedNotices(testInfo.project.name);
});
test.afterAll(async ({}, testInfo) => {
  await cleanupFeedNotices(testInfo.project.name);
});
test.beforeEach(releaseRegistrationLimit);

const card = (page: Page, name: string) => page.getByRole("article").filter({ hasText: name });

/** 휴대폰 뒤로 버튼: CloseWatcher가 있으면 앱이 받는다(Esc와 같은 신호), 없으면 방문 기록 */
async function pressBack(page: Page) {
  if (await page.evaluate(() => "CloseWatcher" in window)) await page.keyboard.press("Escape");
  else await page.goBack();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
}

/** 기기에 프로필이 있는 상태로 홈을 연다 — 서버에 없으므로 피드가 다시 보내고(no_profile 복구) 판정이 계산된다 */
async function openFeed(page: Page) {
  await seedStoredProfile(page);
  await page.goto("/");
  // 첫 판정 계산(프로필 다시 보내기 + 재계산)은 병렬 실행 부하에서 5초를 넘길 수 있다
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible({ timeout: 15_000 });
  await expect(card(page, fx.open.name)).toBeVisible();
}

test("피드: 맞는 공고만, 접수 중 → 접수 예정, 배지·D-day·NEW (US-12)", async ({ page }) => {
  await openFeed(page);
  const open = card(page, fx.open.name);
  await expect(open.getByText("자격 충족")).toBeVisible();
  await expect(open.getByText("NEW")).toBeVisible();
  await expect(open.getByText("마감까지 D-2")).toBeVisible();
  await expect(open.getByText("오래 사는 임대 — 어르신 우선 물량")).toBeVisible();

  const upcoming = card(page, fx.upcoming.name);
  await expect(upcoming.getByText("확인 필요")).toBeVisible();
  await expect(upcoming.getByText("접수까지 D-5")).toBeVisible();

  await expect(card(page, fx.ineligible.name)).toHaveCount(0); // 미충족 숨김
  await expect(card(page, fx.closed.name)).toHaveCount(0); // 마감 제외

  const names = await page.getByRole("article").allTextContents();
  const pos = (name: string) => names.findIndex((t) => t.includes(name));
  expect(pos(fx.open.name)).toBeLessThan(pos(fx.upcoming.name));
  await axe(page);
});

test("상세: 원문·일정·세대수·판정 이유(내 금액)·AI 요약, 열면 NEW가 꺼진다 (US-13~15)", async ({ page }) => {
  await openFeed(page);
  await card(page, fx.open.name).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/notice/${fx.open.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `${fx.open.name} 입주자 모집공고` })).toBeVisible();

  await expect(page.getByRole("link", { name: /원문 보기/ }).first()).toHaveAttribute("href", fx.open.url);
  await expect(page.getByText(/^오늘 \(/)).toBeVisible(); // 타임라인 오늘 표시
  await expect(page.getByText("전용 46㎡ (약 14평)")).toBeVisible();
  await expect(page.getByText("(합계 120세대 이상)")).toBeVisible();
  await expect(page.getByText("이 공고에 신청할 수 있어 보여요")).toBeVisible();
  await expect(page.getByText("→ 입력하신 금액 월 450만원")).toBeVisible();
  await expect(page.getByText("만 65세 이상 무주택 세대가 신청할 수 있어요.")).toBeVisible();
  await expect(page.getByText("AI가 공고문을 요약했어요. 정확한 내용은 원문을 확인해 주세요")).toBeVisible();
  await expect(page.getByText("참고용이며 최종 자격은 공고문과 기관 확인이 필요합니다")).toBeVisible();
  await axe(page);

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "맞춤 공고" }).click();
  await expect(card(page, fx.open.name)).toBeVisible();
  await expect(card(page, fx.open.name).getByText("NEW")).toHaveCount(0);
  await expect(card(page, fx.upcoming.name).getByText("NEW")).toBeVisible();
});

test("상세: 확인 필요 공고는 할 일을, 요약이 없으면 준비 중을 보여 준다 (US-14·15)", async ({ page }) => {
  await openFeed(page);
  await card(page, fx.upcoming.name).getByRole("link").click();
  await expect(page.getByText("신청할 수 있는지 확인이 필요해요")).toBeVisible();
  await expect(page.getByText("원문의 '신청 자격'을 확인해 주세요").first()).toBeVisible();
  await expect(page.getByText("요약을 준비 중이에요")).toBeVisible();
});

test("상세: 피드 밖 공고도 열리고 상태를 알려 준다, 없는 공고는 안내 (US-13)", async ({ page }) => {
  await openFeed(page);
  await page.goto(`/notice/${fx.closed.id}`);
  await expect(page.getByText("접수가 끝난 공고예요")).toBeVisible();
  await expect(page.getByRole("button", { name: "캘린더에 추가" })).toHaveCount(0);

  await page.goto(`/notice/${fx.ineligible.id}`);
  await expect(page.getByText("지금 조건으로는 신청이 어려운 공고예요")).toBeVisible();
  await expect(page.getByText("신청이 어려운 유형 0개")).toHaveCount(0); // 충족이 없으면 펼쳐 둔다
  await expect(page.getByText(/사는 곳/).first()).toBeVisible();

  await page.goto("/notice/3f2c1a9e-0000-4000-8000-0000000000ff");
  await expect(page.getByText("공고를 찾을 수 없어요. 오래된 공고는 1년이 지나면 지워져요")).toBeVisible();
});

test("뒤로 버튼: 상세 → 목록, 목록에서는 한 번 더 누르면 종료 안내 (2026-10-17 요청)", async ({ page }) => {
  await openFeed(page);
  await card(page, fx.open.name).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/notice/${fx.open.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `${fx.open.name} 입주자 모집공고` })).toBeVisible();
  await pressBack(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, fx.open.name)).toBeVisible();

  // 관심 공고·설정에서도 맞춤 공고로 (방문 기록을 거슬러 가지 않는다)
  const nav = page.getByRole("navigation", { name: "주요 메뉴" });
  await nav.getByRole("link", { name: "관심 공고" }).click();
  await nav.getByRole("link", { name: "설정" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "설정" })).toBeVisible();
  await pressBack(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, fx.open.name)).toBeVisible();

  // 첫 화면: 처음 누르면 종료하지 않고 안내만
  await pressBack(page);
  await expect(page.getByText("뒤로 버튼을 한 번 더 누르면 종료돼요")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, fx.open.name)).toBeVisible();
});

test("뒤로 버튼: 알림으로 상세를 바로 열었어도 맞춤 공고로 (2026-10-17 요청)", async ({ page }) => {
  await openFeed(page);
  await page.goto(`/notice/${fx.open.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `${fx.open.name} 입주자 모집공고` })).toBeVisible();
  await pressBack(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, fx.open.name)).toBeVisible();
});

test("캘린더에 추가: Android는 Google 캘린더, iPhone은 캘린더 파일 (US-16)", async ({ page, context }, testInfo) => {
  await openFeed(page);
  await page.goto(`/notice/${fx.open.id}`);
  const button = page.getByRole("button", { name: "캘린더에 추가" });
  await expect(button).toBeEnabled();

  if (testInfo.project.name === "android") {
    await context.route("https://calendar.google.com/**", (route) => route.fulfill({ status: 200, body: "ok" }));
    const popup = context.waitForEvent("page");
    await button.click();
    const url = new URL((await popup).url());
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe(`[청약 접수] ${fx.open.name}`);
  } else {
    const res = await page.request.get(`/api/notices/${fx.open.id}/calendar`); // 인증 없이 열린다
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain(`URL:${fx.open.url}`);
  }
});

test("관심 공고: 별로 저장 → 관심 공고 화면 → 지우기 (US-17)", async ({ page }) => {
  await openFeed(page);
  await card(page, fx.open.name).getByRole("button", { name: "관심 공고 저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "저장했어요" })).toBeVisible();
  await expect(card(page, fx.open.name).getByRole("button", { name: "관심 공고에서 빼기" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "관심 공고" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "관심 공고" })).toBeVisible();
  const item = card(page, fx.open.name);
  await expect(item.getByText("마감까지 D-2")).toBeVisible();
  await axe(page);

  await item.getByRole("button", { name: `${fx.open.name} 지우기` }).click();
  await expect(page.getByRole("status").filter({ hasText: "지웠어요" })).toBeVisible();
  await expect(page.getByText("별 버튼을 누르면 여기에 모아 볼 수 있어요")).toBeVisible();
});

// 서비스워커(U6)가 등록된 페이지는 WebKit에서 page.route 가로채기를 거치지 않는다 → 끊김 흉내 테스트만 서비스워커를 막는다
test.describe("인터넷 끊김", () => {
  test.use({ serviceWorkers: "block" });

  test("인터넷이 끊겨도 마지막으로 받은 피드를 보여 준다 (NFR-4.1, BR-U5-51)", async ({ page }) => {
    await openFeed(page);
    await expect(page.getByText("새 공고를 확인하고 있어요")).toHaveCount(0);
    await page.route("**/api/feed", (route) => route.abort("internetdisconnected"));
    await page.reload();
    await expect(card(page, fx.open.name)).toBeVisible();
    await expect(page.getByText(/인터넷 연결을 확인해 주세요\. .+에 확인한 목록이에요/)).toBeVisible();
  });
});

test("쉬운 모드에서도 상세에 가로 스크롤이 없다 (NFR-1)", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mz.display", "easy"));
  await openFeed(page);
  await page.goto(`/notice/${fx.open.id}`);
  // 상세 내용이 다 그려진 뒤에 잰다 (앱 머리글에도 h1이 있으므로 공고 제목으로 기다린다)
  await expect(page.getByRole("heading", { level: 1, name: `${fx.open.name} 입주자 모집공고` })).toBeVisible();
  await expect(page.getByText("판정 이유")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page);
});
