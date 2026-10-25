// 변경 요청 2 예시 테스트 (U2 business-logic-model §6.3 PBT-10 고정 시나리오, BR-U2-C1~C15)
// 가상의 가구 — 실제 가족 정보 아님
import { describe, expect, it } from "vitest";
import { normalizeRegionPicks, validateProfile } from "../../domain/profile.ts";
import { migrateProfile, parseProfile } from "../../domain/profile-migrate.ts";
import { inInterestArea, parseNoticeRegions, regionMatches } from "../area.ts";
import { judgeNotice } from "../engine.ts";
import { MSG } from "../messages.ts";
import { makeNotice, makeProfile, makeUnit, REFERENCE_2026 } from "../../__tests__/fixtures.ts";

const AS_OF = "2026-09-20";

/** 버전 1 프로필 (변경 2 전에 저장된 모양) */
function v1Profile(savings: Record<string, unknown>) {
  const v2 = makeProfile() as unknown as Record<string, unknown>;
  const prefs: Record<string, unknown> = { ...(v2.prefs as Record<string, unknown>) };
  delete prefs.regions;
  return { ...v2, schemaVersion: 1, savings, prefs };
}

describe("프로필 옮기기 v1 → v2 (BR-U2-C1~C5)", () => {
  it("통장 있음 → 명의 '나', 나머지 값 유지", () => {
    const out = migrateProfile(v1Profile({ has: true, kind: "comprehensive", months: 120, paymentCount: 120, depositManwon: 1000 })) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(3) // 변경 3: v1 → v2 → v3 한 번에;
    expect(out.savings).toEqual({ has: true, owner: "self", kind: "comprehensive", months: 120, paymentCount: 120, depositManwon: 1000 });
    expect((out.prefs as Record<string, unknown>).regions).toEqual([]);
    expect((out.prefs as Record<string, unknown>).districtIds).toEqual(["gyosan"]);
  });

  it("통장 없음 → 모름 (배우자 명의 통장을 '없음'으로 넣은 경우를 숨기지 않기)", () => {
    const r = parseProfile(v1Profile({ has: false, kind: null, months: null, paymentCount: null, depositManwon: null }));
    expect(r.ok && r.value.savings).toEqual({ has: null, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null });
  });

  it("통장 모름 → 그대로 모름", () => {
    const r = parseProfile(v1Profile({ has: null, kind: null, months: null, paymentCount: null, depositManwon: null }));
    expect(r.ok && r.value.savings.has).toBeNull();
  });

  it("버전 2는 그대로, 모르는 값은 건드리지 않는다", () => {
    const p = makeProfile();
    expect(migrateProfile(p)).toBe(p);
    expect(migrateProfile("x")).toBe("x");
    expect(parseProfile({ schemaVersion: 4 }).ok).toBe(false);
  });
});

describe("청약통장 — 부부 기준 (BR-U2-C7~C9)", () => {
  const notice = makeNotice([makeUnit("public_sale_general", 59)], { tenure: "sale" });
  const dad = makeProfile({ savings: { owner: "self" } });
  const mom = makeProfile({ self: { birthDate: "1963-07-01" }, spouse: { birthDate: "1960-03-02" }, householdHead: "spouse", savings: { owner: "spouse" } });

  it("엄마 휴대폰(배우자 명의)과 아빠 휴대폰(본인 명의)은 같은 판정", () => {
    const a = judgeNotice(dad, notice, REFERENCE_2026, AS_OF);
    const b = judgeNotice(mom, notice, REFERENCE_2026, AS_OF);
    expect(b.verdict).toBe(a.verdict);
    expect(b.units.map((u) => u.criteria.map((c) => [c.key, c.verdict]))).toEqual(a.units.map((u) => u.criteria.map((c) => [c.key, c.verdict])));
  });

  it("배우자 명의면 통장 사유에 신청 명의를 덧붙이고, 본인·두 분 다는 덧붙이지 않는다", () => {
    const reasonOf = (p: ReturnType<typeof makeProfile>) =>
      judgeNotice(p, notice, REFERENCE_2026, AS_OF).units[0]!.criteria.find((c) => c.key === "savings")!.reason;
    expect(reasonOf(mom)).toContain(MSG.savingsSpouseOwner);
    expect(reasonOf(dad)).not.toContain(MSG.savingsSpouseOwner);
    expect(reasonOf(makeProfile({ savings: { owner: "both" } }))).not.toContain(MSG.savingsSpouseOwner);
  });

  it("옮긴 엄마 기기(옛 '통장 없음')는 통장 조건이 미충족이 아니라 확인 필요", () => {
    const r = parseProfile(v1Profile({ has: false, kind: null, months: null, paymentCount: null, depositManwon: null }));
    if (!r.ok) throw new Error(r.errors.join());
    const savings = judgeNotice(r.value, notice, REFERENCE_2026, AS_OF).units[0]!.criteria.find((c) => c.key === "savings")!;
    expect(savings.verdict).toBe("unknown");
  });
});

describe("관심 지역 — 지구 또는 시군구 (BR-U2-C10~C14)", () => {
  const noRegionPrefs = { districtIds: [] as string[], regions: [] as never[] };

  it("'경기 전체'를 고르면 수원시 공고가 관심 지역 안", () => {
    expect(inInterestArea({ districtIds: [], regions: [{ sido: "경기", sigungu: "수원시" }] }, { districtIds: [], regions: [{ sido: "경기", sigungu: null }] })).toBe(true);
  });

  it("'경기도 일원' 공고(시도까지만)는 성남시만 고르면 관심 지역 밖 (변경 4 BR-U2-E1)", () => {
    expect(inInterestArea({ districtIds: [], regions: [{ sido: "경기", sigungu: null }] }, { districtIds: [], regions: [{ sido: "경기", sigungu: "성남시" }] })).toBe(false);
  });

  it("서울 강서구만 고르면 부천 대장 공고(지구 미선택)는 관심 지역 밖", () => {
    const daejang = { districtIds: ["daejang"], regions: [{ sido: "경기" as const, sigungu: "부천시" }] };
    expect(inInterestArea(daejang, { districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] })).toBe(false);
  });

  it("지구만 고른 옛 프로필은 옛 규칙과 같다", () => {
    expect(inInterestArea({ districtIds: ["gyosan"], regions: [] }, { districtIds: ["gyosan"], regions: [] })).toBe(true);
    expect(inInterestArea({ districtIds: [], regions: [{ sido: "경기", sigungu: "하남시" }] }, { districtIds: ["gyosan"], regions: [] })).toBe(false);
    expect(inInterestArea({ districtIds: ["gyosan"], regions: [] }, noRegionPrefs)).toBe(false);
  });

  it("시도가 다르면 시도 전체를 골라도 밖", () => {
    expect(regionMatches({ sido: "인천", sigungu: null }, { sido: "서울", sigungu: null })).toBe(false);
  });

  it("judgeNotice의 inDistrict가 관심 시군구를 반영한다", () => {
    const p = makeProfile({ prefs: { districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] } });
    const n = makeNotice([makeUnit("happy_senior")], { districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] });
    expect(judgeNotice(p, n, REFERENCE_2026, AS_OF).inDistrict).toBe(true);
  });

  it("DB 지역 값 읽기: 수도권 밖·목록 밖·형식 오류는 버린다", () => {
    expect(parseNoticeRegions([{ sido: "서울", sigungu: "강서구" }, { sido: "경기" }, { sido: "부산", sigungu: null }, { sido: "인천", sigungu: "중구" }, 3])).toEqual([
      { sido: "서울", sigungu: "강서구" },
      { sido: "경기", sigungu: null },
    ]);
    expect(parseNoticeRegions(null)).toEqual([]);
  });
});

describe("프로필 검사 (변경 2)", () => {
  const ok = (overrides: Parameters<typeof makeProfile>[0]) => validateProfile(makeProfile(overrides)).ok;

  it("관심 지역은 지구 + 시군구 1곳 이상 — 지구 없이 시군구만도 된다", () => {
    expect(ok({ prefs: { districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] } })).toBe(true);
    expect(ok({ prefs: { districtIds: [], regions: [] } })).toBe(false);
  });

  it("관심 시군구: 수도권·목록 안·중복 없음·시도 전체와 그 시도 시군구를 함께 두지 않음", () => {
    expect(ok({ prefs: { regions: [{ sido: "부산" as never, sigungu: null }] } })).toBe(false);
    expect(ok({ prefs: { regions: [{ sido: "서울", sigungu: "없는구" }] } })).toBe(false);
    expect(ok({ prefs: { regions: [{ sido: "서울", sigungu: "강서구" }, { sido: "서울", sigungu: "강서구" }] } })).toBe(false);
    expect(ok({ prefs: { regions: [{ sido: "서울", sigungu: null }, { sido: "서울", sigungu: "강서구" }] } })).toBe(false);
  });

  it("통장 명의: 통장이 없으면 null, 배우자 없는 가구는 '나'만", () => {
    expect(ok({ savings: { has: false, owner: "self" } })).toBe(false);
    expect(ok({ spouse: null, householdType: "single", householdSize: 1, householdHead: "self", savings: { owner: "spouse" } })).toBe(false);
    expect(ok({ spouse: null, householdType: "single", householdSize: 1, householdHead: "self", savings: { owner: "self" } })).toBe(true);
  });

  it("관심 시군구 정리: 시도 전체가 있으면 그 시도 시군구는 빠지고 목록 순서로", () => {
    expect(
      normalizeRegionPicks([
        { sido: "인천", sigungu: "부평구" },
        { sido: "서울", sigungu: "강서구" },
        { sido: "서울", sigungu: null },
        { sido: "인천", sigungu: "부평구" },
      ]),
    ).toEqual([
      { sido: "서울", sigungu: null },
      { sido: "인천", sigungu: "부평구" },
    ]);
  });
});
