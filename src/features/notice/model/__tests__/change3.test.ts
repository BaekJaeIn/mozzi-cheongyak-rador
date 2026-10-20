// U5 변경 3 예시 — 신청 방법 표시, 카드 한 줄, 볼 점 절, 금액 꼬리, 링크 (business-rules §17)
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import type { UnitJudgement } from "@shared/eligibility/types.ts";
import { routeHintOf } from "@shared/feed/visible.ts";
import { describe, expect, it } from "vitest";
import { makeProfile } from "@shared/__tests__/fixtures.ts";
import type { UnitInfo } from "../api-types";
import { groupJudgement, routeHintText, settingsLinkFor, showChildHint, summarySection, withEuro, withUserValue } from "../judgement";

const ok = { key: "income" as const, verdict: "eligible" as const, code: "income_ok", reason: "월 1,000만원 이하", userValue: "monthlyIncome" as const };
const need = { key: "marriage" as const, verdict: "unknown" as const, code: "marriage_unknown", reason: "혼인 7년 이내", action: "설정에서 혼인 상태를 입력하면 정확히 알려 드려요" };
const no = { key: "firstTime" as const, verdict: "ineligible" as const, code: "first_time_owned", reason: "집을 가진 적이 없어야 해요" };

const unit = (id: string, routes: NonNullable<UnitJudgement["routes"]>, supplyType = "public_sale_general"): UnitJudgement => {
  const best = routes[0]!;
  return { unitId: id, supplyType, verdict: best.verdict, criteria: best.criteria, routes };
};
const INFO: UnitInfo[] = [
  { id: "a", label: null, supplyType: "public_sale_general", plain: "공공분양", formal: "공공분양 일반공급", exclusiveAreaM2: 59, supplyCount: 10 },
  { id: "b", label: null, supplyType: "public_sale_general", plain: "공공분양", formal: "공공분양 일반공급", exclusiveAreaM2: 84, supplyCount: 10 },
];

const NEWLYWED: HouseholdProfile = {
  ...makeProfile(),
  householdKind: "newlywed",
  money: { monthlyIncome: 550, spouseMonthlyIncome: 250, totalAsset: 8000, carValue: 0, spouseEarns: true },
  newlywed: { marriage: "engaged", marriageDate: "2027-03-01", children: 1, neverOwnedHome: true, incomeTax5y: true, spouseSavings: null },
};

describe("판정 이유 — 신청 방법 (BR-U5-D10~D14)", () => {
  it("방법은 판정 → 방법 표 순서, 첫 방법이 묶음 판정", () => {
    const g = groupJudgement(
      [
        unit("a", [
          { route: "general", verdict: "eligible", criteria: [ok] },
          { route: "first_time", verdict: "ineligible", criteria: [no] },
          { route: "newlywed_special", verdict: "eligible", criteria: [ok] },
        ]),
      ],
      INFO,
    )[0]!;
    expect(g.routes.map((r) => [r.route, r.verdict])).toEqual([["newlywed_special", "eligible"], ["general", "eligible"], ["first_time", "ineligible"]]);
    expect(g.routes[0]!.label).toBe("신혼부부 특별공급");
    expect(g.verdict).toBe("eligible");
  });

  it("같은 유형이라도 방법별 결과가 다르면 따로 묶는다", () => {
    const groups = groupJudgement(
      [
        unit("a", [{ route: "newlywed_special", verdict: "eligible", criteria: [ok] }, { route: "general", verdict: "unknown", criteria: [need] }]),
        unit("b", [{ route: "newlywed_special", verdict: "eligible", criteria: [ok] }, { route: "general", verdict: "ineligible", criteria: [no] }]),
      ],
      INFO,
    );
    expect(groups).toHaveLength(2);
  });

  it("노부부 판정(routes 없음)은 routes가 빈 목록", () => {
    const g = groupJudgement([{ unitId: "a", supplyType: "public_sale_general", verdict: "eligible", criteria: [ok] }], INFO)[0]!;
    expect(g.routes).toEqual([]);
  });

  it("자녀 안내: 자녀 있음 + 신혼 특공·신혼희망타운 + 미충족 아님", () => {
    const r = (route: "newlywed_special" | "general" | "newlywed_hope", verdict: "eligible" | "ineligible") => ({ route, label: "", verdict, criteria: [] });
    expect(showChildHint(r("newlywed_special", "eligible"), NEWLYWED)).toBe(true);
    expect(showChildHint(r("newlywed_hope", "eligible"), NEWLYWED)).toBe(true);
    expect(showChildHint(r("general", "eligible"), NEWLYWED)).toBe(false);
    expect(showChildHint(r("newlywed_special", "ineligible"), NEWLYWED)).toBe(false);
    expect(showChildHint(r("newlywed_special", "eligible"), { ...NEWLYWED, newlywed: { ...NEWLYWED.newlywed!, children: 0 } })).toBe(false);
    expect(showChildHint(r("newlywed_special", "eligible"), makeProfile())).toBe(false);
  });
});

describe("피드 카드 한 줄 (BR-U5-D20~D22)", () => {
  it("충족 방법만, 없으면 확인 필요 방법. 미충족 주택형은 빼고 방법 표 순서", () => {
    const units = [
      unit("a", [{ route: "general", verdict: "eligible", criteria: [] }, { route: "newlywed_special", verdict: "unknown", criteria: [] }]),
      unit("b", [{ route: "first_time", verdict: "eligible", criteria: [] }]),
      unit("c", [{ route: "rental_newlywed", verdict: "ineligible", criteria: [] }]),
    ];
    expect(routeHintOf(units)).toEqual({ verdict: "eligible", routes: ["first_time", "general"] });
    expect(routeHintOf([unit("a", [{ route: "newlywed_hope", verdict: "unknown", criteria: [] }])])).toEqual({ verdict: "unknown", routes: ["newlywed_hope"] });
    expect(routeHintOf([{ unitId: "a", supplyType: "x", verdict: "eligible", criteria: [] }])).toBeUndefined();
  });

  it("문구: 2개까지 + 외 N개, 으로/로", () => {
    expect(routeHintText({ verdict: "eligible", routes: ["newlywed_special", "first_time"] })).toBe("신혼부부 특별공급·생애최초 특별공급으로 신청할 수 있어 보여요");
    expect(routeHintText({ verdict: "unknown", routes: ["rental_newlywed"] })).toBe("신혼부부 몫 임대로 신청할 수 있는지 확인이 필요해요");
    expect(routeHintText({ verdict: "eligible", routes: ["newlywed_special", "first_time", "general"] })).toBe("신혼부부 특별공급·생애최초 특별공급 외 1개로 신청할 수 있어 보여요");
    expect(withEuro("신혼희망타운")).toBe("신혼희망타운으로");
    expect(withEuro("일반공급")).toBe("일반공급으로");
  });
});

describe("볼 점 절·금액·링크 (BR-U5-D1~D3·D30·D31)", () => {
  const s = { eligibilityPlain: "가", forSeniorCouple: "노부부 글" };
  it("가구 종류 것만, 신혼 글이 없으면 준비 중", () => {
    expect(summarySection(s, "senior")).toEqual({ title: "노부부 가구가 볼 점", text: "노부부 글" });
    expect(summarySection(s, null)).toEqual({ title: "노부부 가구가 볼 점", text: "노부부 글" });
    expect(summarySection(s, "newlywed")).toEqual({ title: "신혼부부가 볼 점", text: null });
    expect(summarySection({ ...s, forNewlywed: "신혼 글" }, "newlywed")).toEqual({ title: "신혼부부가 볼 점", text: "신혼 글" });
  });

  it("신혼 소득은 두 분 합계, 노부부는 그대로", () => {
    expect(withUserValue(ok, NEWLYWED)).toBe("입력하신 금액 월 550만원(두 분 합계)");
    expect(withUserValue(ok, makeProfile({ money: { monthlyIncome: 450, totalAsset: null, carValue: null, spouseEarns: null } }))).toBe("입력하신 금액 월 450만원");
  });

  it("혼인 조건 고치기 → 결혼·자녀 그룹, 생애최초 → 집 그룹", () => {
    expect(settingsLinkFor(need)).toBe("/profile/edit/marriage");
    expect(settingsLinkFor({ ...no, verdict: "unknown", action: "설정에서 집 정보를 입력하면 정확히 알려 드려요" })).toBe("/profile/edit/housing");
  });
});
