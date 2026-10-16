// U5 조회 저장소 형식 (Node 전용 — Deno 쪽 공고·판정 저장소 계약 K2는 바꾸지 않는다)
import type { IsoDate } from "@shared/domain/dates.ts";
import type { SourceCode, SummaryStatus, Tenure, Verdict } from "@shared/db/types.ts";

export interface DistrictInfo {
  id: string;
  name: string;
  sortOrder: number;
}

export interface NoticeCore {
  id: string;
  title: string;
  complexName: string | null;
  location: string | null;
  provider: string;
  primarySource: SourceCode;
  tenure: Tenure;
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  resultAt: IsoDate | null;
  contractStart: IsoDate | null;
  contractEnd: IsoDate | null;
  summary: unknown;
  summaryStatus: SummaryStatus;
  /** ISO 시각 */
  firstSeenAt: string;
}

/** 피드 후보 1행: 판정 + 공고 + 지구 */
export interface FeedRow {
  verdict: Verdict;
  inDistrict: boolean;
  score: number | null;
  detail: unknown;
  notice: Pick<NoticeCore, "id" | "title" | "complexName" | "tenure" | "applyStart" | "applyEnd" | "firstSeenAt">;
  districts: DistrictInfo[];
}

export interface UnitRow {
  id: string;
  label: string | null;
  supplyType: string;
  exclusiveAreaM2: number | null;
  supplyCount: number | null;
}

export interface SourceRow {
  source: SourceCode;
  originalUrl: string;
  /** ISO 시각 */
  lastSeenAt: string;
}

export interface NoticeBundle {
  notice: NoticeCore;
  units: UnitRow[];
  districts: DistrictInfo[];
  sources: SourceRow[];
}

export interface JudgementRecord {
  verdict: Verdict;
  inDistrict: boolean;
  detail: unknown;
  profileVersion: number;
}

export interface JudgementStats {
  count: number;
  minProfileVersion: number | null;
}

export interface FeedQueryRepository {
  /** 이 기기의 판정 중 verdict≠ineligible·in_district, 마감일 ≥ today 또는 없음 (BR-U5-01 1차 거름) */
  listFeedRows(deviceId: string, today: IsoDate): Promise<FeedRow[]>;
  judgementStats(deviceId: string): Promise<JudgementStats>;
  countNotices(): Promise<number>;
  getJudgement(deviceId: string, noticeId: string): Promise<JudgementRecord | null>;
  getNoticeBundle(noticeId: string): Promise<NoticeBundle | null>;
  /** 관심 공고 갱신용 — 없는 ID는 결과에 없음 */
  listNoticeBundles(noticeIds: readonly string[]): Promise<NoticeBundle[]>;
}
