// 관심 지역 공유 표 (U3 변경 2 P-U3-C3, P-U3-C5): SQL interest_area_match(pgTAP)와 TS inInterestArea가 같은 표를 통과해야 한다.
// 표는 supabase/tests/collect-regions.test.sql 한 곳에만 두고 여기서 읽는다.
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

describe("관심 지역 공유 표 — TS 판정", () => {
  const rows = parseRows(table);

  it("표 12쌍을 읽는다", () => {
    expect(rows).toHaveLength(12);
  });

  it.each(rows.map((r) => [r.label, r] as const))("%s", (_label, row) => {
    const prefs = { districtIds: row.prefs.districtIds ?? [], regions: row.prefs.regions ?? [] }; // 버전 1 관심은 regions 없음 = 빈 목록
    expect(inInterestArea({ districtIds: row.districts, regions: parseNoticeRegions(row.regions) }, prefs)).toBe(row.expected);
  });
});
