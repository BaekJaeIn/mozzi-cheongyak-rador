// 속성 기반 테스트 — U5 (domain-entities §7, P-U5-1~13)
import { fc, test } from "@fast-check/vitest";
import { addDays } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import { compareFeedItems } from "@shared/eligibility/scoring.ts";
import { isVisible } from "@shared/eligibility/visibility.ts";
import { expect } from "vitest";
import { type Bookmark, createBookmarkStore, loadBookmarks, MAX_BOOKMARKS, sortBookmarks } from "@/features/bookmarks/model/store";
import { redrawCachedFeed } from "@/features/feed/model/cache";
import { loadSeen, markSeen, SEEN_KEEP_MS, SEEN_MAX, seenSet } from "@/features/feed/model/seen";
import { memoryStorage } from "@/features/profile/model/__tests__/helpers";
import { buildFeed, parseJudgementDetail, type TypeLabels } from "@/server/feed/build";
import type { Schedule, UnitInfo } from "../api-types";
import { buildIcs, escapeIcsText, foldIcsLine, googleCalendarUrl, unescapeIcsText, unfoldIcs } from "../calendar";
import { ddayLabel, isNew, pyeongOf, timeline } from "../display";
import { criteriaSignature, groupJudgement } from "../judgement";
import { applyPeriodArb, feedItemsArb, feedRowsArb, isoDateArb, nullableDateArb, unitJudgementsArb } from "./arbitraries";

const LABELS: TypeLabels = new Map([
  ["senior", { plain: "고령자", formal: "고령자" }],
  ["newlywed", { plain: "신혼부부", formal: "신혼부부" }],
]);

// ---------- 피드 ----------

test.prop([feedRowsArb, isoDateArb])("P-U5-1 피드에는 노출 조건이 참인 공고만, 빠짐·중복 없이 나온다", (rows, today) => {
  const feed = buildFeed(rows, today, LABELS, ["gyosan"]);
  const expected = rows
    .filter((r) =>
      isVisible({ verdict: r.verdict, inDistrict: r.inDistrict, status: noticeStatus({ applyStart: r.notice.applyStart, applyEnd: r.notice.applyEnd }, today) }),
    )
    .map((r) => r.notice.id)
    .sort();
  expect(feed.map((i) => i.id).sort()).toEqual(expected);
  expect(new Set(feed.map((i) => i.id)).size).toBe(feed.length);
});

test.prop([feedRowsArb.chain((rows) => fc.tuple(fc.constant(rows), fc.shuffledSubarray(rows, { minLength: rows.length }))), isoDateArb])(
  "P-U5-2 피드는 정렬 규칙대로이고 입력 순서와 무관하다",
  ([rows, shuffled], today) => {
    const a = buildFeed(rows, today, LABELS, []);
    const b = buildFeed(shuffled, today, LABELS, []);
    expect(b).toEqual(a);
    for (let i = 1; i < a.length; i++) {
      expect(compareFeedItems({ ...a[i - 1]!, noticeId: a[i - 1]!.id }, { ...a[i]!, noticeId: a[i]!.id })).toBeLessThanOrEqual(0);
    }
  },
);

test.prop([feedRowsArb, isoDateArb])("P-U5-3 카드 공급유형 = 충족·확인 필요 주택형의 유형 집합, 중복 없음", (rows, today) => {
  for (const item of buildFeed(rows, today, LABELS, [])) {
    const row = rows.find((r) => r.notice.id === item.id)!;
    const expected = new Set(parseJudgementDetail(row.detail).units.filter((u) => u.verdict !== "ineligible").map((u) => u.supplyType));
    const codes = item.supplyTypes.map((s) => s.code);
    expect(new Set(codes)).toEqual(expected);
    expect(codes.length).toBe(expected.size);
  }
});

// ---------- D-day ----------

const dNumber = (text: string) => {
  const m = /D-(\d+)$/.exec(text);
  return m ? Number(m[1]) : null;
};

test.prop([applyPeriodArb, isoDateArb])("P-U5-4 D-day: 숫자는 1 이상, 하루 지나면 1 줄거나 '오늘 …'로, 마감이면 '접수 마감'", (p, today) => {
  const now = ddayLabel(p.applyStart, p.applyEnd, today);
  const status = noticeStatus(p, today);
  if (status === "closed") expect(now.text).toBe("접수 마감");
  const n = dNumber(now.text);
  if (n !== null) expect(n).toBeGreaterThanOrEqual(1);
  const tomorrow = addDays(today, 1);
  const next = ddayLabel(p.applyStart, p.applyEnd, tomorrow);
  const m = dNumber(next.text);
  if (n !== null && noticeStatus(p, tomorrow) === status && m !== null && now.text.split(" ")[0] === next.text.split(" ")[0]) {
    expect(m).toBe(n - 1);
  }
  if (n === 1 && noticeStatus(p, tomorrow) === status) expect(next.text.startsWith("오늘")).toBe(true);
});

// ---------- 타임라인 ----------

const sortedScheduleArb: fc.Arbitrary<Schedule> = fc.array(nullableDateArb, { minLength: 6, maxLength: 6 }).map((dates) => {
  const known = dates.filter((d): d is string => d !== null).sort();
  const filled = dates.map((d) => (d === null ? null : known.shift()!));
  return { announcedAt: filled[0]!, applyStart: filled[1]!, applyEnd: filled[2]!, resultAt: filled[3]!, contractStart: filled[4]!, contractEnd: filled[5]! };
});

test.prop([sortedScheduleArb, isoDateArb])("P-U5-5 타임라인: 단계 5개 고정, '오늘' 앞은 오늘 이하·뒤는 오늘 초과", (schedule, today) => {
  const t = timeline(schedule, today);
  expect(t.steps.map((s) => s.key)).toEqual(["announced", "applyStart", "applyEnd", "result", "contract"]);
  if (t.todayIndex === null) {
    expect(t.steps.some((s) => s.state === "today")).toBe(true);
    return;
  }
  t.steps.forEach((s, i) => {
    if (!s.date) return;
    if (i < t.todayIndex!) expect(s.date <= today).toBe(true);
    else expect(s.date > today).toBe(true);
  });
});

// ---------- 판정 묶기 ----------

test.prop([unitJudgementsArb, fc.array(fc.option(fc.integer({ min: 20, max: 120 }), { nil: null }), { minLength: 8, maxLength: 8 })])(
  "P-U5-6 판정 묶기: 모든 주택형이 정확히 한 묶음에, 묶음 안은 유형·판정·조건이 같고, 순서는 충족 → 확인 필요 → 미충족",
  (units, areas) => {
    const info: UnitInfo[] = units.map((u, i) => ({
      id: u.unitId,
      label: null,
      supplyType: u.supplyType,
      plain: u.supplyType,
      formal: u.supplyType,
      exclusiveAreaM2: areas[i] ?? null,
      supplyCount: null,
    }));
    const groups = groupJudgement(units, info);
    const all = groups.flatMap((g) => g.unitIds);
    expect([...all].sort()).toEqual(units.map((u) => u.unitId).sort());
    const byId = new Map(units.map((u) => [u.unitId, u]));
    for (const g of groups) {
      for (const id of g.unitIds) {
        const u = byId.get(id)!;
        expect(u.supplyType).toBe(g.supplyType);
        expect(u.verdict).toBe(g.verdict);
        expect(criteriaSignature(u.criteria)).toBe(criteriaSignature(g.criteria));
      }
    }
    const rank = { eligible: 0, unknown: 1, ineligible: 2 } as const;
    for (let i = 1; i < groups.length; i++) expect(rank[groups[i - 1]!.verdict]).toBeLessThanOrEqual(rank[groups[i]!.verdict]);
  },
);

// ---------- 면적 ----------

test.prop([fc.double({ min: 0, max: 400, noNaN: true }), fc.double({ min: 0, max: 400, noNaN: true })])("P-U5-7 평 환산은 면적에 대해 단조", (a, b) => {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  expect(pyeongOf(lo)).toBeLessThanOrEqual(pyeongOf(hi));
});

// ---------- 캘린더 ----------

const textArb = fc.string({ unit: "grapheme", maxLength: 120 }).filter((s) => !s.includes("\r"));

test.prop([textArb])("P-U5-8a .ics 글자 이스케이프 왕복", (s) => {
  expect(unescapeIcsText(escapeIcsText(s))).toBe(s);
  expect(escapeIcsText(s)).not.toMatch(/[\r\n]/);
});

test.prop([fc.string({ unit: "grapheme", maxLength: 300 }).filter((s) => !/[\r\n]/.test(s))])("P-U5-8b 줄 접기: 75바이트 이하, 펴면 원래 줄", (line) => {
  const folded = foldIcsLine(`X:${line}`);
  for (const l of folded) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  expect(unfoldIcs(folded.join("\r\n"))).toEqual([`X:${line}`]);
});

const eventArb = fc
  .record({ start: isoDateArb, len: fc.integer({ min: 0, max: 30 }), title: textArb, description: textArb })
  .map(({ start, len, title, description }) => ({
    noticeId: "3f2c1a9e-0000-4000-8000-000000000001",
    title,
    start,
    end: addDays(start, len),
    description,
    url: null,
  }));

test.prop([eventArb])("P-U5-8c .ics: 모든 줄 75바이트 이하, DTEND = 마감일 + 1, 제목·메모 왕복", (event) => {
  const ics = buildIcs(event, new Date("2026-10-20T00:00:00Z"));
  for (const l of ics.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  const lines = unfoldIcs(ics);
  expect(lines).toContain(`DTEND;VALUE=DATE:${addDays(event.end, 1).replaceAll("-", "")}`);
  expect(unescapeIcsText(lines.find((l) => l.startsWith("SUMMARY:"))!.slice(8))).toBe(event.title);
  expect(unescapeIcsText(lines.find((l) => l.startsWith("DESCRIPTION:"))!.slice(12))).toBe(event.description);
});

test.prop([eventArb])("P-U5-9 Google 링크를 다시 읽으면 제목·메모·날짜가 같다", (event) => {
  const url = new URL(googleCalendarUrl(event));
  expect(url.searchParams.get("text")).toBe(event.title);
  expect(url.searchParams.get("details")).toBe(event.description);
  const [s, e] = url.searchParams.get("dates")!.split("/");
  expect(s).toBe(event.start.replaceAll("-", ""));
  expect(e).toBe(addDays(event.end, 1).replaceAll("-", ""));
});

// ---------- 관심 공고 ----------

const SNAP = { title: "t", complexName: null, districts: [], applyStart: null, applyEnd: null, supplyTypes: [] };
type Op = { kind: "toggle"; id: number } | { kind: "remove"; id: number } | { kind: "refresh"; ids: number[] };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("toggle" as const), id: fc.integer({ min: 0, max: 130 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("remove" as const), id: fc.integer({ min: 0, max: 130 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("refresh" as const), ids: fc.array(fc.integer({ min: 0, max: 130 }), { maxLength: 5 }) }) },
);

test.prop([fc.array(opArb, { maxLength: 300 })])("P-U5-10 관심 공고: 어떤 순서로 바꿔도 ID 유일·100개 이하·모델과 같음, 다시 읽어도 같음", (ops) => {
  const storage = memoryStorage();
  const store = createBookmarkStore(storage);
  const model: string[] = [];
  const now = new Date("2026-10-20T00:00:00Z");
  for (const op of ops) {
    if (op.kind === "toggle") {
      const id = `n${op.id}`;
      const r = store.toggle(id, SNAP, now);
      if (model.includes(id)) {
        expect(r).toBe("removed");
        model.splice(model.indexOf(id), 1);
      } else if (model.length >= MAX_BOOKMARKS) expect(r).toBe("full");
      else {
        expect(r).toBe("added");
        model.push(id);
      }
    } else if (op.kind === "remove") {
      const id = `n${op.id}`;
      store.remove(id);
      if (model.includes(id)) model.splice(model.indexOf(id), 1);
    } else {
      store.refresh([], op.ids.map((i) => `n${i}`));
    }
    const ids = store.list().map((b) => b.id);
    expect(ids).toEqual(model);
    expect(ids.length).toBeLessThanOrEqual(MAX_BOOKMARKS);
  }
  expect(loadBookmarks(storage)).toEqual(store.list());
});

test.prop([fc.integer({ min: 0, max: 50 }), fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 20 })])(
  "P-U5-10b 같은 공고를 두 번 누르면 원래 상태",
  (id, before) => {
    const storage = memoryStorage();
    const store = createBookmarkStore(storage);
    const now = new Date("2026-10-20T00:00:00Z");
    for (const b of before) if (!store.has(`n${b}`)) store.toggle(`n${b}`, SNAP, now);
    const start = store.list();
    store.toggle(`n${id}`, SNAP, now);
    store.toggle(`n${id}`, SNAP, now);
    const end = store.list();
    if (start.some((b) => b.id === `n${id}`)) expect(end.map((b) => b.id).sort()).toEqual(start.map((b) => b.id).sort());
    else expect(end).toEqual(start);
  },
);

const bookmarkArb: fc.Arbitrary<Bookmark[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 999 }), { maxLength: 20 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({ period: applyPeriodArb, gone: fc.boolean(), day: fc.integer({ min: 0, max: 5 }) }).map(
          ({ period, gone, day }): Bookmark => ({
            id: `b${id}`,
            savedAt: `${addDays("2026-10-01", day)}T00:00:00.000Z`,
            snapshot: { ...SNAP, ...period },
            ...(gone ? { gone: true as const } : {}),
          }),
        ),
      ),
    ),
  )
  .map((xs) => xs as Bookmark[]);

test.prop([bookmarkArb.chain((xs) => fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length }))), isoDateArb])(
  "P-U5-11 관심 공고 정렬: 입력 순서와 무관, 마감 안 됨 → 마감 → 볼 수 없음",
  ([xs, shuffled], today) => {
    const a = sortBookmarks(xs, today);
    expect(sortBookmarks(shuffled, today)).toEqual(a);
    const cat = (b: Bookmark) => (b.gone ? 2 : noticeStatus(b.snapshot, today) === "closed" ? 1 : 0);
    for (let i = 1; i < a.length; i++) expect(cat(a[i - 1]!)).toBeLessThanOrEqual(cat(a[i]!));
  },
);

// ---------- 저장본 ----------

test.prop([feedItemsArb, isoDateArb, fc.integer({ min: 0, max: 60 })])(
  "P-U5-12 저장본 다시 그리기: 순서 유지 부분열, 마감 없음, 날이 갈수록 줄기만 한다",
  (items, today, later) => {
    const a = redrawCachedFeed(items, today);
    const b = redrawCachedFeed(items, addDays(today, later));
    const order = (xs: { id: string }[]) => xs.map((x) => items.findIndex((i) => i.id === x.id));
    const oa = order(a);
    expect([...oa].sort((x, y) => x - y)).toEqual(oa);
    expect(a.every((i) => noticeStatus(i, today) !== "closed")).toBe(true);
    const idsA = new Set(a.map((i) => i.id));
    expect(b.every((i) => idsA.has(i.id))).toBe(true);
  },
);

// ---------- 열어 본 기록 ----------

test.prop([
  fc.array(fc.tuple(fc.integer({ min: 0, max: 700 }), fc.integer({ min: 0, max: 30 * 24 * 60 })), { maxLength: 700 }),
  fc.integer({ min: 0, max: 700 }),
])("P-U5-13 열어 본 기록: 연 공고는 NEW가 아니고, 500개·14일을 넘지 않는다", (history, target) => {
  const storage = memoryStorage();
  const end = new Date("2026-10-20T00:00:00Z");
  const sorted = [...history].sort((x, y) => y[1] - x[1]); // 오래된 것부터 기록
  for (const [id, minutesAgo] of sorted) markSeen(storage, `n${id}`, new Date(end.getTime() - minutesAgo * 60_000));
  markSeen(storage, `n${target}`, end);
  const record = loadSeen(storage);
  expect(isNew(`n${target}`, end.toISOString(), end, seenSet(record))).toBe(false);
  expect(Object.keys(record).length).toBeLessThanOrEqual(SEEN_MAX);
  for (const at of Object.values(record)) expect(end.getTime() - Date.parse(at)).toBeLessThanOrEqual(SEEN_KEEP_MS);
});
