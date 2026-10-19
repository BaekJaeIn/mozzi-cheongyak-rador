// 예시 기반 테스트 — DB 행 → 수집 타입 변환 (Deno collect-repository의 순수 부분)
import { describe, expect, it } from "vitest";
import { baseFromStoredNotice, collectRunRow, parseAttachments, type StoredNoticeRow, toStoredSourceState } from "../stored.ts";
import { pickNoticePdfFromSources } from "../pdf-locator.ts";

const row = (over: Partial<StoredNoticeRow> = {}): StoredNoticeRow => ({
  dedup_key: "wangsuk|A1|2026-10-01",
  title: "남양주왕숙 A1블록 행복주택",
  complex_name: null,
  location: "경기도 남양주시 진접읍",
  sido: "경기",
  sigungu: "남양주시",
  provider: "LH",
  primary_source: "lh_rental",
  tenure: "rent",
  announced_at: "2026-10-01",
  apply_start: "2026-10-20",
  apply_end: "2026-10-22",
  result_at: null,
  contract_start: null,
  contract_end: "not-a-date",
  ai_attempts: 1,
  source_notices: [
    { source: "applyhome", source_notice_no: "1", original_url: "https://a/1", raw: null, content_hash: "h1", attachments: [{ name: "모집공고.pdf", url: "https://a/a.pdf" }] },
    { source: "lh_rental", source_notice_no: "9", original_url: "https://l/9", raw: { x: 1 }, content_hash: "h9", attachments: [{ name: "입주자모집공고문.pdf", url: "https://l/l.pdf" }] },
    { source: "sh_old", source_notice_no: "old", original_url: "https://s", raw: null, content_hash: "h", attachments: [] },
  ],
  housing_units: [{ supply_type: "happy_senior", label: null }],
  notice_districts: [{ district_id: "wangsuk" }],
  ...over,
});

describe("baseFromStoredNotice", () => {
  it("대표 원천을 앞에 두어 그 원천의 PDF를 먼저 고른다, 수집 대상 아닌 원천은 뺀다", () => {
    const { base, aiAttempts } = baseFromStoredNotice(row())!;
    expect(aiAttempts).toBe(1);
    expect(base.sources.map((s) => s.source)).toEqual(["lh_rental", "applyhome"]);
    expect(pickNoticePdfFromSources(base.sources)?.url).toBe("https://l/l.pdf");
    expect(base.supplyType).toBe("happy_senior");
    expect(base.schedule).toMatchObject({ applyEnd: "2026-10-22", contractEnd: null });
  });

  it("모르는 공급유형은 other, 원천이 없으면 null", () => {
    expect(baseFromStoredNotice(row({ housing_units: [{ supply_type: "??", label: null }] }))!.base.supplyType).toBe("other");
    expect(baseFromStoredNotice(row({ source_notices: [] }))).toBeNull();
  });

  it("첨부: http(s) 주소인 항목만", () => {
    expect(parseAttachments([{ name: "a", url: "javascript:x" }, { name: "b", url: "https://x/b.pdf" }, null, "c"])).toEqual([
      { name: "b", url: "https://x/b.pdf" },
    ]);
    expect(parseAttachments(null)).toEqual([]);
  });
});

describe("상태·기록 행", () => {
  it("수집 대상 원천만 상태로", () => {
    const base = { notice_id: "n", dedup_key: "k", content_hash: "h", summary_status: "done" as const, ai_attempts: 0 };
    expect(toStoredSourceState([{ ...base, source: "gh", source_notice_no: "1" }, { ...base, source: "sh_old", source_notice_no: "2" }])).toEqual([
      { source: "gh", sourceNoticeNo: "1", noticeId: "n", dedupKey: "k", contentHash: "h", summaryStatus: "done", aiAttempts: 0 },
    ]);
  });

  it("실행 기록 → collect_runs 행", () => {
    const t = new Date("2026-10-15T00:00:00Z");
    expect(collectRunRow({ runId: "r", source: "all", ok: true, fetchedCount: 1, upsertedCount: 2, warning: null, error: null, startedAt: t, finishedAt: t })).toEqual({
      run_id: "r", source: "all", ok: true, fetched_count: 1, upserted_count: 2, warning: null, error: null,
      started_at: "2026-10-15T00:00:00.000Z", finished_at: "2026-10-15T00:00:00.000Z",
    });
  });
});
