// U5 API 응답 형식 (domain-entities §2~4) — 서버 핸들러와 화면이 함께 쓴다
import type { IsoDate } from "@shared/domain/dates.ts";
import type { SourceCode } from "@shared/db/types.ts";
import type { NoticeRegion, UnitJudgement, Verdict } from "@shared/eligibility/types.ts";
import type { DistrictRef, FeedItem } from "@shared/feed/visible.ts";

export type { DistrictRef, FeedItem };

export type FeedState = "ready" | "outdated" | "no_profile";

export interface FeedResponse {
  state: FeedState;
  today: IsoDate;
  generatedAt: string;
  items: FeedItem[];
}

export interface Schedule {
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  resultAt: IsoDate | null;
  contractStart: IsoDate | null;
  contractEnd: IsoDate | null;
}

export interface UnitInfo {
  id: string;
  label: string | null;
  supplyType: string;
  plain: string;
  formal: string;
  exclusiveAreaM2: number | null;
  supplyCount: number | null;
}

export interface SourceLink {
  source: SourceCode;
  label: string;
  url: string;
  primary: boolean;
}

export interface NoticeDetail {
  id: string;
  title: string;
  complexName: string | null;
  location: string | null;
  provider: string;
  tenure: "sale" | "rent";
  schedule: Schedule;
  status: "upcoming" | "open" | "closed";
  districts: DistrictRef[];
  /** 공고 지역 (변경 2, 공용 목록 순서) */
  regions: NoticeRegion[];
  units: UnitInfo[];
  /** BR-U5-95 조건을 만족할 때만 */
  summary: { eligibilityPlain: string; forSeniorCouple: string } | null;
  /** http(s)만, 대표가 맨 앞 (BR-U5-100~102) */
  sources: SourceLink[];
  firstSeenAt: string;
}

export interface JudgementView {
  verdict: Verdict;
  inDistrict: boolean;
  visible: boolean;
  outdated: boolean;
  baseDate: IsoDate;
  units: UnitJudgement[];
}

export interface NoticeDetailResponse {
  today: IsoDate;
  profile: "present" | "none";
  notice: NoticeDetail;
  judgement: JudgementView | null;
}

export interface NoticeSummary {
  id: string;
  title: string;
  complexName: string | null;
  districts: string[];
  /** 공고 지역 (변경 2) */
  regions: NoticeRegion[];
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  status: "upcoming" | "open" | "closed";
  /** 공고 전체 유형의 쉬운 말, 최대 3개 */
  supplyTypes: string[];
}

export interface NoticeSummariesResponse {
  today: IsoDate;
  items: NoticeSummary[];
  missing: string[];
}
