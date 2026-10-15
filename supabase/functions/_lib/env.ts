// Edge Function 환경 변수 (infrastructure-design §4). 값은 로그에 남기지 않는다.

export interface FunctionEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  cronSecret: string | undefined;
  dataGoKrKey: string | undefined;
  geminiKey: string | undefined;
  geminiModel: string | undefined;
  /** 로컬 개발 전용: 실제 소스·Gemini 대신 목업 */
  mock: boolean;
  amountEncKeys: Record<number, string>;
  amountEncKeyCurrent: number;
}

function optional(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`환경 변수 ${name}가 설정되지 않았습니다`);
  return value;
}

function readAmountKeys(): Record<number, string> {
  const keys: Record<number, string> = {};
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    const match = /^AMOUNT_ENC_KEY_V(\d+)$/.exec(name);
    if (match && value.trim()) keys[Number(match[1])] = value.trim();
  }
  return keys;
}

export function readFunctionEnv(): FunctionEnv {
  const amountEncKeys = readAmountKeys();
  const amountEncKeyCurrent = Number(required("AMOUNT_ENC_KEY_CURRENT"));
  if (!amountEncKeys[amountEncKeyCurrent]) throw new Error(`AMOUNT_ENC_KEY_V${amountEncKeyCurrent}가 설정되지 않았습니다`);
  return {
    supabaseUrl: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    cronSecret: optional("CRON_SECRET"),
    dataGoKrKey: optional("DATA_GO_KR_API_KEY"),
    geminiKey: optional("GEMINI_API_KEY"),
    geminiModel: optional("GEMINI_MODEL"),
    mock: optional("COLLECT_MOCK") === "1",
    amountEncKeys,
    amountEncKeyCurrent,
  };
}
