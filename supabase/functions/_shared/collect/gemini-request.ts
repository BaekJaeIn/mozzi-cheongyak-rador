// Gemini generateContent 요청 만들기·응답 해석 (P-U3-R6, P-U3-S3) — 호출 자체는 _lib/gemini.ts
// 프로필·가족 정보는 넣지 않는다 (FR-4.5): 입력은 공고문 PDF·제목·유형 추정뿐이다.
import { StepError } from "./ports.ts";
import { buildUserPrompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt.ts";

/**
 * 새 AI Studio 프로젝트 키는 gemini-2.5-flash를 쓸 수 없다. 큰 공고문(1.7MB, 5.8만 토큰)으로 재 보니 3.8-flash는 503·2분 넘음,
 * 3.5-flash는 31초에 정상 (2026-10-25, 변경 4 BR-U3-E33). 함수 환경 변수 GEMINI_MODEL로 바꿀 수 있다
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const GEMINI_MAX_OUTPUT_TOKENS = 16_384; // 변경 4: 계층이 많은 공고는 8,192에서 JSON이 잘렸다
export const GEMINI_THINKING_BUDGET = 1024;

export function geminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export interface GeminiRequest {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: "user"; parts: ({ inline_data: { mime_type: string; data: string } } | { text: string })[] }[];
  generationConfig: Record<string, unknown>;
}

export function buildGeminiRequest(input: { pdfBase64: string; title: string; supplyTypeHint: string }): GeminiRequest {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "application/pdf", data: input.pdfBase64 } },
          { text: buildUserPrompt({ title: input.title, supplyTypeHint: input.supplyTypeHint }) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      // 사고 토큰이 출력 예산을 다 쓰면 본문이 잘린다 → 상한을 둔다
      thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };
}

/**
 * 응답 본문 → 모델이 낸 JSON 값(검증 전). 정상 종료(STOP)가 아니거나, 본문이 비거나, JSON이 아니면 실패.
 * 값의 형식 검증은 parseExtraction이 한다.
 */
export function parseGeminiResponse(json: unknown): unknown {
  const body = (json ?? {}) as { candidates?: unknown; promptFeedback?: { blockReason?: unknown } };
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const first = (candidates[0] ?? null) as { finishReason?: unknown; content?: { parts?: unknown } } | null;
  if (!first) {
    const blocked = typeof body.promptFeedback?.blockReason === "string" ? ` blockReason=${body.promptFeedback.blockReason}` : "";
    throw new StepError("gemini_error", `후보 응답 없음${blocked}`);
  }
  const finish = typeof first.finishReason === "string" ? first.finishReason : "UNKNOWN";
  if (finish !== "STOP") throw new StepError(finish === "MAX_TOKENS" ? "invalid_json" : "gemini_error", `finishReason=${finish}`);

  const parts = Array.isArray(first.content?.parts) ? first.content.parts : [];
  // 사고 요약(thought: true)은 빼고 본문만 잇는다
  const text = parts
    .filter((p): p is { text: string } => typeof (p as { text?: unknown }).text === "string" && (p as { thought?: unknown }).thought !== true)
    .map((p) => p.text)
    .join("");
  if (text.trim().length === 0) throw new StepError("invalid_json", "빈 응답");
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new StepError("invalid_json", "JSON 해석 실패");
  }
}
