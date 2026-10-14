// 판정 재계산 서비스 S2 (BR-U2-80~84, P-U2-R1~R4, 계약 K6)
// Node(U4 저장 API)와 Deno(U3 일일 수집)가 각자 Repository·keyring을 주입해 쓴다.
import type { IsoDate } from "../domain/dates.ts";
import type { JsonObject, Judgement } from "../db/types.ts";
import type {
  JudgementRepository,
  NoticeRepository,
  ProfileRepository,
  ReferenceDataRepository,
  ReplaceResult,
} from "../db/repositories.ts";
import { type EligibilityReference, judgeNotice } from "../eligibility/engine.ts";
import { createIncomeTable } from "../eligibility/income-table.ts";
import type { NoticeForJudgement, NoticeJudgement, Verdict } from "../eligibility/types.ts";
import type { Logger } from "../log/logger.ts";
import { decodeProfile } from "../security/profile-codec.ts";
import type { Keyring } from "../security/amount-cipher.ts";

export interface JudgementServiceDeps {
  profiles: Pick<ProfileRepository, "get" | "listDeviceIdsWithProfile">;
  notices: Pick<NoticeRepository, "listRetainedWithUnits">;
  reference: Pick<ReferenceDataRepository, "loadIncomeThresholds">;
  judgements: JudgementRepository;
  keyring: () => Promise<Keyring>;
  log?: Logger;
  /** 판정 저장 시각 (computedAt) */
  now?: () => Date;
}

export type DeviceRecomputeStatus = ReplaceResult | "no_profile";

export interface VerdictCounts {
  eligible: number;
  unknown: number;
  ineligible: number;
  /** "기준표 없음" 사유가 있는 판정 수 (RK-U2-1 단서) */
  incomeTableMissing: number;
}

export interface RecomputeAllSummary {
  devices: number;
  succeeded: number;
  skippedStale: number;
  failed: number;
  notices: number;
  counts: VerdictCounts;
  ms: number;
}

const emptyCounts = (): VerdictCounts => ({ eligible: 0, unknown: 0, ineligible: 0, incomeTableMissing: 0 });

function tally(counts: VerdictCounts, judgements: readonly NoticeJudgement[]): void {
  for (const j of judgements) {
    counts[j.verdict as Verdict] += 1;
    if (j.units.some((u) => u.criteria.some((c) => c.code.endsWith("income_table_missing")))) counts.incomeTableMissing += 1;
  }
}

export function toJudgementRow(deviceId: string, profileVersion: number, j: NoticeJudgement, computedAt: Date): Judgement {
  return {
    deviceId,
    noticeId: j.noticeId,
    verdict: j.verdict,
    inDistrict: j.inDistrict,
    score: j.score,
    detail: { baseDate: j.baseDate, units: j.units } as unknown as JsonObject,
    profileVersion,
    computedAt,
  };
}

export function createJudgementService(deps: JudgementServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function loadShared(): Promise<{ ref: EligibilityReference; notices: NoticeForJudgement[] }> {
    const [thresholds, notices] = await Promise.all([
      deps.reference.loadIncomeThresholds(),
      deps.notices.listRetainedWithUnits(),
    ]);
    return { ref: { incomeTable: createIncomeTable(thresholds) }, notices };
  }

  /** 기기 1대: 프로필 읽기 → 복호화 → 모든 보관 공고 판정 → 버전 확인 저장 */
  async function computeAndSave(
    deviceId: string,
    shared: { ref: EligibilityReference; notices: NoticeForJudgement[] },
    asOf: IsoDate,
    counts: VerdictCounts,
  ): Promise<DeviceRecomputeStatus> {
    const stored = await deps.profiles.get(deviceId);
    if (!stored) return "no_profile"; // BR-U2-84
    const profile = await decodeProfile(stored, await deps.keyring()); // 복호화 금액은 이 함수 안에서만 (P-U2-S2)
    const judged = shared.notices.map((n) => judgeNotice(profile, n, shared.ref, asOf));
    tally(counts, judged);
    const computedAt = now();
    const rows = judged.map((j) => toJudgementRow(deviceId, stored.profileVersion, j, computedAt));
    return deps.judgements.replaceForDevice(deviceId, stored.profileVersion, rows); // P-U2-R3
  }

  return {
    /** 프로필 저장 직후 (U4). 실패는 호출한 쪽이 기록하고 저장 응답은 성공으로 (P-U2-R2) */
    async recomputeForDevice(deviceId: string, asOf: IsoDate): Promise<{ status: DeviceRecomputeStatus; counts: VerdictCounts }> {
      const counts = emptyCounts();
      const status = await computeAndSave(deviceId, await loadShared(), asOf, counts);
      deps.log?.info("recompute.device", { deviceId, status, ...counts });
      return { status, counts };
    },

    /** 일일 수집 뒤 (U3). 기기 하나의 실패는 격리 (P-U2-R1) */
    async recomputeAll(asOf: IsoDate): Promise<RecomputeAllSummary> {
      const started = Date.now();
      const shared = await loadShared(); // BR-U2-81
      const deviceIds = await deps.profiles.listDeviceIdsWithProfile();
      const counts = emptyCounts();
      const summary: RecomputeAllSummary = {
        devices: deviceIds.length,
        succeeded: 0,
        skippedStale: 0,
        failed: 0,
        notices: shared.notices.length,
        counts,
        ms: 0,
      };
      for (const deviceId of deviceIds) {
        try {
          const status = await computeAndSave(deviceId, shared, asOf, counts);
          if (status === "saved") summary.succeeded += 1;
          else if (status === "stale") summary.skippedStale += 1;
        } catch (error) {
          summary.failed += 1; // BR-U2-82: 기존 판정 유지, 다음 기기 계속
          deps.log?.error("recompute.device_failed", {
            deviceId,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      summary.ms = Date.now() - started;
      deps.log?.info("recompute.all", { ...summary, ...counts });
      return summary;
    },
  };
}

export type JudgementService = ReturnType<typeof createJudgementService>;
