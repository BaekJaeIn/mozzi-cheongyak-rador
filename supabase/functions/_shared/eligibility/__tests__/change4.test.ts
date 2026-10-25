// 변경 요청 4 예시 — 관심 지역(시도까지만), 신청 대상, 계층 모름 공급유형 (business-rules §12, business-logic-model §8.1)
import { describe, expect, it } from "vitest";
import type { HouseholdProfile, RegionPick } from "../../domain/profile.ts";
import { audienceBlocked, parseAudiences } from "../../domain/audiences.ts";
import { noticeStatus } from "../../domain/retention.ts";
import { makeNotice, makeProfile, makeUnit, REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import { judgeNotice } from "../engine.ts";
import { routesFor } from "../routes.ts";
import type { NoticeForJudgement } from "../types.ts";
import { isVisible } from "../visibility.ts";

const AS_OF = "2026-09-26"; // makeNotice 기본 접수 2026-09-25~30 → 접수 중

const GYEONGGI_PICKS = ["과천시", "광명시", "군포시", "부천시", "안양시", "의왕시"].map((sigungu) => ({ sido: "경기" as const, sigungu }));

/** 신고한 신혼 가구 (가상의 값 — 실제 가족 정보 아님): 예비신혼, 부천 거주, 관심 부천대장·광명시흥 + 경기 6곳 */
function reporter(): HouseholdProfile {
  const base = makeProfile({
    self: { birthDate: "1996-03-01" },
    spouse: { birthDate: "1998-05-01" },
    residence: { sido: "경기", sigungu: "부천시", years: 0 },
    housing: { homeless: true, homelessYears: 15, ownedCount: 0 },
  });
  return {
    ...base,
    householdKind: "newlywed",
    savings: { has: true, owner: "self", kind: "comprehensive", months: 84, paymentCount: 84, depositManwon: 600 },
    money: { ...base.money, monthlyIncome: 800, spouseMonthlyIncome: 300, spouseEarns: true, totalAsset: 15_000, carValue: 500 },
    newlywed: { marriage: "engaged", marriageDate: null, children: 0, neverOwnedHome: true, incomeTax5y: true, spouseSavings: null },
    prefs: { ...base.prefs, districtIds: ["daejang", "gwangmyeong_siheung"], regions: GYEONGGI_PICKS },
  };
}

const parents = (regions: RegionPick[] = GYEONGGI_PICKS) => makeProfile({ prefs: { districtIds: [], regions } });

function shown(profile: HouseholdProfile, notice: NoticeForJudgement): boolean {
  const j = judgeNotice(profile, notice, REFERENCE_2026, AS_OF);
  return isVisible({ verdict: j.verdict, inDistrict: j.inDistrict, status: noticeStatus(notice, AS_OF) });
}

const notice = (over: Partial<NoticeForJudgement>, units = [makeUnit("other")]) => makeNotice(units, { districtIds: [], ...over });

// U3가 지역·대상을 채운 뒤의 신고 공고 9건 (business-logic-model §8.1)
const REPORTED: [string, NoticeForJudgement][] = [
  ["연천BIX 경기행복주택 기업체 기숙사", notice({ regions: [{ sido: "경기", sigungu: "연천군" }], audiences: ["dormitory"] }, [makeUnit("happy_unknown")])],
  ["아크메르 동탄 95", notice({ regions: [{ sido: "경기", sigungu: "화성시" }] }, [makeUnit("private_sale_general", 84)])],
  ["아크메르 동탄 99", notice({ regions: [{ sido: "경기", sigungu: "화성시" }] }, [makeUnit("private_sale_general", 84)])],
  ["경기남부 일반 매입임대", notice({ regions: [{ sido: "경기", sigungu: null }], audiences: ["low_income"] })],
  ["시흥하중 A1 신혼희망타운", notice({ regions: [{ sido: "경기", sigungu: "시흥시" }], audiences: ["newlywed"] }, [makeUnit("newlywed_hope_town", 55)])],
  ["구리갈매 S1 10년 공공임대", notice({ regions: [{ sido: "경기", sigungu: "구리시" }] })],
  ["시흥거모 S-1 공공분양", notice({ regions: [{ sido: "경기", sigungu: "시흥시" }] }, [makeUnit("public_sale_general", 59)])],
  ["시흥거모지구 S-1블록 공공분양(본청약)", notice({ regions: [{ sido: "경기", sigungu: "시흥시" }] }, [makeUnit("public_sale_general", 59)])],
  ["경기도형 창업특화주택", notice({ regions: [{ sido: "경기", sigungu: null }], audiences: ["startup"] })],
];

describe("신고 공고 9건 (business-logic-model §8.1)", () => {
  it.each(REPORTED)("%s → 신혼 가구·부모님 가구 모두 안 보인다", (_title, n) => {
    expect(shown(reporter(), n)).toBe(false);
    expect(shown(parents(), n)).toBe(false);
  });

  it("대상이 막힌 공고는 미충족 + 쉬운 말 사유", () => {
    const j = judgeNotice(reporter(), REPORTED[0]![1], REFERENCE_2026, AS_OF);
    expect(j.verdict).toBe("ineligible");
    expect(j.units[0]).toMatchObject({
      verdict: "ineligible",
      routes: [],
      criteria: [{ key: "audience", verdict: "ineligible", code: "audience_dormitory", reason: "기업체 기숙사 공고예요. 회사가 직원을 위해 신청해요" }],
    });
    const senior = judgeNotice(parents(), REPORTED[8]![1], REFERENCE_2026, AS_OF);
    expect(senior.units[0]!.criteria.map((c) => c.code)).toEqual(["audience_startup"]);
    expect(senior.units[0]!.routes).toBeUndefined(); // 노부부 저장 형식 그대로
  });

  it("맞는 공고는 그대로 보인다: 부천대장 지구, 부천시 특화형 매입임대", () => {
    const daejang = notice({ districtIds: ["daejang"], regions: [{ sido: "경기", sigungu: "부천시" }] }, [makeUnit("public_sale_general", 59)]);
    const bucheon = notice({ regions: [{ sido: "경기", sigungu: "부천시" }, { sido: "경기", sigungu: "김포시" }] });
    expect(shown(reporter(), daejang)).toBe(true);
    expect(shown(reporter(), bucheon)).toBe(true);
  });
});

describe("관심 지역 — 시도까지만 공고 (BR-U2-E1)", () => {
  const sidoOnly = notice({ regions: [{ sido: "경기", sigungu: null }] });

  it("시군구만 고르면 숨김, '경기 전체'를 고르면 보임", () => {
    expect(judgeNotice(parents(), sidoOnly, REFERENCE_2026, AS_OF).inDistrict).toBe(false);
    expect(judgeNotice(parents([{ sido: "경기", sigungu: null }]), sidoOnly, REFERENCE_2026, AS_OF).inDistrict).toBe(true);
  });

  it("관심 지구로 묶인 공고는 지역 값과 상관없이 안 (BR-U2-E2)", () => {
    const n = notice({ districtIds: ["daejang"], regions: [{ sido: "경기", sigungu: null }] });
    expect(judgeNotice(reporter(), n, REFERENCE_2026, AS_OF).inDistrict).toBe(true);
  });
});

describe("신청 대상 (BR-U2-E10~E13)", () => {
  it("대상이 여럿이면 하나라도 맞으면 보인다 — 행복주택 청년·신혼·고령자", () => {
    const n = notice({ regions: [{ sido: "경기", sigungu: "부천시" }], audiences: ["youth", "newlywed", "senior"] }, [makeUnit("happy_unknown")]);
    expect(audienceBlocked("newlywed", n.audiences)).toBeNull();
    expect(audienceBlocked("senior", n.audiences)).toBeNull();
    expect(judgeNotice(reporter(), n, REFERENCE_2026, AS_OF).verdict).not.toBe("ineligible");
  });

  it("어르신 전용(은빛주택)은 부모님만, 신혼 전용은 신혼 가구만", () => {
    expect(audienceBlocked("senior", ["senior"])).toBeNull();
    expect(audienceBlocked("newlywed", ["senior"])).toBe("senior");
    expect(audienceBlocked("senior", ["newlywed"])).toBe("newlywed");
    expect(audienceBlocked("newlywed", ["newlywed"])).toBeNull();
  });

  it("막힌 대상이 여럿이면 표 순서 첫 번째가 사유", () => {
    expect(audienceBlocked("newlywed", ["low_income", "youth", "disabled"])).toBe("youth");
  });

  it("대상이 없으면(누구나·모름) 판정대로 — 분류 못 한 공고는 확인 필요", () => {
    const n = notice({ regions: [{ sido: "경기", sigungu: "부천시" }] });
    expect(judgeNotice(reporter(), n, REFERENCE_2026, AS_OF).verdict).toBe("unknown");
  });

  it("DB 값 읽기: 형식이 틀린 값은 버리고 표 순서·중복 없이", () => {
    expect(parseAudiences(["senior", "dormitory", "senior", "모름", 3])).toEqual(["dormitory", "senior"]);
    expect(parseAudiences(null)).toEqual([]);
  });
});

describe("계층 모름 공급유형 (BR-U2-E20~E22)", () => {
  it("신혼 가구: 계층 모름은 신혼부부 몫 임대, 고령자 계층은 미충족", () => {
    expect(routesFor("newlywed", "national_rental_unknown")).toEqual(["rental_newlywed"]);
    expect(routesFor("newlywed", "national_rental_senior")).toEqual([]);
    const senior = judgeNotice(reporter(), notice({ regions: [{ sido: "경기", sigungu: "부천시" }] }, [makeUnit("happy_senior")]), REFERENCE_2026, AS_OF);
    expect(senior.units[0]).toMatchObject({ verdict: "ineligible", criteria: [{ code: "type_senior_only", reason: "어르신 대상 주택이에요" }] });
  });

  it("부모님 가구: 계층 모름도 어르신 몫과 같은 판정 (이름만 다름)", () => {
    const p = parents();
    const a = judgeNotice(p, notice({ regions: [{ sido: "경기", sigungu: "부천시" }] }, [{ ...makeUnit("happy_senior"), id: "u" }]), REFERENCE_2026, AS_OF);
    const b = judgeNotice(p, notice({ regions: [{ sido: "경기", sigungu: "부천시" }] }, [{ ...makeUnit("happy_unknown"), id: "u" }]), REFERENCE_2026, AS_OF);
    expect(b.units.map((u) => ({ ...u, supplyType: "x" }))).toEqual(a.units.map((u) => ({ ...u, supplyType: "x" })));
    expect(b.verdict).toBe(a.verdict);
  });
});
