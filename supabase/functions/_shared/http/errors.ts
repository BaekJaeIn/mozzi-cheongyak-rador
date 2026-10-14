// API 오류 코드와 사용자용 문구 (BR-U1-20, NFR-1.5)
// message는 화면에 그대로 보여줄 수 있는 쉬운 한국어 한 문장이다.

export const ERROR_MESSAGES = {
  AUTH_MISSING: "앱을 다시 열어 주세요.",
  DEVICE_UNKNOWN: "기기 정보를 다시 확인하고 있어요. 잠시 후 다시 시도해 주세요.",
  TOKEN_MISMATCH: "기기 정보를 다시 확인하고 있어요. 잠시 후 다시 시도해 주세요.",
  DEVICE_CONFLICT: "기기 등록 중 문제가 생겼어요. 다시 시도해 주세요.",
  TOO_MANY_REGISTRATIONS: "잠시 후 다시 시도해 주세요.",
  PAYLOAD_TOO_LARGE: "보내는 내용이 너무 커요. 다시 시도해 주세요.",
  BAD_REQUEST: "요청 내용이 올바르지 않아요. 앱을 다시 열어 주세요.",
  NETWORK: "인터넷 연결을 확인해 주세요.",
  SERVER: "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.",
} as const;

export type ApiErrorCode = keyof typeof ERROR_MESSAGES;

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}

export function apiError(code: ApiErrorCode): ApiErrorBody {
  return { code, message: ERROR_MESSAGES[code] };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (value === null || typeof value !== "object") return false;
  const { code, message } = value as Record<string, unknown>;
  return typeof code === "string" && code in ERROR_MESSAGES && typeof message === "string";
}
