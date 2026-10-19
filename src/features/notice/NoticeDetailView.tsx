"use client";

// 공고 상세 (US-13~17, business-logic-model §3~5, BR-U5-70~111, 변경 2 BR-U5-C4~C8)
// 알림 → 상세 → [원문 보기] 2탭: 원문 버튼을 맨 위에 둔다 (NFR-1.4)
import type { HouseholdProfile, RegionPick } from "@shared/domain/profile.ts";
import { orderRegions, placeNames, placeNeedsCheck, regionName, summaryView } from "@shared/feed/place.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLastList } from "@/features/app-chrome/BackNavigation";
import { ErrorMessage } from "@/features/app-chrome/ErrorMessage";
import { BookmarkButton } from "@/features/bookmarks/BookmarkButton";
import { useBookmarks } from "@/features/bookmarks/BookmarksProvider";
import type { BookmarkSnapshot } from "@/features/bookmarks/model/store";
import { getApiClient } from "@/features/device/api-client";
import { markSeen } from "@/features/feed/model/seen";
import { useProfile } from "@/features/profile/ProfileProvider";
import { card, linkButton, primaryButton, secondaryButton } from "@/features/profile/ui/controls";
import type { JudgementView, NoticeDetail, NoticeDetailResponse } from "./model/api-types";
import { calendarEvent, calendarTarget, googleCalendarUrl, NO_DATES_TEXT } from "./model/calendar";
import { areaLabel, CRITERION_NAMES, dateLabel, shortAreaLabel, supplyCountLabel, timeline, unitRows } from "./model/display";
import { DISCLAIMER, groupJudgement, type JudgementGroup, settingsLinkFor, splitGroups, VERDICT_MARK, VERDICT_SUMMARY, withUserValue } from "./model/judgement";
import { VerdictBadge } from "./ui/badges";

export const DETAIL_TEXT = {
  loading: "공고를 불러오고 있어요…",
  notFound: "공고를 찾을 수 없어요. 오래된 공고는 1년이 지나면 지워져요",
  closed: "접수가 끝난 공고예요",
  ineligible: "지금 조건으로는 신청이 어려운 공고예요",
  outOfDistrict: "관심 지역 밖의 공고예요",
  editArea: "관심 지역 고치기",
  placeCheck: "정확한 위치는 공고문에서 확인해 주세요",
  aiOutOfArea: "관심 지역 밖의 공고라 요약을 만들지 않았어요. 정확한 내용은 원문을 확인해 주세요",
  aiOutOfAreaHint: "관심 지역에 넣으면 다음 날부터 요약해 드려요",
  noProfile: "내 정보를 넣으면 이 공고에 신청할 수 있는지 알려 드려요",
  noJudgement: "아직 판정 결과가 없어요. 잠시 뒤 다시 확인해 주세요",
  outdated: "최근 바꾼 내 정보가 아직 반영되지 않았어요",
  noSource: "원문 주소가 없어요",
  aiNotice: "AI가 공고문을 요약했어요. 정확한 내용은 원문을 확인해 주세요",
  aiPending: "요약을 준비 중이에요",
} as const;

type State = { phase: "loading" } | { phase: "ready"; data: NoticeDetailResponse } | { phase: "not_found" } | { phase: "error"; message: string };

const EDIT_AREA_HREF = "/profile/edit/districts";

export function NoticeDetailView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const r = await getApiClient().request<NoticeDetailResponse>(`/api/notices/${encodeURIComponent(id)}`);
    if (r.ok) {
      setState({ phase: "ready", data: r.data });
      markSeen(window.localStorage, id, new Date()); // NEW 끄기 (BR-U5-41)
    } else if (r.status === 404) setState({ phase: "not_found" });
    else setState({ phase: "error", message: r.error.message });
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버에서 받아 오는 효과
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <BackButton />
      {state.phase === "loading" && (
        <p role="status" className="py-8 text-center text-body text-muted">
          {DETAIL_TEXT.loading}
        </p>
      )}
      {state.phase === "error" && <ErrorMessage message={state.message} action={{ label: "다시 시도", onClick: () => void load() }} />}
      {state.phase === "not_found" && <NotFound id={id} />}
      {state.phase === "ready" && <Detail data={state.data} />}
    </div>
  );
}

function BackButton() {
  const router = useRouter();
  const lastList = useLastList();
  // 들어온 목록으로 (휴대폰 뒤로 버튼과 같은 규칙, back-target.ts). 알림으로 바로 열었으면 맞춤 공고
  const back = () => router.replace(lastList());
  return (
    <button type="button" onClick={back} className="-ml-2 flex min-h-touch items-center gap-1 self-start rounded-2xl px-2 text-body font-bold text-muted active:bg-fill">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      뒤로
    </button>
  );
}

function NotFound({ id }: { id: string }) {
  const { has, remove } = useBookmarks();
  return (
    <section className={`${card} flex flex-col gap-4 p-6`}>
      <h1 className="text-title font-bold">{DETAIL_TEXT.notFound}</h1>
      <Link replace href="/" className={`${primaryButton} flex items-center justify-center`}>
        맞춤 공고로
      </Link>
      {has(id) && (
        <button type="button" className={secondaryButton} onClick={() => remove(id)}>
          관심 공고에서 지우기
        </button>
      )}
    </section>
  );
}

function snapshotOf(n: NoticeDetail, interest: readonly RegionPick[]): BookmarkSnapshot {
  const plains: string[] = [];
  for (const u of n.units) if (!plains.includes(u.plain)) plains.push(u.plain);
  return {
    title: n.title,
    complexName: n.complexName,
    districts: placeNames(n.districts.map((d) => d.name), orderRegions(n.regions ?? [], interest)), // 위치 이름 (BR-U5-C1)
    applyStart: n.schedule.applyStart,
    applyEnd: n.schedule.applyEnd,
    supplyTypes: plains,
  };
}

function Detail({ data }: { data: NoticeDetailResponse }) {
  const { notice, judgement, today, profile } = data;
  const { stored } = useProfile();
  const interest = stored?.profile.prefs.regions ?? [];
  const regions = orderRegions(notice.regions ?? [], interest); // 내 관심 지역 먼저 (BR-U5-C5)
  const districtNames = notice.districts.map((d) => d.name);
  const supplyTypes = [...new Map(notice.units.map((u) => [u.supplyType, u])).values()];
  return (
    <article className="flex flex-col gap-4" aria-labelledby="notice-title">
      <StatusNotice notice={notice} judgement={judgement} />

      <section className={`${card} flex flex-col gap-4 p-5`}>
        <header className="flex flex-col gap-2">
          <p className="text-caption font-bold text-muted">
            {[notice.provider, notice.tenure === "sale" ? "분양" : "임대", ...districtNames].join(" · ")}
          </p>
          <h1 id="notice-title" className="text-heading font-bold leading-snug tracking-tight">
            {notice.title}
          </h1>
          {notice.complexName && <p className="text-body text-muted">{notice.complexName}</p>}
          {districtNames.length === 0 && regions.length > 0 && (
            <p className="text-body">
              <span className="font-bold">위치 </span>
              {regions.map(regionName).join(", ")}
              {placeNeedsCheck(districtNames, regions) && <span className="block text-caption text-muted">{DETAIL_TEXT.placeCheck}</span>}
            </p>
          )}
          {supplyTypes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {supplyTypes.map((u) => (
                <li key={u.supplyType} className="rounded-lg bg-fill px-2 py-0.5 text-caption text-ink">
                  {u.plain}
                  {u.formal !== u.plain && <span className="text-muted"> ({u.formal})</span>}
                </li>
              ))}
            </ul>
          )}
        </header>
        <OriginalLink notice={notice} />
        <div className="grid grid-cols-2 gap-2">
          <BookmarkButton id={notice.id} snapshot={snapshotOf(notice, interest)} size="large" />
          <CalendarButton notice={notice} />
        </div>
      </section>

      <VerdictSummary profile={profile} judgement={judgement} />
      <ScheduleTimeline notice={notice} today={today} />
      <UnitList notice={notice} />
      {judgement && <JudgementReasons judgement={judgement} notice={notice} profile={stored?.profile ?? null} />}
      <AiSummary notice={notice} judgement={judgement} />
    </article>
  );
}

// ---------- 원문 (BR-U5-100~103) ----------

function OriginalLink({ notice }: { notice: NoticeDetail }) {
  const [main, ...others] = notice.sources;
  if (!main) {
    return (
      <button type="button" disabled className={primaryButton}>
        {DETAIL_TEXT.noSource}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <a href={main.url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} flex items-center justify-center`}>
        원문 보기<span className="sr-only"> ({main.label}, 새 창)</span>
      </a>
      {others.map((s) => (
        <a key={s.source} href={s.url} target="_blank" rel="noopener noreferrer" className={`${linkButton} self-start`}>
          {s.label}에서 보기
        </a>
      ))}
    </div>
  );
}

function StatusNotice({ notice, judgement }: { notice: NoticeDetail; judgement: JudgementView | null }) {
  const lines: string[] = [];
  if (notice.status === "closed") lines.push(DETAIL_TEXT.closed);
  if (judgement?.verdict === "ineligible") lines.push(DETAIL_TEXT.ineligible);
  const outOfArea = judgement !== null && !judgement.inDistrict;
  if (outOfArea) lines.push(DETAIL_TEXT.outOfDistrict);
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-card bg-ink px-5 py-4 text-body font-bold text-surface">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {outOfArea && (
        <Link replace href={EDIT_AREA_HREF} className="min-h-touch content-center font-normal underline">
          {DETAIL_TEXT.editArea}
        </Link>
      )}
    </div>
  );
}

// ---------- 판정 요약 (BR-U5-74·85·91) ----------

function VerdictSummary({ profile, judgement }: { profile: NoticeDetailResponse["profile"]; judgement: JudgementView | null }) {
  if (profile === "none") {
    return (
      <section className="flex flex-col gap-3 rounded-card bg-primary-soft p-5">
        <p className="text-body">{DETAIL_TEXT.noProfile}</p>
        <Link replace href="/profile/setup" className={`${primaryButton} flex items-center justify-center`}>
          내 정보 넣기
        </Link>
      </section>
    );
  }
  if (!judgement) return <p className={`${card} p-5 text-body`}>{DETAIL_TEXT.noJudgement}</p>;
  const tone = judgement.verdict === "eligible" ? "bg-primary-soft" : judgement.verdict === "ineligible" ? "bg-danger-soft" : "bg-surface shadow-card";
  return (
    <section className={`flex flex-col items-start gap-2 rounded-card p-5 ${tone}`} aria-label="내 자격 판정">
      <VerdictBadge verdict={judgement.verdict} />
      <p className="text-title font-bold">{VERDICT_SUMMARY[judgement.verdict]}</p>
      {judgement.outdated && <p className="text-body text-muted">{DETAIL_TEXT.outdated}</p>}
    </section>
  );
}

// ---------- 일정 (BR-U5-75~77) ----------

function ScheduleTimeline({ notice, today }: { notice: NoticeDetail; today: string }) {
  const t = timeline(notice.schedule, today);
  const marker = (
    <li key="today-marker" className="relative flex items-center pb-4 text-caption font-bold text-primary">
      <span aria-hidden className="absolute -left-7 h-0.5 w-5 rounded bg-primary" />
      오늘 ({dateLabel(today, today)})
    </li>
  );
  const items = t.steps.map((s) => {
    const when = s.date ? `${dateLabel(s.date, today)}${s.endDate && s.endDate !== s.date ? ` ~ ${dateLabel(s.endDate, today)}` : ""}` : "미정";
    const tag = s.state === "past" ? "지남" : s.state === "today" ? "오늘" : null;
    return (
      <li key={s.key} className={`relative flex flex-col pb-4 last:pb-0 ${s.state === "past" ? "text-muted" : ""}`}>
        <span
          aria-hidden
          className={`absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full border-2 ${s.state === "today" ? "border-primary bg-primary" : s.state === "past" ? "border-field bg-surface" : "border-ink bg-surface"}`}
        />
        <span className="text-body font-bold">
          {s.label}
          {tag && <span className={s.state === "today" ? "text-primary" : ""}> · {tag}</span>}
        </span>
        <span className="text-body">{when}</span>
      </li>
    );
  });
  if (t.todayIndex !== null) items.splice(t.todayIndex, 0, marker);
  return (
    <section className={`${card} flex flex-col gap-4 p-5`} aria-labelledby="schedule-title">
      <h2 id="schedule-title" className="text-title font-bold">
        일정
      </h2>
      <ol className="ml-2 flex flex-col border-l-2 border-line pl-6">{items}</ol>
    </section>
  );
}

// ---------- 세대수 (BR-U5-78~81) ----------

function UnitList({ notice }: { notice: NoticeDetail }) {
  if (notice.units.length === 0) return null;
  const { rows, total } = unitRows(notice.units);
  return (
    <section className={`${card} flex flex-col gap-2 p-5`} aria-labelledby="units-title">
      <h2 id="units-title" className="text-title font-bold">
        공급 세대수 <span className="text-body font-normal text-muted">(합계 {total})</span>
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((u) => (
          <li key={u.id} className="flex items-start justify-between gap-3 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-bold">
                {u.label ?? shortAreaLabel(u.exclusiveAreaM2)} · {u.plain}
              </span>
              <span className="text-caption text-muted">{areaLabel(u.exclusiveAreaM2)}</span>
            </span>
            <span className="shrink-0 text-body font-bold">{supplyCountLabel(u.supplyCount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 판정 이유 (BR-U5-86~92) ----------

function JudgementReasons({ judgement, notice, profile }: { judgement: JudgementView; notice: NoticeDetail; profile: HouseholdProfile | null }) {
  const { open, folded } = splitGroups(groupJudgement(judgement.units, notice.units));
  return (
    <section className={`${card} flex flex-col gap-3 p-5`} aria-labelledby="reasons-title">
      <h2 id="reasons-title" className="text-title font-bold">
        판정 이유
      </h2>
      {open.map((g) => (
        <GroupBlock key={g.unitIds.join(",")} group={g} profile={profile} />
      ))}
      {folded.length > 0 && (
        <details className="rounded-2xl bg-canvas px-4 py-2">
          <summary className="min-h-touch cursor-pointer content-center text-body font-bold">신청이 어려운 유형 {folded.length}개</summary>
          <div className="mt-3 flex flex-col gap-3">
            {folded.map((g) => (
              <GroupBlock key={g.unitIds.join(",")} group={g} profile={profile} />
            ))}
          </div>
        </details>
      )}
      <p className="text-caption text-muted">{DISCLAIMER}</p>
    </section>
  );
}

function GroupBlock({ group, profile }: { group: JudgementGroup; profile: HouseholdProfile | null }) {
  const areas = group.areas.map(shortAreaLabel).join(", ");
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-canvas p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-bold">
          {group.plain}
          {group.formal !== group.plain && <span className="font-normal text-muted"> ({group.formal})</span>}
        </h3>
        <VerdictBadge verdict={group.verdict} />
      </div>
      <p className="text-caption text-muted">전용 {areas}</p>
      {group.criteria.length > 0 && (
        <ul className="flex flex-col gap-2">
          {group.criteria.map((c) => {
            const mark = VERDICT_MARK[c.verdict];
            const mine = withUserValue(c, profile);
            const link = c.verdict === "unknown" ? settingsLinkFor(c) : null;
            return (
              <li key={`${c.key}-${c.code}`} className="flex flex-col">
                <span className="text-body">
                  <span aria-hidden className={c.verdict === "ineligible" ? "text-danger" : c.verdict === "eligible" ? "text-primary" : ""}>
                    {mark.symbol}{" "}
                  </span>
                  <span className="sr-only">{mark.text}: </span>
                  <span className="font-bold">{CRITERION_NAMES[c.key]}</span>: {c.reason}
                  {mine && <span> → {mine}</span>}
                </span>
                {c.verdict === "unknown" && c.action && (
                  <span className="text-caption text-muted">
                    {link ? (
                      <Link replace href={link} className="text-primary underline">
                        {c.action}
                      </Link>
                    ) : (
                      c.action
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- AI 요약 (BR-U5-95~98) ----------

function paragraphs(text: string): string[] {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

function AiSummary({ notice, judgement }: { notice: NoticeDetail; judgement: JudgementView | null }) {
  const s = notice.summary;
  const view = summaryView(s, judgement); // 요약 / 관심 지역 밖 / 준비 중 (BR-U5-C7)
  return (
    <section className={`${card} flex flex-col gap-3 p-5`} aria-labelledby="ai-title">
      <h2 id="ai-title" className="text-title font-bold">
        쉽게 보는 자격 조건
      </h2>
      {s ? (
        <>
          {paragraphs(s.eligibilityPlain).map((p, i) => (
            <p key={i} className="text-body">
              {p}
            </p>
          ))}
          <h3 className="pt-2 text-body font-bold">노부부 가구가 볼 점</h3>
          {paragraphs(s.forSeniorCouple).map((p, i) => (
            <p key={i} className="text-body">
              {p}
            </p>
          ))}
          <p className="text-caption text-muted">{DETAIL_TEXT.aiNotice}</p>
        </>
      ) : (
        <>
          <p className="text-body">{view === "outOfArea" ? DETAIL_TEXT.aiOutOfArea : DETAIL_TEXT.aiPending}</p>
          {notice.sources[0] && (
            <a href={notice.sources[0].url} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} flex items-center justify-center`}>
              원문 보기
            </a>
          )}
          {view === "outOfArea" && (
            <p className="text-body text-muted">
              {DETAIL_TEXT.aiOutOfAreaHint}{" "}
              <Link replace href={EDIT_AREA_HREF} className={linkButton}>
                {DETAIL_TEXT.editArea}
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---------- 캘린더 (BR-U5-105~111) ----------

function CalendarButton({ notice }: { notice: NoticeDetail }) {
  const availability = calendarEvent({
    id: notice.id,
    title: notice.title,
    complexName: notice.complexName,
    applyStart: notice.schedule.applyStart,
    applyEnd: notice.schedule.applyEnd,
    status: notice.status,
    url: notice.sources[0]?.url ?? null,
  });
  if (availability.kind === "closed") return null;
  if (availability.kind === "no_dates") {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled aria-describedby="calendar-help" className={secondaryButton}>
          캘린더에 추가
        </button>
        <p id="calendar-help" className="text-caption text-muted">
          {NO_DATES_TEXT}
        </p>
      </div>
    );
  }
  const add = () => {
    if (calendarTarget(navigator.userAgent, navigator.maxTouchPoints) === "ics") {
      // 화면이 아니라 캘린더 파일 주소다 — 브라우저가 파일을 받아 캘린더 추가 화면을 연다
      window.location.assign(new URL(`/api/notices/${encodeURIComponent(notice.id)}/calendar`, window.location.origin).href);
    } else {
      window.open(googleCalendarUrl(availability.event), "_blank", "noopener,noreferrer");
    }
  };
  return (
    <button type="button" onClick={add} className={secondaryButton}>
      캘린더에 추가
    </button>
  );
}
