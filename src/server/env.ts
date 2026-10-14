// 서버 전용 환경 변수 (L6, P-S7). 클라이언트 컴포넌트가 import하면 빌드가 실패한다.
import "server-only";

export interface ServerEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** 키 버전 → base64url 키. U2 AmountCipher가 사용 */
  amountEncKeys: Record<number, string>;
  amountEncKeyCurrent: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`환경 변수 ${name}가 설정되지 않았습니다 (.env.example 참고)`);
  }
  return value;
}

function readAmountKeys(): Record<number, string> {
  const keys: Record<number, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    const match = /^AMOUNT_ENC_KEY_V(\d+)$/.exec(name);
    if (match && value) keys[Number(match[1])] = value;
  }
  return keys;
}

let cached: ServerEnv | null = null;

/** 처음 호출할 때 읽고 검증한다 (빌드 시점에는 읽지 않음). */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const amountEncKeys = readAmountKeys();
  const amountEncKeyCurrent = Number(required("AMOUNT_ENC_KEY_CURRENT"));
  if (!amountEncKeys[amountEncKeyCurrent]) {
    throw new Error(`AMOUNT_ENC_KEY_V${amountEncKeyCurrent}가 설정되지 않았습니다`);
  }
  cached = {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    amountEncKeys,
    amountEncKeyCurrent,
  };
  return cached;
}

/** 테스트 전용: 캐시 초기화 */
export function resetServerEnvForTest(): void {
  cached = null;
}
