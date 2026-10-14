// 구조화 로그 + 민감 정보 가리기 (P-S5, BR-U1-21, NFR-U1-17)

export const REDACTED = "[REDACTED]";

// 이 이름(대소문자 무시)이거나 `enc`로 시작하는 키의 값은 가린다
const SENSITIVE_KEYS = new Set([
  "token",
  "x-device-token",
  "tokenhash",
  "profile",
  "money",
  "monthlyincome",
  "totalasset",
  "carvalue",
  "p256dh",
  "auth",
  "authorization",
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.has(lower) || lower.startsWith("enc");
}

/** deviceId는 앞 8자리만 남긴다. */
function shortenDeviceId(value: unknown): unknown {
  return typeof value === "string" ? value.slice(0, 8) : value;
}

/** 민감 키의 값을 어떤 깊이에서든 가린 복사본을 만든다. 원본은 바꾸지 않는다. */
export function redact(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const walk = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return "[Circular]";
    seen.add(node);

    if (Array.isArray(node)) return node.map(walk);

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (isSensitiveKey(key)) out[key] = REDACTED;
      else if (key === "deviceId") out[key] = shortenDeviceId(child);
      else out[key] = walk(child);
    }
    return out;
  };

  return walk(value);
}

export type LogLevel = "info" | "warn" | "error";
export type LogSink = (line: string) => void;

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(base: Record<string, unknown> = {}, sink: LogSink = console.log): Logger {
  const write = (level: LogLevel, msg: string, fields: Record<string, unknown> = {}) => {
    sink(JSON.stringify(redact({ level, msg, ts: new Date().toISOString(), ...base, ...fields })));
  };
  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}
