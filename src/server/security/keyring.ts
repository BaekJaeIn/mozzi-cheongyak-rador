// ServerEnv → 금액 암호화 키링 (P-U2-S1). 서버 인스턴스당 한 번만 키를 가져온다.
import "server-only";
import { createKeyring, type Keyring } from "@shared/security/amount-cipher.ts";
import { getServerEnv } from "../env";

let keyringPromise: Promise<Keyring> | null = null;

export function getKeyring(): Promise<Keyring> {
  if (!keyringPromise) {
    const env = getServerEnv();
    keyringPromise = createKeyring(env.amountEncKeys, env.amountEncKeyCurrent).catch((error) => {
      keyringPromise = null; // 실패는 캐시하지 않는다
      throw error;
    });
  }
  return keyringPromise;
}
