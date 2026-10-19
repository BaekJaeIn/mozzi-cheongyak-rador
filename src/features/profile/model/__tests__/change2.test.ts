// 변경 요청 2 예시 — 통장 명의, 관심 지역 두 화면, 초안 옮기기, 업데이트 안내, 짧은 입력 화면 (business-rules §9)
import { validateProfile } from "@shared/domain/profile.ts";
import { parseProfile } from "@shared/domain/profile-migrate.ts";
import { describe, expect, it } from "vitest";
import { fromProfile, mergeUpdate, toProfile } from "../convert";
import { applyRegionDefault, defaultRegions, regionsSummary, toggleRegion } from "../regions";
import { isComplete, pruneHidden, updateSteps, visibleSteps } from "../steps";
import { DRAFT_KEY, loadDraft, migrateDraft, PROFILE_KEY, storedProfileSchemaVersion } from "../storage";
import { districtsSummary, groupSummary } from "../summary";
import { UNKNOWN, type WizardAnswers } from "../types";
import { initialUpdates, markNoticeSeen, parseUpdates, pendingFromV1, resolveItems, shouldShowDialog, WHATS_NEW } from "../updates";
import { memoryStorage, MINIMAL_ANSWERS, MOTHER_ANSWERS } from "./helpers";

/** 부모님 휴대폰 (business-logic-model §8.4): 서울 강서구, 부부, 3기 신도시 고름 */
const PARENT: WizardAnswers = { ...MOTHER_ANSWERS, sido: "서울", sigungu: "강서구" };
const v1Of = (a: WizardAnswers, has: boolean | null) => {
  const p = toProfile({ ...a, savingsOwner: has === true ? "self" : has === false ? "none" : UNKNOWN }) as unknown as Record<string, unknown>;
  const savings = { ...(p.savings as Record<string, unknown>) };
  delete savings.owner;
  const prefs = { ...(p.prefs as Record<string, unknown>) };
  delete prefs.regions;
  return { ...p, schemaVersion: 1, savings, prefs };
};

describe("통장 명의 (BR-U4-C3~C7, domain-entities §7.2)", () => {
  it("답 → 프로필: 나·배우자·두 분 다는 has true + 명의, 없음은 false, 모름은 null", () => {
    expect(toProfile({ ...PARENT, savingsOwner: "spouse" }).savings).toMatchObject({ has: true, owner: "spouse", kind: "comprehensive" });
    expect(toProfile({ ...PARENT, savingsOwner: "both" }).savings.owner).toBe("both");
    expect(toProfile({ ...PARENT, savingsOwner: "none" }).savings).toEqual({ has: false, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null });
    expect(toProfile({ ...PARENT, savingsOwner: UNKNOWN }).savings.has).toBeNull();
  });

  it("프로필 → 답: has true면 명의(없으면 나), false는 없음, null은 모름", () => {
    expect(fromProfile(toProfile({ ...PARENT, savingsOwner: "spouse" })).savingsOwner).toBe("spouse");
    expect(fromProfile(toProfile({ ...PARENT, savingsOwner: "none" })).savingsOwner).toBe("none");
    expect(fromProfile(toProfile({ ...PARENT, savingsOwner: UNKNOWN })).savingsOwner).toBe(UNKNOWN);
  });

  it("엄마 휴대폰 배우자 명의 = 아빠 휴대폰 본인 명의와 같은 통장 정보", () => {
    const mom = toProfile({ ...PARENT, savingsOwner: "spouse" }).savings;
    const dad = toProfile({ ...PARENT, savingsOwner: "self" }).savings;
    expect({ ...mom, owner: null }).toEqual({ ...dad, owner: null });
  });

  it("부부 → 혼자: 배우자·두 분 다 답과 그 통장 정보를 지운다, 나는 남긴다 (BR-U4-C6)", () => {
    const spouse = pruneHidden({ ...PARENT, savingsOwner: "spouse", householdType: "single" });
    expect(spouse.savingsOwner).toBeUndefined();
    expect(spouse.savingsKind).toBeUndefined();
    expect(pruneHidden({ ...PARENT, savingsOwner: "self", householdType: "single" }).savingsKind).toBe("comprehensive");
    expect(validateProfile(toProfile({ ...PARENT, savingsOwner: "both", householdType: "single" })).ok).toBe(true);
  });

  it("통장 자세한 화면은 통장이 있다는 답에서만", () => {
    const ids = (owner: WizardAnswers["savingsOwner"]) => visibleSteps({ ...PARENT, savingsOwner: owner }).map((s) => s.id);
    expect(ids("both")).toContain("savingsKind");
    expect(ids("none")).not.toContain("savingsKind");
    expect(ids(UNKNOWN)).not.toContain("savingsKind");
  });
});

describe("관심 지역 두 화면 (BR-U4-C10~C17)", () => {
  it("3기 신도시 0개 + 다른 지역 1곳이면 저장 가능, 둘 다 비면 불가", () => {
    expect(isComplete({ ...MINIMAL_ANSWERS, districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] })).toBe(true);
    expect(isComplete({ ...MINIMAL_ANSWERS, districtIds: [], regions: [] })).toBe(false);
    const p = toProfile({ ...MINIMAL_ANSWERS, districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] });
    expect(p.prefs).toMatchObject({ districtIds: [], regions: [{ sido: "서울", sigungu: "강서구" }] });
    expect(validateProfile(p).ok).toBe(true);
  });

  it("화면 순서: 3기 신도시 다음 다른 지역", () => {
    const ids = visibleSteps(PARENT).map((s) => s.id);
    expect(ids.indexOf("regions")).toBe(ids.indexOf("districts") + 1);
  });

  it("사는 시군구 미리 고르기: 수도권만, 답이 있으면 그대로, 짧은 입력 화면은 빈 목록도 채움 (BR-U4-C11)", () => {
    expect(defaultRegions("서울", "강서구")).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    expect(defaultRegions("부산", null)).toEqual([]);
    expect(applyRegionDefault(PARENT).regions).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    expect(applyRegionDefault({ ...PARENT, regions: [] }).regions).toEqual([]);
    expect(applyRegionDefault({ ...PARENT, regions: [] }, true).regions).toEqual([{ sido: "서울", sigungu: "강서구" }]);
  });

  it("고르기: 전체를 켜면 그 시도 시군구는 지움, 전체 중 시군구는 못 누름, 다시 누르면 풀림 (BR-U4-C13)", () => {
    let v = toggleRegion([], "서울", "강서구");
    v = toggleRegion(v, "경기", "하남시");
    expect(v).toEqual([{ sido: "서울", sigungu: "강서구" }, { sido: "경기", sigungu: "하남시" }]);
    v = toggleRegion(v, "서울", null);
    expect(v).toEqual([{ sido: "서울", sigungu: null }, { sido: "경기", sigungu: "하남시" }]);
    expect(toggleRegion(v, "서울", "마포구")).toEqual(v);
    expect(toggleRegion(v, "서울", null)).toEqual([{ sido: "경기", sigungu: "하남시" }]);
    expect(toggleRegion(v, "경기", "하남시")).toEqual([{ sido: "서울", sigungu: null }]);
  });

  it("인천 시군구를 모두 하나씩 고르면 '인천 전체'로 (BR-U4-C14)", () => {
    const names = ["강화군", "옹진군", "제물포구", "영종구", "서해구", "검단구", "미추홀구", "연수구", "남동구", "부평구", "계양구"];
    const v = names.reduce((acc, n) => toggleRegion(acc, "인천", n), [] as ReturnType<typeof toggleRegion>);
    expect(v).toEqual([{ sido: "인천", sigungu: null }]);
  });

  it("요약 (BR-U4-C15·C18)", () => {
    expect(regionsSummary([{ sido: "서울", sigungu: "강서구" }, { sido: "경기", sigungu: null }])).toBe("서울 강서구, 경기 전체");
    expect(regionsSummary([1, 2, 3, 4, 5].map(() => ({ sido: "서울" as const, sigungu: "강서구" })))).toBe("서울 강서구 외 4곳");
    expect(districtsSummary(["gyosan", "wangsuk"], [{ sido: "서울", sigungu: "강서구" }])).toBe("3기 신도시 2곳 · 서울 강서구");
    expect(districtsSummary([], [{ sido: "서울", sigungu: "강서구" }])).toBe("서울 강서구");
    expect(groupSummary(toProfile({ ...PARENT, savingsOwner: "spouse" }), "savings", "2026-10-19")).toBe("배우자 명의 · 주택청약종합저축 · 10년 이상");
    expect(groupSummary(toProfile({ ...MINIMAL_ANSWERS, savingsOwner: "self" }), "savings", "2026-10-19")).toBe("확인 필요 · 확인 필요");
  });
});

describe("초안 버전 1 옮기기 (domain-entities §7.3)", () => {
  it("통장 있음 → 명의 나, 없음·모름은 지워 다시 묻는다, 화면 ID도 바꾼다", () => {
    const base = { version: 1, updatedAt: "2026-10-01T00:00:00Z" };
    expect(migrateDraft({ ...base, answers: { selfBirth: "1960-01-01", savingsHas: true }, stepId: "savingsHas" })).toEqual({
      version: 2,
      answers: { selfBirth: "1960-01-01", savingsOwner: "self" },
      stepId: "savingsOwner",
      updatedAt: base.updatedAt,
    });
    expect(migrateDraft({ ...base, answers: { savingsHas: false }, stepId: "income" })?.answers).toEqual({});
    expect(migrateDraft({ ...base, answers: { savingsHas: UNKNOWN }, stepId: "income" })?.answers).toEqual({});
    expect(migrateDraft({ ...base, version: 3, answers: {}, stepId: "income" })).toBeNull();
  });

  it("기기에 남은 버전 1 초안을 읽으면 버전 2로", () => {
    const s = memoryStorage({ [DRAFT_KEY]: JSON.stringify({ version: 1, answers: { savingsHas: true }, stepId: "savingsKind", updatedAt: "x" }) });
    expect(loadDraft(s)).toMatchObject({ version: 2, answers: { savingsOwner: "self" }, stepId: "savingsKind" });
  });
});

describe("업데이트 안내 기록 (BR-U4-C20~C24·C36)", () => {
  it("처음 기록: 프로필 없음·버전 2는 본 것으로, 버전 1은 안 본 것으로", () => {
    const p = parseProfile(v1Of(PARENT, true));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(initialUpdates(null)).toEqual({ version: 1, noticeSeen: WHATS_NEW.notice, pending: [] });
    expect(initialUpdates({ profile: p.value, storedSchemaVersion: 2 }).pending).toEqual([]);
    expect(initialUpdates({ profile: p.value, storedSchemaVersion: 1 })).toEqual({ version: 1, noticeSeen: 0, pending: ["savings", "regions"] });
  });

  it("새 항목: 부부는 통장 있음이어도 명의 확인, 혼자 통장 있음은 지역만, 혼자 없음은 통장도 (BR-U4-C21)", () => {
    const parse = (raw: unknown) => {
      const r = parseProfile(raw);
      if (!r.ok) throw new Error("bad");
      return r.value;
    };
    expect(pendingFromV1(parse(v1Of(PARENT, true)))).toEqual(["savings", "regions"]); // 아빠
    expect(pendingFromV1(parse(v1Of(PARENT, false)))).toEqual(["savings", "regions"]); // 엄마 (없음 → 모름)
    expect(pendingFromV1(parse(v1Of(MINIMAL_ANSWERS, true)))).toEqual(["regions"]);
    expect(pendingFromV1(parse(v1Of(MINIMAL_ANSWERS, false)))).toEqual(["savings", "regions"]);
  });

  it("엄마 휴대폰 옮기기: 통장 없음 → 모름 (U2 FR-C2-3)", () => {
    const r = parseProfile(v1Of(PARENT, false));
    expect(r.ok && r.value.savings.has).toBeNull();
  });

  it("창은 프로필이 있고 안 본 안내일 때만, 본 뒤에는 안 뜬다", () => {
    const u = { version: 1 as const, noticeSeen: 0, pending: ["savings" as const] };
    expect(shouldShowDialog(u, true)).toBe(true);
    expect(shouldShowDialog(u, false)).toBe(false);
    expect(shouldShowDialog(markNoticeSeen(u), true)).toBe(false);
    expect(resolveItems(u, ["savings"]).pending).toEqual([]);
  });

  it("저장된 원래 버전 읽기, 깨진 기록은 null", () => {
    const s = memoryStorage({ [PROFILE_KEY]: JSON.stringify({ version: 1, profile: v1Of(PARENT, true), savedAt: "x", sync: { state: "synced", at: "x" } }) });
    expect(storedProfileSchemaVersion(s)).toBe(1);
    expect(parseUpdates({ version: 1, noticeSeen: 1, pending: ["nope"] })).toBeNull();
    expect(parseUpdates({ version: 1, noticeSeen: 1, pending: ["regions", "savings"] })?.pending).toEqual(["savings", "regions"]);
  });
});

describe("짧은 입력 화면 (BR-U4-C30~C35)", () => {
  it("아빠: 통장 있음이었으면 명의만 → 다른 지역", () => {
    const scope = { pending: ["savings", "regions"] as const, beforeSavingsHas: true };
    expect(updateSteps(scope, { ...PARENT, savingsOwner: "self" })).toEqual(["savingsOwner", "regions"]);
  });

  it("엄마: 모름이었고 배우자를 고르면 통장 정보 3화면을 이어서", () => {
    const scope = { pending: ["savings", "regions"] as const, beforeSavingsHas: null };
    expect(updateSteps(scope, { ...PARENT, savingsOwner: UNKNOWN })).toEqual(["savingsOwner", "regions"]);
    expect(updateSteps(scope, { ...PARENT, savingsOwner: "spouse" })).toEqual(["savingsOwner", "savingsKind", "savingsPeriod", "savingsAmount", "regions"]);
  });

  it("지역만 남았으면 다른 지역 화면 하나", () => {
    expect(updateSteps({ pending: ["regions"], beforeSavingsHas: true }, PARENT)).toEqual(["regions"]);
  });

  it("합치기: 통장·다른 지역만 바뀌고 3기 신도시·나머지는 그대로 (P-U4-C5 예시)", () => {
    const current = fromProfile(toProfile({ ...PARENT, savingsOwner: UNKNOWN, districtIds: ["gyosan"] }));
    const edited = { ...current, savingsOwner: "spouse" as const, savingsKind: "comprehensive" as const, regions: [{ sido: "서울" as const, sigungu: "강서구" }], districtIds: [], monthlyIncome: 1 };
    const p = toProfile(mergeUpdate(current, edited, ["savings", "regions"]));
    expect(p.savings).toMatchObject({ has: true, owner: "spouse", kind: "comprehensive" });
    expect(p.prefs.districtIds).toEqual(["gyosan"]);
    expect(p.prefs.regions).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    expect(p.money.monthlyIncome).toBe(450);
  });
});
