// 속성 기반 테스트 — 수집 (U3 기능 설계 §6의 14개 속성 + analyze 상태 기반 PBT-06)
import { fc, test } from "@fast-check/vitest";
import { expect, it } from "vitest";
import { isIsoDate, addDays } from "../../domain/dates.ts";
import { validateRequirements } from "../../domain/requirements.ts";
import { SUPPLY_TYPE_CODES } from "../../domain/supply-types.ts";
import { STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";
import { extractBlockKey, formatBlock } from "../block-key.ts";
import { baseFromGroup, buildBundle, buildUnits } from "../bundle.ts";
import { contentHash } from "../content-hash.ts";
import { parseSourceDate } from "../dates.ts";
import { flatToRequirements, parseExtraction } from "../extraction.ts";
import { groupNotices } from "../grouping.ts";
import { inScope } from "../scope.ts";
import { runAnalyze } from "../analyze-orchestrator.ts";
import { runCollect } from "../collect-orchestrator.ts";
import { mockExtractionFor } from "../mock-data.ts";
import type { NormalizedNotice } from "../types.ts";
import { blockKeyArb, blockStyleArb, normalizedArb, sourceDateArb } from "../../__tests__/arbitraries/collect.ts";
import { noticeDateArb } from "../../__tests__/arbitraries/eligibility.ts";
import {
  createMemoryCollectRepo,
  fakeClock,
  fakeExtractor,
  fakePdf,
  fakeRecomputer,
  mockCollectors,
  TODAY,
} from "../../__tests__/collect-fakes.ts";

// ---------- 날짜 ----------
test.prop([sourceDateArb])("원천 날짜 표기 변형은 모두 같은 날짜로 (왕복)", ({ iso, text }) => {
  expect(parseSourceDate(text)).toBe(iso);
});

test.prop([fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.anything())])(
  "어떤 입력이든 예외 없이 IsoDate 또는 null",
  (input) => {
    const out = parseSourceDate(input);
    expect(out === null || isIsoDate(out)).toBe(true);
  },
);

// ---------- 블록 키 ----------
const koreanWordArb = fc.constantFrom("하남교산", "공공분양", "입주자 모집", "[경기남부]", "뉴:홈", "");

test.prop([blockKeyArb, blockStyleArb, koreanWordArb, koreanWordArb])(
  "블록 표기 변형은 같은 키, extract(format(k)) = k",
  (key, style, prefix, suffix) => {
    expect(extractBlockKey(`${prefix} ${formatBlock(key, style)} ${suffix}`)).toBe(key);
  },
);

// ---------- 묶기 ----------
const noticesArb = fc.array(normalizedArb, { maxLength: 12 });
const idOf = (n: NormalizedNotice) => `${n.source}:${n.sourceNoticeNo}`;

test.prop([noticesArb, fc.array(fc.nat(), { maxLength: 12 })])("입력 순서를 바꿔도 묶음 결과가 같다", (notices, keys) => {
  const shuffled = notices.map((n, i) => ({ n, k: keys[i] ?? i })).sort((a, b) => a.k - b.k).map((x) => x.n);
  expect(groupNotices(shuffled)).toEqual(groupNotices(notices));
});

test.prop([noticesArb])("모든 원천 공고는 정확히 한 묶음에 속한다 (분할)", (notices) => {
  const ids = groupNotices(notices).flatMap((g) => g.members.map(idOf));
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(ids)).toEqual(new Set(notices.map(idOf)));
});

test.prop([noticesArb])("블록·지구·모집공고일 중 하나라도 없는 공고는 혼자 묶음", (notices) => {
  for (const g of groupNotices(notices)) {
    if (g.members.some((m) => !m.blockKey || m.districtIds.length === 0 || !m.schedule.announcedAt)) {
      expect(g.members).toHaveLength(1);
    }
  }
});

test.prop([noticesArb])("group(group(x)의 구성원) = group(x) (멱등)", (notices) => {
  const once = groupNotices(notices);
  expect(groupNotices(once.flatMap((g) => g.members))).toEqual(once);
});

// ---------- 범위·해시 ----------
test.prop([fc.option(noticeDateArb, { nil: null }), noticeDateArb, fc.integer({ min: 0, max: 400 })])(
  "오늘이 늦어지면 범위 안 공고는 줄기만 한다",
  (applyEnd, today, days) => {
    if (inScope({ applyEnd }, addDays(today, days))) expect(inScope({ applyEnd }, today)).toBe(true);
  },
);

test.prop([normalizedArb, fc.anything()])("raw만 다르면 같은 해시", async (n, raw) => {
  expect(await contentHash({ ...n, raw } as never)).toBe(await contentHash(n));
});

// ---------- 추출 검증 ----------
test.prop([fc.anything()])("어떤 JSON이 와도 예외 없음, 결과 주택형 요건은 항상 U2 검증 통과", (json) => {
  const e = parseExtraction(json);
  for (const u of e?.units ?? []) {
    if (u.requirements !== null) expect(validateRequirements(JSON.parse(JSON.stringify(u.requirements)))).not.toBeNull();
  }
  const flat = flatToRequirements(json);
  if (flat !== null) expect(validateRequirements(flat)).toEqual(flat);
});

// ---------- 번들 ----------
const extractionArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom("x/wangsuk-happy.pdf", "x/changneung-s3.pdf", "x/other.pdf").map((u) => parseExtraction(mockExtractionFor(u))),
);

test.prop([noticesArb.filter((ns) => ns.length > 0), extractionArb])(
  "번들: 주택형 1개 이상, 정의된 유형, 원천 수 = 구성원 수",
  (notices, extraction) => {
    for (const g of groupNotices(notices)) {
      const base = baseFromGroup(g);
      const units = buildUnits(base, extraction, STANDARD_REQUIREMENTS);
      const bundle = buildBundle(base, units);
      expect(units.length).toBeGreaterThanOrEqual(1);
      for (const u of units) expect(SUPPLY_TYPE_CODES).toContain(u.supply_type);
      expect(bundle.sources).toHaveLength(g.members.length);
    }
  },
);

// ---------- 오케스트레이터 멱등 ----------
const sourceSubsetArb = fc.subarray(["applyhome", "lh_rental", "gh"] as const);

test.prop([sourceSubsetArb, sourceSubsetArb])(
  "같은 원천 데이터로 두 번 실행하면 두 번째는 저장하지 않는다",
  async (fail, empty) => {
    const box = createMemoryCollectRepo();
    const deps = () => ({ collectors: mockCollectors({ fail, empty }), repo: box.repo, recomputer: fakeRecomputer(), clock: fakeClock() });
    await runCollect(deps(), { runId: "1", today: TODAY });
    const second = await runCollect(deps(), { runId: "2", today: TODAY });
    expect(second.saved).toBe(0);
  },
);

// ---------- 상태 기반 (PBT-06): collect·analyze 반복 ----------
interface Model {
  /** dedupKey → 상태 */
  notices: Map<string, { status: "pending" | "done" | "failed"; attempts: number }>;
  ghVariant: number | null;
}
interface Real {
  box: ReturnType<typeof createMemoryCollectRepo>;
}
type Cmd = fc.AsyncCommand<Model, Real>;

const keyOf = (r: Real, id: string) => r.box.notices.get(id)!.bundle.notice.dedup_key;

function checkModel(m: Model, r: Real) {
  const real = new Map([...r.box.notices.values()].map((n) => [n.bundle.notice.dedup_key, { status: n.summaryStatus, attempts: n.aiAttempts }]));
  expect(real).toEqual(m.notices);
  for (const n of r.box.notices.values()) expect(n.claimedAt).toBeNull(); // 실행이 끝나면 예약이 모두 풀려 있다
}

/** GH 공고의 마감일을 variant만큼 바꿔 "정정 공고"를 만든다 */
class CollectCmd implements Cmd {
  constructor(readonly ghVariant: number) {}
  check = () => true;
  async run(m: Model, r: Real) {
    const collectors = mockCollectors().map((c) =>
      c.source !== "gh"
        ? c
        : { source: c.source, collect: async (ctx: Parameters<typeof c.collect>[0]) => {
            const res = await c.collect(ctx);
            return { ...res, notices: res.notices.map((n) => ({ ...n, dates: { ...n.dates, applyEnd: addDays(TODAY, 6 + this.ghVariant) } })) };
          } },
    );
    const before = new Set(r.box.notices.keys());
    await runCollect({ collectors, repo: r.box.repo, recomputer: fakeRecomputer(), clock: fakeClock() }, { runId: "c", today: TODAY });
    // 모델: 새 공고는 pending/0, GH 공고는 variant가 바뀌면 pending/0
    for (const n of r.box.notices.values()) {
      const key = n.bundle.notice.dedup_key;
      const isGh = n.bundle.notice.primary_source === "gh";
      if (!before.has(n.id) || (isGh && m.ghVariant !== null && m.ghVariant !== this.ghVariant)) {
        m.notices.set(key, { status: "pending", attempts: 0 });
      }
    }
    m.ghVariant = this.ghVariant;
    checkModel(m, r);
  }
  toString = () => `Collect(gh=${this.ghVariant})`;
}

class AnalyzeCmd implements Cmd {
  constructor(readonly succeed: boolean) {}
  check = (m: Readonly<Model>) => m.notices.size > 0;
  async run(m: Model, r: Real) {
    const eligible = new Set([...m.notices.entries()].filter(([, s]) => s.status === "pending" || (s.status === "failed" && s.attempts < 3)).map(([k]) => k));
    const extractor = fakeExtractor(this.succeed ? undefined : () => "{broken");
    const clock = fakeClock();
    const summary = await runAnalyze(
      { repo: r.box.repo, pdf: fakePdf(), extractor, recomputer: fakeRecomputer(), clock },
      { runId: "a", today: TODAY, startedAtMs: clock.nowMs() },
    );
    for (const o of summary.outcomes) {
      const key = keyOf(r, o.noticeId);
      expect(eligible.has(key)).toBe(true); // 고를 수 있는 공고만 골랐다
      const s = m.notices.get(key)!;
      if (o.status === "done") m.notices.set(key, { status: "done", attempts: s.attempts + 1 });
      if (o.status === "failed") m.notices.set(key, { status: "failed", attempts: s.attempts + 1 });
    }
    checkModel(m, r);
  }
  toString = () => `Analyze(${this.succeed ? "ok" : "fail"})`;
}

const commandsArb = fc.commands(
  [fc.integer({ min: 0, max: 2 }).map((v) => new CollectCmd(v)), fc.boolean().map((ok) => new AnalyzeCmd(ok))],
  { maxCommands: 20 },
);

const baseRuns = Number(process.env.FC_NUM_RUNS ?? "100");

it("상태 기반: collect·analyze를 섞어도 공고별 AI 상태·시도 횟수 = 모델 (PBT-06)", async () => {
  await fc.assert(
    fc.asyncProperty(commandsArb, async (cmds) => {
      await fc.asyncModelRun(() => ({ model: { notices: new Map(), ghVariant: null }, real: { box: createMemoryCollectRepo() } }), cmds);
    }),
    { numRuns: Math.max(10, Math.floor(baseRuns / 2)) },
  );
}, 120_000);
