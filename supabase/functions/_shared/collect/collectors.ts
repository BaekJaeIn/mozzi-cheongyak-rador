// 소스별 Collector (L-U3-1, BR-U3-02~05, P-U3-R1·R2·P1) — HTTP를 주입받아 Vitest로 흐름을 검사한다.
// Deno 진입점은 _lib/http.ts의 getText를 넣어 조립한다. 오류 문구에는 URL 쿼리(API 키)를 남기지 않는다.
import { addDays, type IsoDate } from "../domain/dates.ts";
import { MOCK_PDF_PREFIX, mockExtractionFor, mockRawNotices } from "./mock-data.ts";
import { APPLYHOME_ENDPOINT, APPLYHOME_MAX_PAGES, APPLYHOME_PER_PAGE, parseApplyhomePage } from "./parsers/applyhome.ts";
import { ghCardToRaw, ghNetFunnelActive, GH_MAIN_URL, parseGhAttachments, parseGhCards } from "./parsers/gh.ts";
import {
  isShExcluded,
  isShListPage,
  parseShDetail,
  parseShList,
  SH_BOARDS,
  SH_LIST_PAGES,
  SH_STALE_DAYS,
  shCardToRaw,
  shListUrl,
  shViewUrl,
  type ShCard,
} from "./parsers/sh.ts";
import {
  isLhErrorBody,
  LH_DETAIL_ENDPOINT,
  LH_LIST_ENDPOINT,
  LH_MAX_PAGES,
  LH_PAGE_SIZE,
  lhDetailQuery,
  parseLhDetail,
  parseLhListPage,
} from "./parsers/lh.ts";
import { type Collector, type CollectorContext, errorMessage, type Extractor, type PdfFetcher, StepError } from "./ports.ts";
import type { RawNotice } from "./types.ts";

export interface HttpGet {
  /** 2xx 본문. 실패하면 예외 (재시도·시간 제한은 구현이 처리) */
  getText(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<string>;
}

export interface CollectorDeps {
  http: HttpGet;
  nowMs: () => number;
  /** 요청 사이 쉬기 (SH 1초, NFR-U3-C7). 테스트는 바로 돌아오는 함수를 넣는다 */
  sleep?: (ms: number) => Promise<void>;
}

/** 요청 하나의 시간 제한: 최대 15초, 남은 시간 안 */
export const REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_MS = 1_000;
const DETAIL_CONCURRENCY = 4;

function requestTimeout(ctx: CollectorContext, deps: CollectorDeps): number | null {
  const left = ctx.deadline - deps.nowMs();
  return left < MIN_REQUEST_MS ? null : Math.min(REQUEST_TIMEOUT_MS, left);
}

/** 공공데이터포털 Decoding 키는 인코딩해서, 이미 인코딩된(%) 키는 그대로 */
export function serviceKeyParam(key: string): string {
  return key.includes("%") ? key : encodeURIComponent(key);
}

const ymd = (d: IsoDate) => d.replaceAll("-", "");

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** items를 동시에 limit개씩 처리. 시간이 다 되면 남은 것은 건너뛰고 그 수를 돌려준다 */
async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  canStart: () => boolean,
  fn: (item: T) => Promise<void>,
): Promise<number> {
  let skipped = 0;
  for (let i = 0; i < items.length; i += limit) {
    if (!canStart()) {
      skipped = items.length - i;
      break;
    }
    await Promise.all(items.slice(i, i + limit).map(fn));
  }
  return skipped;
}

// ---------- 청약홈 (odcloud 15098547) ----------
export function applyhomeCollector(apiKey: string, deps: CollectorDeps): Collector {
  return {
    source: "applyhome",
    async collect(ctx) {
      const notices: RawNotice[] = [];
      const warnings: string[] = [];
      for (let page = 1; page <= APPLYHOME_MAX_PAGES; page++) {
        const timeout = requestTimeout(ctx, deps);
        if (timeout === null) {
          warnings.push(`시간 상한으로 ${page}쪽부터 생략`);
          break;
        }
        const url = `${APPLYHOME_ENDPOINT}?serviceKey=${serviceKeyParam(apiKey)}&page=${page}&perPage=${APPLYHOME_PER_PAGE}`;
        let text: string;
        try {
          text = await deps.http.getText(url, timeout, { accept: "application/json" });
        } catch (e) {
          if (page === 1) throw e; // 첫 쪽 실패 = 소스 실패
          warnings.push(`${page}쪽 실패: ${errorMessage(e)}`);
          break;
        }
        const json = parseJson(text);
        if (json === null) {
          if (page === 1) throw new Error("청약홈 응답이 JSON이 아님");
          warnings.push(`${page}쪽 JSON 아님`);
          break;
        }
        const parsed = parseApplyhomePage(json);
        notices.push(...parsed.notices);
        if (parsed.rowCount < APPLYHOME_PER_PAGE) break;
      }
      return { notices, warnings };
    },
  };
}

// ---------- LH 목록 (15058530) + 상세 (15057999) ----------
export function lhCollector(apiKey: string, deps: CollectorDeps): Collector {
  return {
    source: "lh_rental",
    async collect(ctx) {
      const warnings: string[] = [];
      const candidates: ReturnType<typeof parseLhListPage>["candidates"] = [];
      const range = `PAN_NT_ST_DT=${ymd(addDays(ctx.today, -180))}&CLSG_DT=${ymd(addDays(ctx.today, 365))}`;

      for (let page = 1; page <= LH_MAX_PAGES; page++) {
        const timeout = requestTimeout(ctx, deps);
        if (timeout === null) {
          warnings.push(`시간 상한으로 목록 ${page}쪽부터 생략`);
          break;
        }
        const url = `${LH_LIST_ENDPOINT}?serviceKey=${serviceKeyParam(apiKey)}&PG_SZ=${LH_PAGE_SIZE}&PAGE=${page}&${range}`;
        let text: string;
        try {
          text = await deps.http.getText(url, timeout, { accept: "application/json" });
        } catch (e) {
          if (page === 1) throw e;
          warnings.push(`목록 ${page}쪽 실패: ${errorMessage(e)}`);
          break;
        }
        const json = isLhErrorBody(text) ? null : parseJson(text);
        if (json === null) {
          if (page === 1) throw new Error("LH 목록 응답이 오류 봉투이거나 JSON이 아님");
          warnings.push(`목록 ${page}쪽 오류 응답`);
          break;
        }
        const parsed = parseLhListPage(json);
        candidates.push(...parsed.candidates);
        if (parsed.rowCount < LH_PAGE_SIZE) break;
      }

      // 상세: 접수 시작·발표일·첨부(공고문 PDF). 실패해도 목록 정보로 계속 (BR-U3-04)
      let detailFailed = 0;
      const skipped = await forEachLimited(candidates, DETAIL_CONCURRENCY, () => requestTimeout(ctx, deps) !== null, async (c) => {
        const timeout = requestTimeout(ctx, deps);
        if (timeout === null) {
          detailFailed += 1;
          return;
        }
        try {
          const text = await deps.http.getText(
            `${LH_DETAIL_ENDPOINT}?serviceKey=${serviceKeyParam(apiKey)}&${lhDetailQuery(c.detailParams)}`,
            timeout,
            { accept: "application/json" },
          );
          const json = isLhErrorBody(text) ? null : parseJson(text);
          if (json === null) throw new Error("상세 오류 응답");
          const detail = parseLhDetail(json);
          c.notice.dates.applyStart = detail.applyStart ?? c.notice.dates.applyStart;
          c.notice.dates.resultAt = detail.resultAt ?? c.notice.dates.resultAt;
          c.notice.attachments = detail.attachments;
        } catch {
          detailFailed += 1;
        }
      });
      if (detailFailed > 0) warnings.push(`상세 실패 ${detailFailed}건`);
      if (skipped > 0) warnings.push(`시간 상한으로 상세 ${skipped}건 생략`);
      return { notices: candidates.map((c) => c.notice), warnings };
    },
  };
}

// ---------- GH 청약센터 (HTML) ----------
export function ghCollector(deps: CollectorDeps): Collector {
  return {
    source: "gh",
    async collect(ctx) {
      const timeout = requestTimeout(ctx, deps);
      if (timeout === null) return { notices: [], warnings: ["시간 상한으로 생략"] };
      const html = await deps.http.getText(GH_MAIN_URL, timeout);
      if (ghNetFunnelActive(html)) return { notices: [], warnings: ["대기열(NetFunnel) 활성 — 이번 실행 건너뜀"] };

      const notices = parseGhCards(html).map(ghCardToRaw);
      let detailFailed = 0;
      const skipped = await forEachLimited(notices, 2, () => requestTimeout(ctx, deps) !== null, async (n) => {
        const t = requestTimeout(ctx, deps);
        if (t === null) {
          detailFailed += 1;
          return;
        }
        try {
          const detail = await deps.http.getText(n.originalUrl, t);
          if (!ghNetFunnelActive(detail)) n.attachments = parseGhAttachments(detail, n.originalUrl);
          else detailFailed += 1;
        } catch {
          detailFailed += 1;
        }
      });
      const warnings: string[] = [];
      if (detailFailed > 0) warnings.push(`상세(첨부) 실패 ${detailFailed}건`);
      if (skipped > 0) warnings.push(`시간 상한으로 상세 ${skipped}건 생략`);
      return { notices, warnings };
    },
  };
}

// ---------- SH 서울주택도시개발공사 (HTML, 변경 2 BR-U3-C10~C16, NFR-U3-C5~C8) ----------
export const SH_DETAIL_MAX = 15;
export const SH_GAP_MS = 1_000;

export function shCollector(deps: CollectorDeps): Collector {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return {
    source: "sh",
    async collect(ctx) {
      const warnings: string[] = [];
      const notices: RawNotice[] = [];
      const known = ctx.knownTitles ?? new Map<string, string>();
      const staleBefore = addDays(ctx.today, -SH_STALE_DAYS);
      const budget = ctx.deadline - deps.nowMs();
      let requests = 0;
      let excluded = 0;
      let unchanged = 0;
      let cardsTotal = 0;
      let listOk = false;
      const wait = async () => {
        if (requests++ > 0) await sleep(SH_GAP_MS);
      };
      // 남은 시간이 예산의 10% 미만이면 더 요청하지 않는다 (P-U3-C5)
      const lowOnTime = () => ctx.deadline - deps.nowMs() < budget * 0.1 || requestTimeout(ctx, deps) === null;

      // 1) 두 게시판 목록을 먼저 모두 읽는다 — 한 게시판 상세가 시간을 다 써서 다른 게시판을 놓치지 않게
      const candidates: { board: (typeof SH_BOARDS)[number]; card: ShCard }[] = [];
      const seen = new Set<string>();
      for (const board of SH_BOARDS) {
        for (let page = 1; page <= SH_LIST_PAGES; page++) {
          if (lowOnTime()) {
            warnings.push(`시간 상한으로 ${board.label} ${page}쪽부터 생략`);
            break;
          }
          await wait();
          const html = await deps.http.getText(shListUrl(board, page), requestTimeout(ctx, deps)!);
          if (!isShListPage(html)) {
            warnings.push(`${board.label} 목록이 정상 화면이 아님(대기열·차단 의심) — 건너뜀`);
            break;
          }
          listOk = true;
          const cards = parseShList(html);
          cardsTotal += cards.length;
          for (const card of cards) {
            if (seen.has(card.seq)) continue;
            seen.add(card.seq);
            if (isShExcluded(card.title)) {
              excluded += 1;
              continue;
            }
            if (card.registeredAt && card.registeredAt < staleBefore) continue; // 오래된 글 (SH_STALE_DAYS)
            if (known.get(card.seq) === card.title) {
              unchanged += 1; // 저장된 글 그대로 — 상세를 다시 읽지 않고 내보내지도 않는다 (NFR-U3-C6)
              continue;
            }
            candidates.push({ board, card });
          }
          // 이 쪽에서 오래된 글이 나오면 다음 쪽은 더 오래됐다
          if (cards.length === 0 || cards.some((c) => c.registeredAt !== null && c.registeredAt < staleBefore)) break;
        }
      }

      // 2) 상세는 최근 등록 순으로, 최대 15건·시간 안에서
      candidates.sort((a, b) => (b.card.registeredAt ?? "").localeCompare(a.card.registeredAt ?? ""));
      let deferred = 0;
      let details = 0;
      for (const { board, card } of candidates) {
        if (details >= SH_DETAIL_MAX || lowOnTime()) {
          deferred += 1;
          continue;
        }
        details += 1;
        await wait();
        try {
          const detail = parseShDetail(await deps.http.getText(shViewUrl(board, card.seq), requestTimeout(ctx, deps)!));
          notices.push(shCardToRaw(board, card, detail));
        } catch {
          warnings.push(`상세 실패: ${card.title.slice(0, 40)}`);
        }
      }
      if (listOk && cardsTotal === 0) warnings.push("SH 0건 — 화면 구조 변경 의심 (BR-U3-C16)");
      if (deferred > 0) warnings.push(`상세 ${deferred}건은 다음 실행에`);
      // 기록 숫자 (NFR-U3-C12) — 경고가 아니라 정보
      warnings.push(`SH 요청 ${requests}회, 모집공고 아닌 글 ${excluded}건 제외, 저장된 글 ${unchanged}건 건너뜀`);
      return { notices, warnings };
    },
  };
}

// ---------- 목업 (로컬 COLLECT_MOCK=1, BR-U3-07) ----------
export function mockCollectorSet(): Collector[] {
  return (["applyhome", "lh_rental", "gh", "sh"] as const).map((source) => ({
    source,
    collect: async (ctx: CollectorContext) => ({ notices: mockRawNotices(ctx.today)[source], warnings: [] }),
  }));
}

export const mockPdfFetcher: PdfFetcher = {
  async fetchPdf(url) {
    if (!url.startsWith(MOCK_PDF_PREFIX)) throw new StepError("pdf_fetch", "목업 모드는 목업 PDF만");
    return new TextEncoder().encode(`%PDF-mock ${url}`);
  },
};

export const mockExtractor: Extractor = {
  async extract({ pdf }) {
    return mockExtractionFor(new TextDecoder().decode(pdf).replace("%PDF-mock ", ""));
  },
};
