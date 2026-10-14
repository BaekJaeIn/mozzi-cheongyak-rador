// 예시 기반 테스트 — 도메인 (만 나이, 시도, 면적, 분류, 지구 매칭, 요건 검증·확정)
import { describe, expect, it } from "vitest";
import { ageAt, areaBandOf, normalizeSido, validateProfile } from "../profile.ts";
import { classifySupplyType } from "../supply-types.ts";
import { matchDistricts } from "../district-matcher.ts";
import { validateRequirements } from "../requirements.ts";
import { resolveRequirements } from "../requirement-resolver.ts";
import { DISTRICTS, STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";
import { makeProfile } from "../../__tests__/fixtures.ts";

describe("ageAt (BR-U2-36)", () => {
  it("생일 전날·당일", () => {
    expect(ageAt("1961-09-15", "2026-09-14")).toBe(64);
    expect(ageAt("1961-09-15", "2026-09-15")).toBe(65);
  });
  it("2월 29일생은 평년 3월 1일에 나이가 든다", () => {
    expect(ageAt("1960-02-29", "2025-02-28")).toBe(64);
    expect(ageAt("1960-02-29", "2025-03-01")).toBe(65);
    expect(ageAt("1960-02-29", "2024-02-29")).toBe(64);
  });
});

describe("normalizeSido / areaBandOf", () => {
  it("정식 이름을 줄임 이름으로", () => {
    expect(normalizeSido("서울특별시")).toBe("서울");
    expect(normalizeSido("경기도")).toBe("경기");
    expect(normalizeSido(" 인천 광역시 ")).toBe("인천");
    expect(normalizeSido("전북특별자치도")).toBe("전북");
  });
  it("면적 구간 경계 (BR-U2-60)", () => {
    expect([40, 40.01, 60, 60.01, 85, 85.01].map(areaBandOf)).toEqual(["xs", "s", "s", "m", "m", "l"]);
  });
});

describe("validateProfile", () => {
  it("예시 프로필은 통과", () => {
    expect(validateProfile(makeProfile()).ok).toBe(true);
  });
  it("범위 밖 금액·빈 관심 지구·잘못된 날짜는 거부 (BR-U2-72)", () => {
    const bad = validateProfile(
      makeProfile({ money: { monthlyIncome: 1_000_001 }, prefs: { districtIds: [] }, self: { birthDate: "1960-02-30" } }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual(expect.arrayContaining(["money", "prefs", "self.birthDate"]));
  });
});

describe("classifySupplyType (BR-U2-10~19)", () => {
  const cases: [string, string | undefined, string][] = [
    ["하남교산 A2 행복주택 입주자 모집", undefined, "happy_senior"],
    ["남양주왕숙 고령자복지주택(영구임대)", undefined, "senior_welfare"],
    ["고양창릉 영구임대 예비입주자", undefined, "permanent_rental_senior"],
    ["부천대장 국민임대 고령자 우선공급", undefined, "national_rental_senior"],
    ["인천계양 통합공공임대주택", undefined, "integrated_rental"],
    ["광명시흥 뉴:홈 공공분양", undefined, "public_sale_general"],
    ["래미안 왕숙 행복주택 무순위 잔여세대", undefined, "unranked"],
    ["힐스테이트 교산", "applyhome", "private_sale_general"],
    ["무엇인지 모르는 공고", undefined, "other"],
  ];
  it.each(cases)("%s → %s", (text, source, expected) => {
    expect(classifySupplyType({ text, source: source as "applyhome" | undefined })).toBe(expected);
  });
});

describe("matchDistricts (BR-U2-01~06)", () => {
  it("단독 키워드", () => {
    expect(matchDistricts({ title: "하남교산 A2블록 행복주택" }, DISTRICTS)).toEqual(["gyosan"]);
  });
  it("성남 대장동은 부천 대장이 아니다", () => {
    expect(matchDistricts({ title: "성남 대장동 공공분양", location: "경기도 성남시 분당구 대장동" }, DISTRICTS)).toEqual([]);
  });
  it("부천시 + 대장동이면 부천 대장", () => {
    expect(matchDistricts({ title: "공공분양 A3", location: "경기도 부천시 대장동" }, DISTRICTS)).toEqual(["daejang"]);
  });
  it("하남시 미사는 교산이 아니다 (시군구만 맞으면 제외)", () => {
    expect(matchDistricts({ title: "미사강변 행복주택", location: "경기도 하남시 망월동" }, DISTRICTS)).toEqual([]);
  });
  it("여러 지구, sortOrder 순", () => {
    expect(matchDistricts({ title: "광명시흥·왕숙 통합 공고" }, DISTRICTS)).toEqual(["wangsuk", "gwangmyeong_siheung"]);
  });
  it("고양시 덕양구는 '덕양구'만 있어도 시군구로 인정", () => {
    expect(matchDistricts({ title: "공공임대", location: "덕양구 화전동" }, DISTRICTS)).toEqual(["changneung"]);
  });
});

describe("validateRequirements", () => {
  it("표준 요건은 모두 형식 검증을 통과", () => {
    for (const req of Object.values(STANDARD_REQUIREMENTS)) {
      expect(validateRequirements(JSON.parse(JSON.stringify(req)))).not.toBeNull();
    }
  });
  it("모르는 키·잘못된 값이 하나라도 있으면 전체를 버린다", () => {
    expect(validateRequirements({ age: { minAge: 65, who: "member" }, foo: 1 })).toBeNull();
    expect(validateRequirements({ asset: { maxManwon: -1 } })).toBeNull();
    expect(validateRequirements("text")).toBeNull();
  });
  it("거주 시도 이름을 줄임 이름으로 맞춘다", () => {
    expect(validateRequirements({ residence: { sidoIn: ["경기도", "서울특별시"] } })).toEqual({ residence: { sidoIn: ["경기", "서울"] } });
  });
});

describe("resolveRequirements (BR-U2-20~28)", () => {
  const S = STANDARD_REQUIREMENTS.happy_senior;
  it("추출 없음 → 표준", () => expect(resolveRequirements(S, null)).toBe(S));
  it("구조 조건이 다르면 unknown", () => {
    expect(resolveRequirements(S, { age: { minAge: 60, who: "member" } }).age).toBe("unknown");
  });
  it("금액 조건은 공고 값 (범위 안)", () => {
    expect(resolveRequirements(S, { asset: { maxManwon: 36_100 } }).asset).toEqual({ maxManwon: 36_100 });
  });
  it("금액이 표준의 2배를 넘으면 추출 오류로 보고 unknown", () => {
    expect(resolveRequirements(S, { car: { maxManwon: 50_000 } }).car).toBe("unknown");
  });
  it("공고가 조건을 추가하면 반영, 추출에 없는 표준 조건은 유지", () => {
    const r = resolveRequirements(S, { residence: { sidoIn: ["경기"] } });
    expect(r.residence).toEqual({ sidoIn: ["경기"] });
    expect(r.age).toEqual(S.age);
  });
  it("소득 기준 종류가 다르면 unknown", () => {
    expect(resolveRequirements(S, { income: { basis: "median", percent: 100 } }).income).toBe("unknown");
  });
  it("분류 실패는 추출로 보완 (BR-U2-28)", () => {
    expect(resolveRequirements({ unclassified: true }, { homeless: { minYears: null } })).toEqual({ homeless: { minYears: null } });
    expect(resolveRequirements({ unclassified: true }, {})).toEqual({ unclassified: true });
  });
  it("표준이 unknown이면 추출 값 (BR-U2-26)", () => {
    expect(resolveRequirements(STANDARD_REQUIREMENTS.unranked, { residence: { sidoIn: ["경기"] } }).residence).toEqual({ sidoIn: ["경기"] });
  });
});
