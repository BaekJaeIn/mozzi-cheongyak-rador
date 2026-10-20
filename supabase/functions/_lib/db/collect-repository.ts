// CollectRepository Deno 구현 (L-U3-7) — 0007 DB 함수 호출. 규칙은 _shared/__tests__/collect-fakes.ts 메모리 구현과 같다.
import type { CollectRepository } from "../../_shared/collect/ports.ts";
import {
  baseFromStoredNotice,
  collectRunRow,
  type CollectStateRow,
  type StoredNoticeRow,
  toStoredSourceState,
} from "../../_shared/collect/stored.ts";
import type { Requirements } from "../../_shared/domain/requirements.ts";
import { validateRequirements } from "../../_shared/domain/requirements.ts";
import { type DbClient, DbError } from "./client.ts";
import { createReferenceRepository } from "./repositories.ts";

export function createCollectRepository(db: DbClient): CollectRepository {
  const reference = createReferenceRepository(db);
  return {
    loadDistricts: () => reference.listDistricts(),

    async loadStandards() {
      const { data, error } = await db.from("supply_type_standards").select("code, requirements");
      if (error) throw new DbError("supply_type_standards.requirements", error);
      const out: Record<string, Requirements> = {};
      for (const r of (data ?? []) as { code: string; requirements: unknown }[]) {
        const req = validateRequirements(r.requirements);
        if (req) out[r.code] = req;
      }
      return out;
    },

    async collectState(keys) {
      if (keys.length === 0) return [];
      const { data, error } = await db.rpc("collect_state", {
        p_keys: keys.map((k) => ({ source: k.source, source_notice_no: k.sourceNoticeNo })),
      });
      if (error) throw new DbError("collect_state", error);
      return toStoredSourceState((data ?? []) as CollectStateRow[]);
    },

    async sourceTitles(source) {
      // 원천별 저장 글번호 → 제목 (SH 상세 줄이기, P-U3-C5). 최근 글 위주라 1,000행이면 충분
      const { data, error } = await db.from("source_notices").select("source_notice_no, raw").eq("source", source).limit(1000);
      if (error) throw new DbError("source_notices.titles", error);
      const out = new Map<string, string>();
      for (const r of (data ?? []) as { source_notice_no: string; raw: { title?: unknown } | null }[]) {
        if (typeof r.raw?.title === "string") out.set(r.source_notice_no, r.raw.title);
      }
      return out;
    },

    async upsertBundle(bundle) {
      const { data, error } = await db.rpc("upsert_notice_bundle", { p_bundle: bundle });
      if (error) throw new DbError("upsert_notice_bundle", error);
      if (typeof data !== "string") throw new DbError("upsert_notice_bundle: id 없음", null);
      return data;
    },

    async claimForAnalysis(limit, now) {
      const { data, error } = await db.rpc("claim_notices_for_analysis", { p_limit: limit, p_now: now.toISOString() });
      if (error) throw new DbError("claim_notices_for_analysis", error);
      return ((data ?? []) as (string | { id: string })[]).map((r) => (typeof r === "string" ? r : r.id));
    },

    async loadForAnalysis(noticeId) {
      const { data, error } = await db
        .from("notices")
        .select(
          "dedup_key, title, complex_name, location, sido, sigungu, provider, primary_source, tenure, announced_at, apply_start, apply_end, result_at, contract_start, contract_end, ai_attempts, regions, source_notices(source, source_notice_no, original_url, raw, content_hash, attachments), housing_units(supply_type, label), notice_districts(district_id)",
        )
        .eq("id", noticeId)
        .maybeSingle();
      if (error) throw new DbError("notices.loadForAnalysis", error);
      return data ? baseFromStoredNotice(data as StoredNoticeRow) : null;
    },

    async releaseClaim(noticeId, failed) {
      const { error } = await db.rpc("release_notice_claim", { p_notice_id: noticeId, p_failed: failed });
      if (error) throw new DbError("release_notice_claim", error);
    },

    async claimForReanalysis(limit, now) {
      const { data, error } = await db.rpc("claim_notices_for_reanalysis", { p_limit: limit, p_now: now.toISOString() });
      if (error) throw new DbError("claim_notices_for_reanalysis", error);
      return ((data ?? []) as (string | { id: string })[]).map((r) => (typeof r === "string" ? r : r.id));
    },

    async releaseReanalysis(noticeId) {
      const { error } = await db.rpc("release_reanalysis", { p_notice_id: noticeId });
      if (error) throw new DbError("release_reanalysis", error);
    },

    async recordRun(record) {
      const { error } = await db.from("collect_runs").insert(collectRunRow(record));
      if (error) throw new DbError("collect_runs.insert", error);
    },
  };
}
