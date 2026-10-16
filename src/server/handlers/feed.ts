// U5 API 핸들러 (S4): GET /api/feed, GET /api/notices/[id], GET /api/notices?ids=, GET /api/notices/[id]/calendar
// 판정은 계산하지 않고 읽기만 한다(AD-3). 단, 피드는 판정이 오래됐으면 그 자리에서 한 번 다시 계산한다 (BR-U5-04).
// 로그에는 건수·결과만 남긴다 — 판정 내용·프로필은 남기지 않는다 (BR-U5-130 공통).
import "server-only";
import type { ProfileRepository } from "@shared/db/repositories.ts";
import type { StoredProfile } from "@shared/db/types.ts";
import { type IsoDate, toKstDate } from "@shared/domain/dates.ts";
import { createLogger, type LogSink } from "@shared/log/logger.ts";
import type { DeviceRecomputeStatus } from "@shared/services/judgement-service.ts";
import { buildIcs, calendarEvent, icsFileName } from "@/features/notice/model/calendar";
import type { FeedResponse, FeedState, NoticeDetailResponse, NoticeSummariesResponse } from "@/features/notice/model/api-types";
import type { DeviceContext } from "../auth/route-guard";
import {
  buildFeed,
  isNoticeId,
  needsRecompute,
  pickSources,
  toJudgementView,
  toNoticeDetail,
  toNoticeSummary,
  type TypeLabels,
} from "../feed/build";
import type { FeedQueryRepository } from "../feed/types";
import { errorResponse, json, newRequestId, REQUEST_ID_HEADER } from "../http/respond";

export const MAX_SUMMARY_IDS = 100;

export interface FeedDeps {
  feed: () => FeedQueryRepository;
  profiles: () => ProfileRepository;
  labels: () => Promise<TypeLabels>;
  recompute: (deviceId: string, asOf: IsoDate) => Promise<{ status: DeviceRecomputeStatus }>;
  now: () => Date;
}

/** 서버 프로필의 관심 지구 (평문 부분만 읽는다 — 금액 복호화 안 함) */
export function interestDistrictIds(stored: StoredProfile | null): string[] {
  const prefs = (stored?.data as { prefs?: { districtIds?: unknown } } | undefined)?.prefs;
  const ids = prefs?.districtIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

/** "/api/notices/{id}" 또는 "/api/notices/{id}/calendar"에서 공고 ID */
export function noticeIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("notices");
  return i >= 0 ? decodeURIComponent(parts[i + 1] ?? "") : "";
}

/** GET /api/feed (BR-U5-01~05·130) */
export function createFeedHandler(deps: FeedDeps) {
  return async ({ deviceId, requestId, log }: DeviceContext): Promise<Response> => {
    const now = deps.now();
    const today = toKstDate(now);
    const respond = (state: FeedState, items: FeedResponse["items"]) =>
      json({ state, today, generatedAt: now.toISOString(), items } satisfies FeedResponse, 200, requestId);

    const stored = await deps.profiles().get(deviceId);
    if (!stored) return respond("no_profile", []);

    let state: FeedState = "ready";
    const feed = deps.feed();
    const stats = await feed.judgementStats(deviceId);
    const noticeCount = stats.count === 0 ? await feed.countNotices() : 0;
    if (needsRecompute(stats, stored.profileVersion, noticeCount)) {
      try {
        const { status } = await deps.recompute(deviceId, today);
        if (status === "no_profile") return respond("no_profile", []);
        if (status !== "saved") state = "outdated"; // 그 사이 프로필이 또 바뀜 — 다음 요청에서 다시
      } catch (error) {
        log.error("feed.recompute.failed", { error: error instanceof Error ? error.name : "unknown" });
        state = "outdated";
      }
    }

    const [rows, labels] = await Promise.all([feed.listFeedRows(deviceId, today), deps.labels()]);
    const items = buildFeed(rows, today, labels, interestDistrictIds(stored));
    log.info("feed.served", { state, count: items.length });
    return respond(state, items);
  };
}

/** GET /api/notices/[id] (BR-U5-131) */
export function createNoticeDetailHandler(deps: FeedDeps) {
  return async ({ req, deviceId, requestId }: DeviceContext): Promise<Response> => {
    const id = noticeIdFromUrl(req.url);
    if (!isNoticeId(id)) return errorResponse("NOT_FOUND", 404, requestId);
    const feed = deps.feed();
    const [bundle, stored] = await Promise.all([feed.getNoticeBundle(id), deps.profiles().get(deviceId)]);
    if (!bundle) return errorResponse("NOT_FOUND", 404, requestId);

    const today = toKstDate(deps.now());
    const [labels, record] = await Promise.all([deps.labels(), stored ? feed.getJudgement(deviceId, id) : Promise.resolve(null)]);
    const notice = toNoticeDetail(bundle, today, labels, interestDistrictIds(stored));
    const judgement = record && stored ? toJudgementView(record, notice.status, stored.profileVersion) : null;
    return json({ today, profile: stored ? "present" : "none", notice, judgement } satisfies NoticeDetailResponse, 200, requestId);
  };
}

/** "a,b,c" → 중복 없는 ID 목록. 형식이 틀리거나 1~100개가 아니면 null (BR-U5-132) */
export function parseIds(raw: string | null): string[] | null {
  if (raw === null) return null;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => s !== ""))];
  if (ids.length === 0 || ids.length > MAX_SUMMARY_IDS || !ids.every(isNoticeId)) return null;
  return ids;
}

/** GET /api/notices?ids= — 관심 공고 갱신용 요약 (판정 없음) */
export function createNoticeSummariesHandler(deps: Pick<FeedDeps, "feed" | "labels" | "now">) {
  return async ({ req, requestId }: DeviceContext): Promise<Response> => {
    const ids = parseIds(new URL(req.url).searchParams.get("ids"));
    if (!ids) return errorResponse("BAD_REQUEST", 400, requestId);
    const today = toKstDate(deps.now());
    const [bundles, labels] = await Promise.all([deps.feed().listNoticeBundles(ids), deps.labels()]);
    const byId = new Map(bundles.map((b) => [b.notice.id, b]));
    const items = ids.flatMap((id) => {
      const b = byId.get(id);
      return b ? [toNoticeSummary(b, today, labels)] : [];
    });
    const missing = ids.filter((id) => !byId.has(id));
    return json({ today, items, missing } satisfies NoticeSummariesResponse, 200, requestId);
  };
}

/**
 * GET /api/notices/[id]/calendar (BR-U5-111·133) — 공고 정보만 담으므로 기기 인증 없이 연다.
 * 홈 화면 앱(iPhone)에서 파일 열기가 안정적이도록 서버 주소로 내려준다.
 */
export function createCalendarHandler(deps: Pick<FeedDeps, "feed" | "now">, sink?: LogSink) {
  return async (req: Request): Promise<Response> => {
    const requestId = newRequestId();
    const log = createLogger({ requestId, route: "GET /api/notices/[id]/calendar" }, sink);
    try {
      const id = noticeIdFromUrl(req.url);
      const bundle = isNoticeId(id) ? await deps.feed().getNoticeBundle(id) : null;
      // 마감된 공고도 파일은 준다(버튼은 화면에서 숨김). 일정이 없으면 404
      const availability = bundle
        ? calendarEvent({
            id: bundle.notice.id,
            title: bundle.notice.title,
            complexName: bundle.notice.complexName,
            applyStart: bundle.notice.applyStart,
            applyEnd: bundle.notice.applyEnd,
            status: "open",
            url: pickSources(bundle.sources, bundle.notice.primarySource)[0]?.url ?? null,
          })
        : null;
      if (availability?.kind !== "ready") {
        log.info("request", { status: 404 });
        return errorResponse("NOT_FOUND", 404, requestId);
      }
      log.info("request", { status: 200 });
      return new Response(buildIcs(availability.event, deps.now()), {
        status: 200,
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="${icsFileName(id)}"`,
          "cache-control": "no-store",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    } catch (error) {
      log.error("unhandled", { error: error instanceof Error ? error.message : String(error) });
      return errorResponse("SERVER", 500, requestId);
    }
  };
}
