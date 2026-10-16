// U5 표시·판정 이유·캘린더 예시 테스트 (PBT-10: 핵심 사례 고정)
import { describe, expect, it } from "vitest";
import type { CriterionResult, UnitJudgement } from "@shared/eligibility/types.ts";
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import type { Schedule, UnitInfo } from "../api-types";
import {
  alarmDate,
  buildIcs,
  calendarEvent,
  calendarTarget,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  icsFileName,
  unescapeIcsText,
  unfoldIcs,
} from "../calendar";
import { areaLabel, dateLabel, ddayLabel, isNew, periodLabel, pyeongOf, timeline, unitRows } from "../display";
import { groupJudgement, settingsLinkFor, splitGroups, withUserValue } from "../judgement";

const TODAY = "2026-10-20"; // 화요일

describe("ddayLabel (BR-U5-30~37)", () => {
  it.each([
    ["마감", "2026-10-10", "2026-10-15", "접수 마감", false],
    ["오늘 마감", "2026-10-15", "2026-10-20", "오늘 마감", true],
    ["시작=마감=오늘이면 마감이 먼저", "2026-10-20", "2026-10-20", "오늘 마감", true],
    ["오늘 접수 시작", "2026-10-20", "2026-10-23", "오늘 접수 시작", false],
    ["마감 3일 전은 강조", "2026-10-15", "2026-10-23", "마감까지 D-3", true],
    ["마감 4일 전은 강조 없음", "2026-10-15", "2026-10-24", "마감까지 D-4", false],
    ["접수 중 마감일 없음", "2026-10-15", null, "접수 중 (마감일 미정)", false],
    ["접수 예정", "2026-10-27", "2026-10-29", "접수까지 D-7", false],
    ["시작일 없음", null, "2026-10-29", "일정 미정", false],
    ["둘 다 없음", null, null, "일정 미정", false],
  ] as const)("%s", (_, start, end, text, urgent) => {
    expect(ddayLabel(start, end, TODAY)).toEqual({ text, urgent });
  });
});

describe("날짜 표기 (BR-U5-23)", () => {
  it("요일을 붙이고 다른 해면 연도를 붙인다", () => {
    expect(dateLabel("2026-10-20", TODAY)).toBe("10월 20일(화)");
    expect(dateLabel("2027-01-05", TODAY)).toBe("2027년 1월 5일(화)");
  });

  it("접수 기간", () => {
    expect(periodLabel("2026-10-20", "2026-10-23", TODAY)).toBe("10월 20일(화) ~ 10월 23일(금)");
    expect(periodLabel(null, "2026-10-23", TODAY)).toBe("미정 ~ 10월 23일(금)");
    expect(periodLabel(null, null, TODAY)).toBe("접수 일정 미정");
  });
});

describe("isNew (BR-U5-40)", () => {
  const now = new Date("2026-10-20T03:00:00Z");
  it("7일 이내 + 열어 보지 않음", () => {
    expect(isNew("a", "2026-10-14T03:00:01Z", now, new Set())).toBe(true);
    expect(isNew("a", "2026-10-13T03:00:00Z", now, new Set())).toBe(false);
    expect(isNew("a", "2026-10-19T00:00:00Z", now, new Set(["a"]))).toBe(false);
  });
  it("기기 시계가 늦어도 새 공고는 NEW, 깨진 시각은 아님", () => {
    expect(isNew("a", "2026-10-21T00:00:00Z", now, new Set())).toBe(true);
    expect(isNew("a", "not-a-date", now, new Set())).toBe(false);
  });
});

describe("timeline (BR-U5-75~77)", () => {
  const schedule: Schedule = {
    announcedAt: "2026-10-01",
    applyStart: "2026-10-15",
    applyEnd: "2026-10-23",
    resultAt: "2026-11-05",
    contractStart: null,
    contractEnd: null,
  };

  it("오늘이 접수 기간 가운데면 접수 시작 뒤에 표시", () => {
    const t = timeline(schedule, TODAY);
    expect(t.steps.map((s) => s.state)).toEqual(["past", "past", "future", "future", "unknown"]);
    expect(t.todayIndex).toBe(2);
  });

  it("오늘인 단계가 있으면 그 단계에 표시", () => {
    const t = timeline(schedule, "2026-10-23");
    expect(t.todayIndex).toBeNull();
    expect(t.steps[2]!.state).toBe("today");
  });

  it("모두 미래면 맨 앞, 모두 지났으면 맨 뒤", () => {
    expect(timeline(schedule, "2026-09-01").todayIndex).toBe(0);
    expect(timeline(schedule, "2026-12-01").todayIndex).toBe(4); // 계약은 날짜 없음 → 발표 뒤
  });

  it("날짜가 없거나 순서가 어긋나도 단계 순서는 고정", () => {
    const t = timeline({ ...schedule, announcedAt: "2026-10-25", applyStart: null }, TODAY);
    expect(t.steps.map((s) => s.key)).toEqual(["announced", "applyStart", "applyEnd", "result", "contract"]);
    expect(t.todayIndex).toBe(0);
  });
});

describe("면적·세대수 (BR-U5-78~81, Q9=A)", () => {
  it("전용면적과 평 환산", () => {
    expect(areaLabel(59)).toBe("전용 59㎡ (약 18평)");
    expect(areaLabel(84.97)).toBe("전용 84.97㎡ (약 26평)");
    expect(areaLabel(2)).toBe("전용 2㎡ (약 0.6평)");
    expect(areaLabel(null)).toBe("면적 미정");
    expect(pyeongOf(3.3)).toBe(1);
  });

  const unit = (id: string, area: number | null, count: number | null, label: string | null = null): UnitInfo => ({
    id,
    label,
    supplyType: "x",
    plain: "x",
    formal: "x",
    exclusiveAreaM2: area,
    supplyCount: count,
  });

  it("면적 작은 순, 모르는 세대수가 있으면 '이상'", () => {
    const r = unitRows([unit("c", null, 5), unit("b", 84, null), unit("a", 59, 120)]);
    expect(r.rows.map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(r.total).toBe("125세대 이상");
    expect(unitRows([unit("a", 59, 1200)]).total).toBe("1,200세대");
    expect(unitRows([unit("a", 59, null)]).total).toBe("세대수 미정");
  });
});

// ---------- 판정 이유 ----------

const age: CriterionResult = { key: "age", verdict: "eligible", code: "age_ok", reason: "만 65세 이상 → 만 66세예요" };
const income: CriterionResult = {
  key: "income",
  verdict: "eligible",
  code: "income_ok",
  reason: "2인 가구 기준 월 645만 2,897원 이하",
  userValue: "monthlyIncome",
};
const incomeUnknown: CriterionResult = {
  key: "income",
  verdict: "unknown",
  code: "income_unknown",
  reason: "2인 가구 기준 월 645만 2,897원 이하",
  action: "설정에서 월 소득을(를) 입력하면 정확히 알려 드려요",
  userValue: "monthlyIncome",
};
const info = (id: string, supplyType: string, plain: string, area: number | null): UnitInfo => ({
  id,
  label: null,
  supplyType,
  plain,
  formal: `${plain}(공식)`,
  exclusiveAreaM2: area,
  supplyCount: 10,
});

describe("groupJudgement (BR-U5-86·87)", () => {
  const infos = [info("u1", "senior", "고령자", 59), info("u2", "senior", "고령자", 46), info("u3", "newlywed", "신혼부부", 59), info("u4", "general", "일반", 84)];

  it("같은 공급유형·같은 조건이면 한 덩어리, 면적은 작은 순", () => {
    const units: UnitJudgement[] = [
      { unitId: "u1", supplyType: "senior", verdict: "eligible", criteria: [age] },
      { unitId: "u2", supplyType: "senior", verdict: "eligible", criteria: [age] },
    ];
    const groups = groupJudgement(units, infos);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ plain: "고령자", formal: "고령자(공식)", areas: [46, 59], unitIds: ["u2", "u1"] });
  });

  it("같은 유형 안에서 결과가 다르면 주택형별로 나누고, 판정 순서는 충족 → 확인 필요 → 미충족", () => {
    const ineligible: CriterionResult = { ...age, verdict: "ineligible", code: "age_no" };
    const units: UnitJudgement[] = [
      { unitId: "u4", supplyType: "general", verdict: "ineligible", criteria: [ineligible] },
      { unitId: "u1", supplyType: "senior", verdict: "unknown", criteria: [incomeUnknown] },
      { unitId: "u2", supplyType: "senior", verdict: "eligible", criteria: [income] },
      { unitId: "u3", supplyType: "newlywed", verdict: "eligible", criteria: [income] },
    ];
    const groups = groupJudgement(units, infos);
    expect(groups.map((g) => [g.plain, g.verdict, g.unitIds])).toEqual([
      ["고령자", "eligible", ["u2"]],
      ["신혼부부", "eligible", ["u3"]],
      ["고령자", "unknown", ["u1"]],
      ["일반", "ineligible", ["u4"]],
    ]);
    expect(splitGroups(groups).folded.map((g) => g.plain)).toEqual(["일반"]);
  });

  it("미충족만 있으면 펼친다", () => {
    const units: UnitJudgement[] = [{ unitId: "u4", supplyType: "general", verdict: "ineligible", criteria: [] }];
    expect(splitGroups(groupJudgement(units, infos))).toMatchObject({ open: [{ plain: "일반" }], folded: [] });
  });

  it("주택형 정보가 없으면 코드로 보인다", () => {
    const groups = groupJudgement([{ unitId: "zz", supplyType: "other", verdict: "unknown", criteria: [] }], []);
    expect(groups[0]).toMatchObject({ plain: "other", areas: [null] });
  });
});

describe("내 금액 붙이기·설정 링크 (BR-U5-89·90)", () => {
  const profile = { money: { monthlyIncome: 450, totalAsset: 20000, carValue: null } } as unknown as HouseholdProfile;

  it("기기 프로필 값이 있으면 붙인다", () => {
    expect(withUserValue(income, profile)).toBe("입력하신 금액 월 450만원");
    expect(withUserValue({ ...income, userValue: "totalAsset" }, profile)).toBe("입력하신 금액 2억원");
  });

  it("값이 없거나 조건에 금액이 없으면 붙이지 않는다", () => {
    expect(withUserValue({ ...income, userValue: "carValue" }, profile)).toBeNull();
    expect(withUserValue(age, profile)).toBeNull();
    expect(withUserValue(income, null)).toBeNull();
  });

  it("'설정에서 …' 행동 문구에만 고치기 링크", () => {
    expect(settingsLinkFor(incomeUnknown)).toBe("/profile/edit/money");
    expect(settingsLinkFor({ ...incomeUnknown, action: "원문의 '신청 자격'을 확인해 주세요" })).toBeNull();
    expect(settingsLinkFor({ ...incomeUnknown, key: "type" })).toBe("/settings");
  });
});

// ---------- 캘린더 ----------

describe("캘린더 (BR-U5-105~110)", () => {
  const base = {
    id: "3f2c1a9e-0000-4000-8000-000000000001",
    title: "하남교산 A2 고령자 전세임대 입주자 모집공고",
    complexName: "하남교산 A2",
    applyStart: "2026-10-20",
    applyEnd: "2026-10-23",
    status: "open" as const,
    url: "https://apply.lh.or.kr/notice?id=1,2;3",
  };

  it("일정이 없거나 마감이면 만들지 않는다", () => {
    expect(calendarEvent({ ...base, applyStart: null })).toEqual({ kind: "no_dates" });
    expect(calendarEvent({ ...base, status: "closed" })).toEqual({ kind: "closed" });
  });

  const ready = calendarEvent(base);
  if (ready.kind !== "ready") throw new Error("ready여야 함");
  const event = ready.event;

  it(".ics: 종일 일정, 끝은 다음 날, 마감 전날 오전 9시(KST) 알림", () => {
    const ics = buildIcs(event, new Date("2026-10-20T01:02:03.456Z"));
    const lines = unfoldIcs(ics);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(lines).toContain("DTSTART;VALUE=DATE:20261020");
    expect(lines).toContain("DTEND;VALUE=DATE:20261024");
    expect(lines).toContain("DTSTAMP:20261020T010203Z");
    expect(lines).toContain("TRIGGER;VALUE=DATE-TIME:20261022T000000Z");
    expect(lines).toContain(`UID:${base.id}@mozzi-cheongyak`);
    expect(lines).toContain("SUMMARY:[청약 접수] 하남교산 A2");
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:"))!;
    expect(unescapeIcsText(desc.slice("DESCRIPTION:".length))).toBe(`${base.title}\n원문: ${base.url}`);
    for (const l of ics.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it("하루짜리 접수는 그날 알림", () => {
    expect(alarmDate({ start: "2026-10-20", end: "2026-10-20" })).toBe("2026-10-20");
  });

  it("이스케이프와 줄 접기", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = `DESCRIPTION:${"가".repeat(40)}`; // 12 + 120바이트
    const folded = foldIcsLine(long);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(long);
  });

  it("Google 링크: 끝 날짜는 다음 날, 글자는 인코딩", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("dates")).toBe("20261020/20261024");
    expect(url.searchParams.get("text")).toBe("[청약 접수] 하남교산 A2");
    expect(url.searchParams.get("details")).toBe(event.description);
  });

  it("iPhone·iPad는 .ics, 그 밖은 Google", () => {
    expect(calendarTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe("ics");
    expect(calendarTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ics"); // iPadOS
    expect(calendarTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("google");
    expect(calendarTarget("Mozilla/5.0 (Linux; Android 14; SM-S918N)", 5)).toBe("google");
  });

  it("파일 이름", () => {
    expect(icsFileName(base.id)).toBe("cheongyak-3f2c1a9e.ics");
  });
});
