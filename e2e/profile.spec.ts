// E2E — 내 정보 입력·설정 (U4: US-02·04~09·18·19·20, 접근성 NFR-1)
// 실행 전제: 로컬 Supabase(Docker) + 마이그레이션 적용 + .env.local (CI db-and-e2e)
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { releaseRegistrationLimit, seedStoredProfile } from "./helpers";

test.beforeEach(releaseRegistrationLimit);

const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true }).click();
const unknown = (page: Page) => page.getByRole("button", { name: "잘 모르겠어요" }).click();
const pick = (page: Page, name: string) => page.getByRole("radio", { name, exact: true }).click();
const heading = (page: Page, name: string) => expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

async function pickBirth(page: Page, year: number, month: number, day: number) {
  await page.getByLabel("태어난 해").selectOption(String(year));
  await page.getByLabel("태어난 달").selectOption(String(month));
  await page.getByLabel("태어난 날").selectOption(String(day));
}

/** 처음 입력 저장 뒤 알림 단계 (U6가 연결, US-03) — "나중에"(알림 미지원이면 "맞춤 공고 보러 가기")로 홈으로 */
async function skipNotify(page: Page) {
  await heading(page, "새 공고 알림을 받으시겠어요?");
  await page.getByRole("button", { name: /^(나중에|맞춤 공고 보러 가기)$/ }).click();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
}

/** 부부·집 없음·통장 없음으로 확인 화면까지 */
async function fillToReview(page: Page) {
  test.slow(); // 화면 20개 가까이 지나가는 긴 흐름 — WebKit·병렬 실행에서 30초를 넘을 수 있다
  await heading(page, "이 휴대폰을 쓰시는 분의 생년월일을 골라 주세요");
  await pickBirth(page, 1960, 3, 2);
  await expect(page.getByText(/만 \d+세/)).toBeVisible();
  await next(page);
  await pick(page, "부부 두 분만");
  await next(page);
  await heading(page, "배우자분의 생년월일을 골라 주세요");
  await unknown(page);
  await pick(page, "나");
  await next(page);
  await pick(page, "경기");
  await pick(page, "하남시");
  await next(page);
  await pick(page, "5~10년");
  await next(page);
  await pick(page, "아니오"); // 집 없음
  await next(page);
  await pick(page, "10~15년");
  await next(page);
  await pick(page, "아니오"); // 통장 없음
  await next(page);
  await page.getByRole("textbox", { name: "월평균 소득" }).fill("450");
  await expect(page.getByText("월 450만원")).toBeVisible();
  await next(page);
  await pick(page, "예"); // 배우자 소득
  await next(page);
  await page.getByRole("textbox", { name: "총자산" }).fill("20000");
  await next(page);
  await page.getByRole("textbox", { name: "자동차 값" }).fill("0");
  await next(page);
  await pick(page, "해당 없음");
  await next(page);
  await heading(page, "관심 있는 3기 신도시를 골라 주세요");
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(6); // 처음엔 모두 선택
  await next(page);
  await next(page); // 넓이: 안 고르면 상관없음
  await next(page); // 분양·임대: 기본 둘 다·상관없음
  await heading(page, "입력하신 내용을 확인해 주세요");
}

test("처음 실행 → 마법사 → 저장하면 서버에 저장되고 홈으로 간다 (US-02·04~08)", async ({ page }) => {
  await page.goto("/");
  await heading(page, "내 정보를 넣으면 맞는 공고만 골라 드려요");
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0); // 처음 실행에서는 숨김
  await axe(page);
  await page.getByRole("link", { name: "시작하기" }).click();
  await expect(page).toHaveURL(/\/profile\/setup$/);
  await axe(page);

  await fillToReview(page);
  await expect(page.getByText("경기 하남시 · 5~10년")).toBeVisible();
  await expect(page.getByText("비워 둔 항목은 '확인 필요'로 표시돼요.")).toBeVisible();
  await axe(page);

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장" }).click();
  expect((await saved).status()).toBe(200);
  await skipNotify(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();

  const stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
  expect(stored.sync.state).toBe("synced");
  expect(stored.profile).toMatchObject({ householdHead: "self", spouse: { birthDate: null }, money: { monthlyIncome: 450, carValue: 0 } });
  expect(await page.evaluate(() => window.localStorage.getItem("mz.profile.draft"))).toBeNull();
});

test("중간에 새로고침해도 입력하던 화면부터 이어서 한다 (US-04, BR-U4-02)", async ({ page }) => {
  await page.goto("/profile/setup");
  await pickBirth(page, 1958, 12, 31);
  await next(page);
  await pick(page, "혼자");
  await next(page);
  await heading(page, "주민등록상 세대주는 누구인가요?");
  await page.goto("/");
  await expect(page).toHaveURL(/\/profile\/setup$/);
  await heading(page, "주민등록상 세대주는 누구인가요?");
  await page.getByRole("button", { name: "처음부터 다시" }).click();
  await heading(page, "이 휴대폰을 쓰시는 분의 생년월일을 골라 주세요");
});

test("금액이 흔한 범위를 크게 넘으면 한 번 더 묻는다 (US-06, BR-U4-42)", async ({ page }) => {
  await page.goto("/profile/setup");
  await pickBirth(page, 1960, 1, 1);
  await next(page);
  await pick(page, "혼자");
  await next(page);
  await unknown(page); // 세대주
  await pick(page, "부산");
  await next(page);
  await unknown(page); // 거주 기간
  await unknown(page); // 집
  await unknown(page); // 통장
  await page.getByRole("textbox", { name: "월평균 소득" }).fill("45000");
  await expect(page.getByText("월 4억 5,000만원")).toBeVisible();
  await next(page);
  const dialog = page.getByRole("alertdialog", { name: "입력하신 금액이 맞나요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "다시 입력" }).click();
  await heading(page, "부부 두 분의 소득을 합친 월평균은 얼마인가요?");
  await page.getByRole("textbox", { name: "월평균 소득" }).fill("450");
  await next(page);
  await heading(page, "세대 전체의 총자산은 얼마인가요?");
});

test("설정: 그룹 고치기, 알림 시각 즉시 저장, 쉬운 모드 유지 (US-09·18·19)", async ({ page }) => {
  await page.goto("/profile/setup");
  await fillToReview(page);
  await page.getByRole("button", { name: "저장" }).click();
  await skipNotify(page);
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "설정" }).click();
  await heading(page, "설정");
  await axe(page);

  // 주택 그룹 고치기
  await page.getByRole("link", { name: "집 고치기", exact: true }).click();
  await heading(page, "지금 집을 가지고 계신가요?");
  await pick(page, "예");
  await next(page);
  await pick(page, "1채");
  await next(page);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장" }).click();
  expect((await saved).status()).toBe(200);
  await expect(page).toHaveURL(/\/settings\?saved=synced$/);
  await expect(page.getByText("집 있음 · 1채")).toBeVisible();
  await expect(page.getByText("경기 하남시 · 5~10년")).toBeVisible(); // 다른 그룹은 그대로

  // 알림 시각
  const notify = page.waitForResponse((r) => r.url().endsWith("/api/notify-settings"));
  await page.getByRole("combobox", { name: "알림 받을 시각" }).selectOption({ label: "오후 8시" });
  expect((await notify).status()).toBe(200);
  await expect(page.getByText("바꿨어요.")).toBeVisible();

  // 쉬운 모드: 즉시 적용, 새로고침 후 유지, 가로 스크롤 없음
  await page.getByRole("radio", { name: "쉬운 모드" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page);
});

test("내 정보 모두 지우기: 서버 먼저 지우고 처음 실행 안내로, 화면 모드는 남긴다 (US-20)", async ({ page }) => {
  await page.goto("/profile/setup");
  await fillToReview(page);
  await page.getByRole("button", { name: "저장" }).click();
  await skipNotify(page);
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => window.localStorage.setItem("mz.display", "easy"));

  await page.goto("/settings");
  await page.getByRole("button", { name: "내 정보 모두 지우기" }).click();
  const dialog = page.getByRole("alertdialog", { name: "내 정보를 모두 지울까요?" });
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused(); // 처음 초점은 안전한 쪽
  const deleted = page.waitForResponse((r) => r.url().endsWith("/api/device") && r.request().method() === "DELETE");
  await dialog.getByRole("button", { name: "모두 지우기" }).click();
  expect((await deleted).status()).toBe(204);
  await heading(page, "내 정보를 넣으면 맞는 공고만 골라 드려요");
  const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("mz.")));
  expect(keys.filter((k) => k !== "mz.device")).toEqual(["mz.display"]); // 새 기기 등록은 다음 실행 때
});

test("저장된 프로필이 있으면 홈에 피드 자리와 하단 메뉴가 보인다", async ({ page }) => {
  await seedStoredProfile(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "맞춤 공고" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
});

// 서비스워커(U6)가 등록된 페이지는 WebKit에서 page.route 가로채기를 거치지 않는다 → 끊김 흉내 테스트만 서비스워커를 막는다
test.describe("인터넷 끊김", () => {
  test.use({ serviceWorkers: "block" });

  test("서버 저장이 실패해도 기기에 저장되고, 다음에 앱을 열 때 다시 보낸다 (US-08, BR-U4-63·64)", async ({ page }) => {
    await page.goto("/profile/setup");
    await fillToReview(page);
    await page.route("**/api/profile", (route) => route.abort("internetdisconnected"));
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("이 휴대폰에는 저장했어요. 인터넷 연결을 확인해 주세요. 다음에 앱을 열 때 다시 보낼게요.")).toBeVisible();
    await page.getByRole("button", { name: /^(나중에|맞춤 공고 보러 가기)$/ }).click();
    await expect(page).toHaveURL(/\/$/);
    let stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
    expect(stored.sync.state).toBe("pending");

    await page.unroute("**/api/profile");
    const resent = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
    await page.reload();
    expect((await resent).status()).toBe(200);
    await expect
      .poll(async () => JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!).sync.state)
      .toBe("synced");
    stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
    expect(stored.profile.residence.sigungu).toBe("하남시");
  });
});
