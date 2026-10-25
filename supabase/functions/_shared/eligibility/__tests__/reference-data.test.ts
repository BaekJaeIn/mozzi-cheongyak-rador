// 기준 데이터 원본(TS) ↔ 마이그레이션 시드(SQL) 대조 (NFR-U2-19)
// 시드를 고치면 reference-data.ts도 같이 고쳐야 한다 — 다르면 이 테스트가 실패한다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateRequirements } from "../../domain/requirements.ts";
import { SUPPLY_TYPE_CODES, SUPPLY_TYPES } from "../../domain/supply-types.ts";
import { DISTRICTS, INCOME_THRESHOLDS, STANDARD_REQUIREMENTS } from "../reference-data.ts";

// 0006 + 0012(변경 3 신혼희망타운) + 0013(신혼·생애최초 물량) + 0015(변경 4 계층 모름)
const sql = ["0006_eligibility_reference.sql", "0012_household_kind.sql", "0013_reanalysis.sql", "0015_audiences.sql"]
  .map((name) => readFileSync(new URL(`../../../../migrations/${name}`, import.meta.url), "utf8"))
  .join("\n");
const lines = sql.split(/\r?\n/);
const pgArray = (text: string) =>
  text
    .slice(1, -1)
    .split(",")
    .map((s) => s.replace(/^"|"$/g, ""));

describe("0006·0012·0013·0015 시드 = reference-data.ts", () => {
  it("공급유형 표준 요건 15개", () => {
    const rows = lines
      .map((l) => /^\s*\('([a-z_]+)', '([^']+)', '([^']+)', '(sale|rent)', '(\{.*\})'::jsonb, '2026-01-01'\)/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null);
    expect(rows.map((m) => m[1]).sort()).toEqual([...SUPPLY_TYPE_CODES].sort());
    for (const m of rows) {
      const code = m[1] as keyof typeof STANDARD_REQUIREMENTS;
      expect(JSON.parse(m[5]!), code).toEqual(JSON.parse(JSON.stringify(STANDARD_REQUIREMENTS[code])));
      expect({ formal: m[2], plain: m[3], tenure: m[4] }, code).toEqual(SUPPLY_TYPES[code]);
      expect(validateRequirements(JSON.parse(m[5]!)), code).not.toBeNull();
    }
  });

  it("소득 기준표 15행", () => {
    const rows = lines
      .map((l) => /^\s*\((\d{4}), 'monthly_income', (\d), '(urban_worker|median)', (\d+)\)/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ year: Number(m[1]), basis: m[3], householdSize: Number(m[2]), amountWon: Number(m[4]) }));
    expect(rows).toEqual([...INCOME_THRESHOLDS]);
  });

  it("지구 6개", () => {
    const rows = lines
      .map((l) => /^\s*\('([a-z_]+)', '([^']+)', '([^']+)', '(\{[^}]*\})', '(\{[^}]*\})', '(\{[^}]*\})', (true|false), (\d+)\)/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({
        id: m[1],
        name: m[2],
        sido: m[3],
        sigungu: pgArray(m[4]!),
        keywords: pgArray(m[5]!),
        areaKeywords: pgArray(m[6]!),
        active: m[7] === "true",
        sortOrder: Number(m[8]),
      }));
    expect(rows).toEqual([...DISTRICTS]);
  });
});
