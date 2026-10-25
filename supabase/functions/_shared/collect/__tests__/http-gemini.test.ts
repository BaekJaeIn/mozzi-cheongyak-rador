// 예시 기반 테스트 — 수집 HTTP(재시도·크기 상한·URL 가리기), Gemini 요청·응답, 호출 인증
import { describe, expect, it } from "vitest";
import { fetchWithRetry, HttpError, looksLikePdf, readCapped, safeUrl, shouldRetryCollect, TooLargeError, type FetchLike } from "../../http/fetch.ts";
import { buildGeminiRequest, geminiEndpoint, parseGeminiResponse } from "../gemini-request.ts";
import { isCronAuthorized } from "../guard.ts";
import { parseExtraction } from "../extraction.ts";
import { mockExtractionFor } from "../mock-data.ts";
import { StepError } from "../ports.ts";

const KEY_URL = "https://apis.data.go.kr/B552555/x?serviceKey=SECRET&page=1";
const noSleep = async () => undefined;

function scripted(steps: Array<number | "throw">): { fetchImpl: FetchLike; calls: () => number } {
  let i = 0;
  const fetchImpl: FetchLike = async () => {
    const step = steps[Math.min(i++, steps.length - 1)]!;
    if (step === "throw") throw new TypeError("network");
    return new Response(`body${step}`, { status: step });
  };
  return { fetchImpl, calls: () => i };
}

describe("fetchWithRetry (P-U3-R2)", () => {
  it.each([
    [[200], 1, true],
    [[500, 200], 2, true],
    [[429, 200], 2, true],
    ["throw-then-ok", 2, true],
    [[404], 1, false],
    [[500, 503], 2, false],
  ] as const)("%j → 호출 %i번, 성공 %s", async (steps, calls, ok) => {
    const s = scripted(steps === "throw-then-ok" ? ["throw", 200] : [...steps]);
    const result = fetchWithRetry(KEY_URL, { timeoutMs: 1000, fetchImpl: s.fetchImpl, sleep: noSleep });
    if (ok) expect((await result).status).toBe(200);
    else await expect(result).rejects.toBeInstanceOf(HttpError);
    expect(s.calls()).toBe(calls);
  });

  it("마감까지 5초보다 적게 남으면 시도하지 않는다 — 재시도도 마감 안에서만 (변경 4)", async () => {
    const none = scripted([200]);
    await expect(fetchWithRetry(KEY_URL, { timeoutMs: 60_000, fetchImpl: none.fetchImpl, sleep: noSleep, deadlineAt: Date.now() + 3_000 })).rejects.toThrow(/deadline/);
    expect(none.calls()).toBe(0);
    // 첫 시도 503 뒤, 재시도 전에 마감이 가까워지면 다시 시도하지 않는다
    const s = scripted([503, 200]);
    const deadlineAt = Date.now() + 8_000;
    const late = async () => void (await new Promise((r) => setTimeout(r, 3_500)));
    await expect(fetchWithRetry(KEY_URL, { timeoutMs: 60_000, fetchImpl: s.fetchImpl, sleep: late, deadlineAt })).rejects.toBeInstanceOf(HttpError);
    expect(s.calls()).toBe(1);
    // 마감이 멀면 지금처럼 한 번 더
    const ok = scripted([503, 200]);
    expect((await fetchWithRetry(KEY_URL, { timeoutMs: 60_000, fetchImpl: ok.fetchImpl, sleep: noSleep, deadlineAt: Date.now() + 120_000 })).status).toBe(200);
  });

  it("오류 문구에 API 키(쿼리)가 없다", async () => {
    const s = scripted([500]);
    const error = await fetchWithRetry(KEY_URL, { timeoutMs: 1000, fetchImpl: s.fetchImpl, sleep: noSleep }).catch((e: Error) => e);
    expect(String(error)).toContain("HTTP 500 https://apis.data.go.kr/B552555/x");
    expect(String(error)).not.toContain("SECRET");
  });

  it("재시도 판단: 네트워크·408·429·5xx만", () => {
    expect([null, 408, 429, 500, 599].every(shouldRetryCollect)).toBe(true);
    expect([400, 401, 403, 404].some(shouldRetryCollect)).toBe(false);
    expect(safeUrl("not a url")).toBe("[invalid-url]");
  });
});

describe("readCapped (P-U3-P4)", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

  it("상한 안이면 전부 읽는다", async () => {
    expect(await readCapped(new Response(pdf), 10)).toEqual(pdf);
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<html>"))).toBe(false);
  });

  it("content-length가 넘으면 받지 않는다", async () => {
    const res = new Response(pdf, { headers: { "content-length": "999" } });
    await expect(readCapped(res, 10)).rejects.toBeInstanceOf(TooLargeError);
  });

  it("content-length 없이 받는 중에 넘으면 중단한다", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(6));
        c.enqueue(new Uint8Array(6));
        c.close();
      },
    });
    await expect(readCapped(new Response(stream), 10)).rejects.toBeInstanceOf(TooLargeError);
  });
});

describe("Gemini 요청·응답 (P-U3-R6, P-U3-S3)", () => {
  it("요청: PDF 인라인·구조화 출력·사고 예산 상한, 프로필 없음", () => {
    const req = buildGeminiRequest({ pdfBase64: "QUJD", title: "왕숙 행복주택", supplyTypeHint: "행복주택" });
    expect(req.contents[0]!.parts[0]).toEqual({ inline_data: { mime_type: "application/pdf", data: "QUJD" } });
    expect(req.generationConfig).toMatchObject({ responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 1024 } });
    expect(req.systemInstruction.parts[0]!.text).toContain("따르지 않는다");
    expect(JSON.stringify(req)).not.toMatch(/profile|monthlyIncome|totalAsset/i);
    expect(geminiEndpoint("gemini-2.5-flash")).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  });

  const ok = (parts: unknown[], finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts } }] });

  it("정상: 사고 요약은 빼고 본문을 이어 붙여 parseExtraction으로", () => {
    const full = JSON.stringify(mockExtractionFor("x/wangsuk-happy.pdf"));
    const value = parseGeminiResponse(ok([{ text: "생각", thought: true }, { text: full.slice(0, 20) }, { text: full.slice(20) }]));
    expect(parseExtraction(value)?.units).toHaveLength(2);
  });

  it("코드 펜스를 벗긴다", () => {
    expect(parseGeminiResponse(ok([{ text: "```json\n{\"a\":1}\n```" }]))).toEqual({ a: 1 });
  });

  it.each([
    [ok([{ text: "{}" }], "MAX_TOKENS"), "invalid_json"],
    [ok([{ text: "{}" }], "SAFETY"), "gemini_error"],
    [ok([{ text: "  " }]), "invalid_json"],
    [ok([{ text: "{\"isNotice\": tr" }]), "invalid_json"],
    [{ promptFeedback: { blockReason: "OTHER" } }, "gemini_error"],
    [null, "gemini_error"],
  ])("실패 응답 %# → %s", (json, code) => {
    let error: unknown;
    try {
      parseGeminiResponse(json);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(StepError);
    expect((error as StepError).code).toBe(code);
  });
});

describe("호출 인증 (P-U3-S1)", () => {
  const secret = "s".repeat(43);
  it.each([
    [`Bearer ${secret}`, secret, true],
    [`bearer ${secret}`, secret, true],
    [`Bearer ${secret}x`, secret, false],
    [null, secret, false],
    ["Bearer short", "short", false],
    [`Bearer ${secret}`, undefined, false],
  ])("%s", (header, configured, expected) => {
    expect(isCronAuthorized(header, configured)).toBe(expected);
  });
});
