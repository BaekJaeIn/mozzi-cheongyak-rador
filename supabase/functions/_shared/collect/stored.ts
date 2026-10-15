// DB 행 → 수집 타입 변환 (L-U3-7의 순수 부분). Deno collect-repository가 쓰고 Vitest로 검사한다.
import { isIsoDate, type IsoDate } from "../domain/dates.ts";
import { SUPPLY_TYPE_CODES, type SupplyTypeCode } from "../domain/supply-types.ts";
import type { BundleBase } from "./bundle.ts";
import type { StoredSourceState } from "./ports.ts";
import type { Attachment, CollectRunRecord, CollectSource } from "./types.ts";

const COLLECT_SOURCES: readonly CollectSource[] = ["applyhome", "lh_rental", "gh"];

export interface StoredNoticeRow {
  dedup_key: string;
  title: string;
  complex_name: string | null;
  location: string | null;
  sido: string | null;
  sigungu: string | null;
  provider: string;
  primary_source: string;
  tenure: "sale" | "rent";
  announced_at: string | null;
  apply_start: string | null;
  apply_end: string | null;
  result_at: string | null;
  contract_start: string | null;
  contract_end: string | null;
  ai_attempts: number;
  source_notices: {
    source: string;
    source_notice_no: string;
    original_url: string;
    raw: unknown;
    content_hash: string;
    attachments: unknown;
  }[] | null;
  housing_units: { supply_type: string; label: string | null }[] | null;
  notice_districts: { district_id: string }[] | null;
}

const isoOrNull = (v: string | null): IsoDate | null => (v !== null && isIsoDate(v) ? v : null);

function isCollectSource(v: string): v is CollectSource {
  return (COLLECT_SOURCES as readonly string[]).includes(v);
}

export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a) => {
    const o = a as { name?: unknown; url?: unknown } | null;
    return o && typeof o.name === "string" && typeof o.url === "string" && /^https?:\/\//.test(o.url) ? [{ name: o.name, url: o.url }] : [];
  });
}

/**
 * 저장된 공고 → analyze용 BundleBase. 공급유형은 (표준 요건 상태의) 첫 주택형 기준.
 * 수집 대상이 아닌 원천(옛 소스)은 빼고, 남는 원천이 없으면 null.
 */
export function baseFromStoredNotice(row: StoredNoticeRow): { base: BundleBase; aiAttempts: number } | null {
  const sources = (row.source_notices ?? [])
    .filter((s): s is typeof s & { source: CollectSource } => isCollectSource(s.source))
    .map((s) => ({
      source: s.source,
      source_notice_no: s.source_notice_no,
      original_url: s.original_url,
      raw: s.raw,
      content_hash: s.content_hash,
      attachments: parseAttachments(s.attachments),
    }))
    // 대표 원천을 앞에 (PDF는 앞 원천부터 찾는다, BR-U3-33·60)
    .sort((a, b) => {
      const pa = a.source === row.primary_source ? 0 : 1;
      const pb = b.source === row.primary_source ? 0 : 1;
      const ka = `${a.source}:${a.source_notice_no}`;
      const kb = `${b.source}:${b.source_notice_no}`;
      return pa - pb || (ka < kb ? -1 : ka > kb ? 1 : 0);
    });
  if (sources.length === 0 || !isCollectSource(row.primary_source)) return null;

  const units = [...(row.housing_units ?? [])].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
  const first = units[0]?.supply_type;
  const supplyType: SupplyTypeCode = first && (SUPPLY_TYPE_CODES as readonly string[]).includes(first) ? (first as SupplyTypeCode) : "other";

  return {
    aiAttempts: row.ai_attempts,
    base: {
      dedupKey: row.dedup_key,
      title: row.title,
      complexName: row.complex_name,
      location: row.location,
      sido: row.sido,
      sigungu: row.sigungu,
      provider: row.provider,
      primarySource: row.primary_source,
      tenure: row.tenure,
      supplyType,
      schedule: {
        announcedAt: isoOrNull(row.announced_at),
        applyStart: isoOrNull(row.apply_start),
        applyEnd: isoOrNull(row.apply_end),
        resultAt: isoOrNull(row.result_at),
        contractStart: isoOrNull(row.contract_start),
        contractEnd: isoOrNull(row.contract_end),
      },
      districtIds: (row.notice_districts ?? []).map((d) => d.district_id).sort(),
      sources,
    },
  };
}

export interface CollectStateRow {
  source: string;
  source_notice_no: string;
  notice_id: string;
  dedup_key: string;
  content_hash: string;
  summary_status: "pending" | "done" | "failed";
  ai_attempts: number;
}

export function toStoredSourceState(rows: readonly CollectStateRow[]): StoredSourceState[] {
  return rows.flatMap((r) =>
    isCollectSource(r.source)
      ? [{
          source: r.source,
          sourceNoticeNo: r.source_notice_no,
          noticeId: r.notice_id,
          dedupKey: r.dedup_key,
          contentHash: r.content_hash,
          summaryStatus: r.summary_status,
          aiAttempts: r.ai_attempts,
        }]
      : []
  );
}

export function collectRunRow(r: CollectRunRecord): Record<string, unknown> {
  return {
    run_id: r.runId,
    source: r.source,
    ok: r.ok,
    fetched_count: r.fetchedCount,
    upserted_count: r.upsertedCount,
    warning: r.warning,
    error: r.error,
    started_at: r.startedAt.toISOString(),
    finished_at: r.finishedAt.toISOString(),
  };
}
