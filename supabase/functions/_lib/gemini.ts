// Gemini 공고문 추출 (L-U3-6, P-U3-R6). 키는 헤더로만 보낸다 (URL에 넣지 않음).
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { buildGeminiRequest, DEFAULT_GEMINI_MODEL, geminiEndpoint, parseGeminiResponse } from "../_shared/collect/gemini-request.ts";
import { type Extractor, StepError } from "../_shared/collect/ports.ts";
import { fetchWithRetry, HttpError } from "../_shared/http/fetch.ts";

/** 공고문 한 건 추출 상한. analyze 70초 cutoff 이후에도 150초 안에 끝나게 */
const GEMINI_TIMEOUT_MS = 60_000;

export function createGeminiExtractor(apiKey: string, model = DEFAULT_GEMINI_MODEL): Extractor {
  return {
    async extract({ pdf, title, supplyTypeHint, deadlineAt }) {
      const body = JSON.stringify(buildGeminiRequest({ pdfBase64: encodeBase64(pdf), title, supplyTypeHint }));
      let json: unknown;
      try {
        const res = await fetchWithRetry(geminiEndpoint(model), {
          timeoutMs: GEMINI_TIMEOUT_MS,
          ...(deadlineAt !== undefined ? { deadlineAt } : {}),
          init: { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body },
        });
        json = await res.json();
      } catch (e) {
        throw new StepError("gemini_error", e instanceof HttpError ? e.message : e instanceof Error ? e.name : "unknown");
      }
      return parseGeminiResponse(json);
    },
  };
}
