// 소스 조회·PDF 내려받기 (L-U3-5, P-U3-R2·P4·S2). 판단 로직은 _shared/http/fetch.ts
import { fetchWithRetry, HttpError, looksLikePdf, PDF_MAX_BYTES, readCapped, TooLargeError } from "../_shared/http/fetch.ts";
import { type PdfFetcher, StepError } from "../_shared/collect/ports.ts";

export const USER_AGENT = "MojjineAlimi/0.1 (+https://github.com/BaekJaeIn/mozzi-cheongyak-rador)";
const PDF_TIMEOUT_MS = 30_000;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "user-agent": USER_AGENT, ...extra };
}

export async function getText(url: string, timeoutMs: number, extra?: Record<string, string>): Promise<string> {
  const res = await fetchWithRetry(url, { timeoutMs, init: { headers: headers(extra) } });
  return await res.text();
}

export async function getJson(url: string, timeoutMs: number): Promise<{ text: string; json: unknown }> {
  const text = await getText(url, timeoutMs, { accept: "application/json" });
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

export function createPdfFetcher(maxBytes = PDF_MAX_BYTES): PdfFetcher {
  return {
    async fetchPdf(url) {
      try {
        const res = await fetchWithRetry(url, { timeoutMs: PDF_TIMEOUT_MS, init: { headers: headers({ accept: "application/pdf" }) } });
        const bytes = await readCapped(res, maxBytes);
        if (!looksLikePdf(bytes)) throw new StepError("pdf_fetch", "PDF 형식이 아님");
        return bytes;
      } catch (e) {
        if (e instanceof StepError) throw e;
        if (e instanceof TooLargeError) throw new StepError("too_large", e.message);
        if (e instanceof HttpError) throw new StepError("pdf_fetch", e.message);
        throw new StepError("pdf_fetch", e instanceof Error ? e.name : "unknown");
      }
    },
  };
}
