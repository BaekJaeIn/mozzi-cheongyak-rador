// 관심 지역 공유 표 (U3 변경 2 P-U3-C3, P-U3-C5): SQL interest_area_match(pgTAP)와 TS inInterestArea가 같은 표를 통과해야 한다.
// 표는 supabase/tests/collect-regions.test.sql 한 곳에만 두고 여기서 읽는다.
// 변경 4 (BR-U2-E1): SQL은 AI 분석 대상 고르기라 시도까지만 공고를 그 시도의 관심 시군구에 넣는다(분석해야 시군구를 찾는다).
// 판정(TS)은 시도 전체를 고른 경우에만 넣는다 — 이 차이가 나는 줄은 TS 기대를 false로 본다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RegionPick } from "../../domain/profile.ts";
import { inInterestArea, parseNoticeRegions } from "../../eligibility/area.ts";

const sql = readFileSync(new URL("../../../../tests/collect-regions.test.sql", import.meta.url), "utf8");
const table = sql.slice(sql.indexOf("[TABLE-START]"), sql.indexOf("[TABLE-END]"));

interface Row {
  label: string;
  districts: string[];
  regions: unknown;
  prefs: { districtIds?: string[]; regions?: RegionPick[] };
  expected: boolean;
}

function parseRows(text: string): Row[] {
  const out: Row[] = [];
  const re = /\('([^']+)', array\[([^\]]*)\](?:::text\[\])?, '([^']*)', '([^']*)', (true|false)\)/g;
  for (const m of text.matchAll(re)) {
    out.push({
      label: m[1]!,
      districts: m[2]!.split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean),
      regions: JSON.parse(m[3]!),
      prefs: JSON.parse(m[4]!),
      expected: m[5] === "true",
    });
  }
  return out;
}

/** 시도까지만 공고 + 관심 시군구만 — SQL(분석 대상)은 true, 판정은 false (변경 4 BR-U2-E1) */
const SIDO_ONLY_DIFFERS = ["공고가 시도까지만"];

describe("관심 지역 공유 표 — TS 판정", () => {
  const rows = parseRows(table);

  it("표 12쌍을 읽는다", () => {
    expect(rows).toHaveLength(12);
  });

  it.each(rows.map((r) => [r.label, r] as const))("%s", (_label, row) => {
    const prefs = { districtIds: row.prefs.districtIds ?? [], regions: row.prefs.regions ?? [] }; // 버전 1 관심은 regions 없음 = 빈 목록
    const expected = SIDO_ONLY_DIFFERS.includes(row.label) ? false : row.expected;
    expect(inInterestArea({ districtIds: row.districts, regions: parseNoticeRegions(row.regions) }, prefs)).toBe(expected);
  });

  it("SQL과 판정이 다른 줄은 표에 있는 줄이다", () => {
    for (const label of SIDO_ONLY_DIFFERS) expect(rows.find((r) => r.label === label)?.expected).toBe(true);
  });
});
