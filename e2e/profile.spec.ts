// E2E — 내 정보 입력·설정 (U4: US-02·04~09·18·19·20·21, 변경 3 US-22·23·26, 접근성 NFR-1)
// 실행 전제: 로컬 Supabase(Docker) + 마이그레이션 적용 + .env.local (CI db-and-e2e)
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { pressBack, releaseRegistrationLimit, SAMPLE_PROFILE_V1, seedStoredProfile } from "./helpers";

test.beforeEach(releaseRegistrationLimit);

const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true }).click();
const unknown = (page: Page) => page.getByRole("button", { name: "잘 모르겠어요" }).click();
const pick = (page: Page, name: string) => page.getByRole("radio", { name, exact: true }).click();
const heading = (page: Page, name: string) => expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

/** 가구 종류 첫 화면 (변경 3 BR-U4-D1). 보기 이름 뒤에 설명이 붙어 있어 앞부분으로 찾는다 */
async function pickKind(page: Page, kind: "노부부·어르신" | "신혼부부·예비신혼부부") {
  await heading(page, "어떤 가구의 공고를 찾으세요?");
  await page.getByRole("radio", { name: new RegExp(`^${kind}`) }).click();
  await next(page);
}

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
  await pickKind(page, "노부부·어르신");
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
  await heading(page, "부부 중 청약통장이 있는 분이 있나요?"); // 변경 2 (FR-C2-1)
  await pick(page, "없음");
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
  await heading(page, "다른 지역도 볼까요?"); // 변경 2: 사는 시군구를 미리 골라 둔다 (BR-U4-C11)
  await expect(page.getByRole("checkbox", { name: "하남시" })).toHaveAttribute("aria-checked", "true");
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
  expect(stored.profile).toMatchObject({ schemaVersion: 3, householdKind: "senior", newlywed: null, savings: { has: false, owner: null }, prefs: { regions: [{ sido: "경기", sigungu: "하남시" }] } });
  expect(await page.evaluate(() => window.localStorage.getItem("mz.profile.draft"))).toBeNull();
  // 처음 설치한 사람에게는 업데이트 안내 창·띠가 없다 (FR-C2-18)
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "새로 바뀐 점" })).toHaveCount(0);
  await expect(page.getByText("새 항목을 입력하면 공고를 더 정확히 골라 드려요.")).toHaveCount(0);
});

test("중간에 새로고침해도 입력하던 화면부터 이어서 한다 (US-04, BR-U4-02)", async ({ page }) => {
  await page.goto("/profile/setup");
  await pickKind(page, "노부부·어르신");
  await pickBirth(page, 1958, 12, 31);
  await next(page);
  await pick(page, "혼자");
  await next(page);
  await heading(page, "주민등록상 세대주는 누구인가요?");
  await page.goto("/");
  await expect(page).toHaveURL(/\/profile\/setup$/);
  await heading(page, "주민등록상 세대주는 누구인가요?");
  await page.getByRole("button", { name: "처음부터 다시" }).click();
  await heading(page, "어떤 가구의 공고를 찾으세요?");
});

test("금액이 흔한 범위를 크게 넘으면 한 번 더 묻는다 (US-06, BR-U4-42)", async ({ page }) => {
  await page.goto("/profile/setup");
  await pickKind(page, "노부부·어르신");
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

test("설정: 그룹 고치기, 알림 시각 즉시 저장, 큰 글씨 유지 (US-09·18·19)", async ({ page }) => {
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

  // 큰 글씨(쉬운 모드): 상단 토글로 즉시 적용, 새로고침 후 유지, 가로 스크롤 없음
  await page.getByRole("radiogroup", { name: "글씨 크기" }).getByRole("radio", { name: "큰 글씨" }).click();
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

test("첫 화면 위쪽 [작은 글씨 | 큰 글씨] 토글로 쉬운 모드를 바로 켜고 끈다 (2026-10-17 요청)", async ({ page }) => {
  await page.goto("/");
  await heading(page, "내 정보를 넣으면 맞는 공고만 골라 드려요");
  const size = page.getByRole("radiogroup", { name: "글씨 크기" });
  await expect(size.getByRole("radio", { name: "작은 글씨" })).toHaveAttribute("aria-checked", "true");
  await size.getByRole("radio", { name: "큰 글씨" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
  await expect(size.getByRole("radio", { name: "큰 글씨" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "easy");
  await expect(size.getByRole("radio", { name: "큰 글씨" })).toHaveAttribute("aria-checked", "true");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page);

  await seedStoredProfile(page);
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: "쉬운 모드" })).toHaveCount(0); // 설정 화면에서는 뺐다
  await expect(size.getByRole("radio", { name: "큰 글씨" })).toHaveAttribute("aria-checked", "true");
  await size.getByRole("radio", { name: "작은 글씨" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "normal");
});

// ---------- 변경 요청 2: 업데이트 안내 (US-21) ----------

const dialog = (page: Page) => page.getByRole("dialog", { name: "새로 바뀐 점" });
const banner = (page: Page) => page.getByText("새 항목을 입력하면 공고를 더 정확히 골라 드려요.");

test("업데이트 안내: 예전 정보가 있는 휴대폰 → 창 → 새 항목만 입력 → 저장하면 띠가 사라지고 창도 다시 안 뜬다 (US-21)", async ({ page }) => {
  test.slow();
  await seedStoredProfile(page, SAMPLE_PROFILE_V1); // 엄마 휴대폰: 부부, 통장 "없음"으로 넣었던 정보
  await page.goto("/");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText("부부 중 한 분만 청약통장이 있어도 같은 공고를 보여 드려요.")).toBeVisible();
  await axe(page);
  await dialog(page).getByRole("button", { name: "지금 입력하기" }).click();

  await expect(page).toHaveURL(/\/profile\/update$/);
  await heading(page, "부부 중 청약통장이 있는 분이 있나요?");
  await expect(page.getByText("새 항목 1/2")).toBeVisible();
  await page.getByRole("radio", { name: /^배우자 / }).click(); // 이름에 설명이 붙어 읽힌다 (BR-U4-C5)
  await next(page);
  await heading(page, "배우자분 통장은 어떤 통장인가요?"); // 예전에 "없음"이었으니 자세한 정보도 묻는다 (Q3=A)
  await page.getByRole("radio", { name: /^주택청약종합저축/ }).click();
  await next(page);
  await heading(page, "배우자분 통장에 가입하신 지 얼마나 되셨나요?");
  await unknown(page);
  await unknown(page); // 통장 금액
  await heading(page, "다른 지역도 볼까요?");
  await expect(page.getByRole("checkbox", { name: "하남시" })).toHaveAttribute("aria-checked", "true"); // 사는 곳을 미리 골라 둠
  await page.getByRole("radio", { name: /서울/ }).click();
  await page.getByRole("checkbox", { name: "강서구" }).click();
  await expect(page.getByText("서울 강서구, 경기 하남시")).toBeVisible();
  await axe(page);

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await heading(page, "내 정보를 저장했어요");
  await page.getByRole("button", { name: "맞춤 공고 보러 가기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible({ timeout: 15_000 });
  await expect(banner(page)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);

  const stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
  expect(stored.profile).toMatchObject({
    schemaVersion: 3,
    householdKind: "senior",
    savings: { has: true, owner: "spouse", kind: "comprehensive" },
    prefs: { districtIds: SAMPLE_PROFILE_V1.prefs.districtIds, regions: [{ sido: "서울", sigungu: "강서구" }, { sido: "경기", sigungu: "하남시" }] },
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible({ timeout: 15_000 });
  await expect(dialog(page)).toHaveCount(0);
});

test("업데이트 안내: [나중에]·뒤로 버튼은 창만 닫고 띠가 남는다, 띠의 [입력하기]로 다시 들어간다 (US-21)", async ({ page }) => {
  await seedStoredProfile(page, SAMPLE_PROFILE_V1);
  await page.goto("/");
  await expect(dialog(page)).toBeVisible();
  await pressBack(page); // 뒤로 버튼 = [나중에] (BR-U4-C25)
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(banner(page)).toBeVisible();

  await page.reload(); // 창은 한 번만
  await expect(banner(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);

  await page.getByRole("button", { name: "입력하기", exact: true }).click();
  await heading(page, "부부 중 청약통장이 있는 분이 있나요?");
  await page.getByRole("button", { name: "나중에 할게요" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(banner(page)).toBeVisible();
});

test("관심 지역 고치기: 3기 신도시를 모두 빼고 다른 지역도 비면 막고, '서울 전체'를 고르면 저장 (BR-U4-C13·C16)", async ({ page }) => {
  await seedStoredProfile(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: "관심 지역 고치기", exact: true }).click();
  await heading(page, "관심 있는 3기 신도시를 골라 주세요");
  const checked = page.getByRole("checkbox", { checked: true });
  while ((await checked.count()) > 0) await checked.first().click();
  await next(page);
  await heading(page, "다른 지역도 볼까요?");
  await next(page);
  await expect(page.getByText("3기 신도시나 다른 지역을 한 곳 이상 골라 주세요.")).toBeVisible();

  await page.getByRole("radio", { name: /서울/ }).click();
  await page.getByRole("checkbox", { name: "서울 전체" }).click();
  await expect(page.getByRole("checkbox", { name: "강서구" })).toHaveAttribute("aria-disabled", "true");
  await next(page);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장" }).click();
  expect((await saved).status()).toBe(200);
  await expect(page).toHaveURL(/\/settings\?saved=synced$/);
  await expect(page.getByText("서울 전체", { exact: true })).toBeVisible();
});

test("큰 글씨에서도 다른 지역 화면·새로 바뀐 점 창에 가로 스크롤이 없다 (NFR-C2-5)", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mz.display", "easy"));
  await seedStoredProfile(page, SAMPLE_PROFILE_V1);
  await page.goto("/");
  await expect(dialog(page)).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await dialog(page).getByRole("button", { name: "지금 입력하기" }).click();
  await pick(page, "나");
  await next(page);
  await unknown(page); // 통장 종류
  await unknown(page); // 가입 기간
  await unknown(page); // 금액
  await heading(page, "다른 지역도 볼까요?");
  await page.getByRole("radio", { name: /경기/ }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await axe(page);
});

// ---------- 변경 3: 가구 종류·신혼 입력 (US-22·23·26) ----------

/** 잘 모르겠어요가 있으면 누르고, 없으면 [다음] — 확인 화면까지 */
async function skipToReview(page: Page) {
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("heading", { level: 1, name: "입력하신 내용을 확인해 주세요" }).isVisible()) return;
    const dunno = page.getByRole("button", { name: "잘 모르겠어요" });
    if (await dunno.isVisible()) await dunno.click();
    else await next(page);
  }
  throw new Error("확인 화면에 닿지 못했어요");
}

test("신혼 가구 처음 입력: 결혼·자녀·생애최초·부부 각자 통장·소득을 묻고 서버에 v3로 저장 (US-22·23)", async ({ page }) => {
  test.slow();
  await page.goto("/profile/setup");
  await axe(page);
  await pickKind(page, "신혼부부·예비신혼부부");
  await pickBirth(page, 1996, 4, 12);
  await next(page);
  await heading(page, "배우자분(결혼할 분)의 생년월일을 골라 주세요"); // 가구 구성 화면 없음 (BR-U4-D10)
  await pickBirth(page, 1997, 9, 3);
  await next(page);
  await pick(page, "나"); // 세대주
  await next(page);
  await heading(page, "혼인신고를 하셨나요?");
  await page.getByRole("radio", { name: /^결혼할 예정이에요/ }).click();
  await next(page);
  await heading(page, "혼인신고 예정은 언제쯤인가요?"); // 연·월만 (BR-U4-D13)
  await expect(page.getByLabel("날")).toHaveCount(0);
  await page.getByLabel("해").selectOption("2027");
  await page.getByLabel("달").selectOption("3");
  await expect(page.getByText("2027년 3월 예정")).toBeVisible();
  await axe(page);
  await next(page);
  await pick(page, "없어요"); // 자녀
  await next(page);
  await pick(page, "경기");
  await pick(page, "안양시");
  await next(page);
  await pick(page, "2~3년");
  await next(page);
  await heading(page, "지금 집을 가지고 계신가요?");
  await pick(page, "아니오");
  await next(page);
  await pick(page, "1년 미만");
  await next(page);
  await heading(page, "두 분 모두 지금까지 집을 가져 본 적이 없나요?");
  await pick(page, "네, 한 번도 없어요");
  await next(page);
  await heading(page, "두 분 중 소득세를 5년 이상 낸 분이 있나요?");
  await pick(page, "네");
  await next(page);
  await heading(page, "부부 중 청약통장이 있는 분이 있나요?");
  await page.getByRole("radio", { name: /^두 분 다/ }).click();
  await expect(page.getByText("두 분 통장을 각각 넣어 주세요. 조건에 맞는 통장으로 신청하면 돼요.")).toBeVisible(); // BR-U4-D21
  await next(page);
  await heading(page, "내 통장은 어떤 통장인가요?");
  await page.getByRole("radio", { name: /^주택청약종합저축/ }).click();
  await next(page);
  await pick(page, "1~2년");
  await page.getByRole("textbox", { name: "납입 횟수", exact: true }).fill("15");
  await next(page);
  await page.getByRole("textbox", { name: "통장 금액", exact: true }).fill("300");
  await next(page);
  await heading(page, "배우자분 통장은 어떤 통장인가요?");
  await page.getByRole("radio", { name: /^주택청약종합저축/ }).click();
  await next(page);
  await pick(page, "2~5년");
  await page.getByRole("textbox", { name: "배우자 통장 납입 횟수" }).fill("30");
  await next(page);
  await page.getByRole("textbox", { name: "배우자 통장 금액" }).fill("600");
  await next(page);
  await heading(page, "본인 월소득(세금 떼기 전)은 얼마인가요?");
  await page.getByRole("textbox", { name: "본인 월소득" }).fill("300");
  await next(page);
  await heading(page, "배우자분 월소득(세금 떼기 전)은 얼마인가요?");
  await page.getByRole("button", { name: "소득 없어요" }).click(); // BR-U4-D30
  await expect(page.getByText("월 0원")).toBeVisible();
  await next(page);
  await heading(page, "두 분의 총자산은 얼마인가요?");
  await page.getByRole("textbox", { name: "총자산" }).fill("8000");
  await next(page);
  await page.getByRole("textbox", { name: "자동차 값" }).fill("0");
  await next(page); // 복지 화면 없음 (BR-U4-D11)
  await heading(page, "관심 있는 3기 신도시를 골라 주세요");
  await next(page);
  await expect(page.getByRole("checkbox", { name: "안양시" })).toHaveAttribute("aria-checked", "true");
  await next(page);
  await next(page);
  await next(page);
  await heading(page, "입력하신 내용을 확인해 주세요");
  await expect(page.getByText("신혼부부·예비신혼부부")).toBeVisible();
  await expect(page.getByText("예비신혼 · 2027년 3월 예정 · 자녀 없음")).toBeVisible();
  await expect(page.getByText("본인 월 300만원 · 배우자 월 0원 · 자산 8,000만원 · 자동차 0원")).toBeVisible();
  await axe(page);

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장" }).click();
  expect((await saved).status()).toBe(200); // 서버 v3 검증·배우자 소득 암호화 (U2)
  await skipNotify(page);
  const stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
  expect(stored.sync.state).toBe("synced");
  expect(stored.profile).toMatchObject({
    schemaVersion: 3,
    householdKind: "newlywed",
    householdType: "couple",
    householdSize: 2,
    welfare: null,
    money: { monthlyIncome: 300, spouseMonthlyIncome: 0, spouseEarns: false },
    newlywed: { marriage: "engaged", marriageDate: "2027-03-01", children: 0, neverOwnedHome: true, incomeTax5y: true, spouseSavings: { has: true, owner: "spouse", months: 24 } },
  });

  await page.goto("/settings");
  await heading(page, "설정");
  await expect(page.getByText("결혼·자녀")).toBeVisible(); // 신혼 그룹 8개 (BR-U4-D50)
  await expect(page.getByText("내 통장 주택청약종합저축 1~2년 · 배우자 통장 주택청약종합저축 2~5년")).toBeVisible();
  await axe(page);
});

test("부모님 휴대폰(v2 프로필): 새 창·띠 없이 그대로, 설정에 '가구 종류: 노부부·어르신' (US-26)", async ({ page }) => {
  await seedStoredProfile(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "맞춤 공고" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "새로 바뀐 점" })).toHaveCount(0);
  await expect(page.getByText("새 항목을 입력하면 공고를 더 정확히 골라 드려요.")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByText("노부부·어르신")).toBeVisible();
  await expect(page.getByText("결혼·자녀")).toHaveCount(0);
  await expect(page.getByText("경기 하남시 · 5~10년")).toBeVisible();
});

test("가구 종류 바꾸기: [그만두기]·뒤로는 그대로, [바꾸기] → 처음부터 다시 → 저장해야 신혼으로 (BR-U4-D40~D46)", async ({ page }) => {
  test.slow();
  await seedStoredProfile(page);
  await page.goto("/settings");
  const change = page.getByRole("button", { name: "가구 종류 바꾸기" });
  const dialog = page.getByRole("alertdialog", { name: "가구 종류를 바꿀까요?" });

  await change.click();
  await expect(dialog).toBeVisible();
  await axe(page);
  await dialog.getByRole("button", { name: "그만두기" }).click();
  await expect(dialog).toHaveCount(0);

  await change.click();
  await pressBack(page);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);

  await change.click();
  await dialog.getByRole("button", { name: "바꾸기" }).click();
  await expect(page).toHaveURL(/\/profile\/setup\?redo=1&kind=newlywed$/);
  await heading(page, "이 휴대폰을 쓰시는 분의 생년월일을 골라 주세요"); // 가구 종류 화면 없이 첫 화면
  await expect(page.getByText(/1960년 3월 2일/)).toBeVisible(); // 지금 값 채움 (범위 밖이어도 넓힘, BR-U4-D12)
  // 저장 전에 나가면 그대로 (BR-U4-D43)
  await page.getByRole("button", { name: "이전" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("노부부·어르신")).toBeVisible();

  await change.click();
  await dialog.getByRole("button", { name: "바꾸기" }).click();
  await heading(page, "이 휴대폰을 쓰시는 분의 생년월일을 골라 주세요");
  await skipToReview(page);
  await expect(page.getByText("신혼부부·예비신혼부부")).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/profile") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "저장" }).click();
  expect((await saved).status()).toBe(200);
  await expect(page).toHaveURL(/\/settings\?saved=synced$/);
  await expect(page.getByText("신혼부부·예비신혼부부")).toBeVisible();
  await expect(page.getByText("결혼·자녀")).toBeVisible();
  const stored = JSON.parse((await page.evaluate(() => window.localStorage.getItem("mz.profile")))!);
  expect(stored.profile).toMatchObject({ householdKind: "newlywed", welfare: null, residence: { sido: "경기", sigungu: "하남시" } });
});

test("큰 글씨에서도 신혼 화면에 가로 스크롤이 없다 (NFR-C3-4)", async ({ page }) => {
  await page.goto("/profile/setup");
  await page.getByRole("radiogroup", { name: "글씨 크기" }).getByRole("radio", { name: "큰 글씨" }).click();
  await pickKind(page, "신혼부부·예비신혼부부");
  await pickBirth(page, 1996, 4, 12);
  await next(page);
  await unknown(page); // 배우자 생년월일
  await unknown(page); // 세대주
  await page.getByRole("radio", { name: /^혼인신고를 했어요/ }).click();
  await next(page);
  await heading(page, "혼인신고 한 날을 골라 주세요");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axe(page);
});
