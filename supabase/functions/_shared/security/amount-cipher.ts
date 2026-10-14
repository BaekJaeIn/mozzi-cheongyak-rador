// 소득·자산 금액 암호화 (BR-U2-70~72, P-U2-S1, U1 NFR-U1-15)
// 형식: v{키버전}.{IV 12바이트 base64url}.{암호문 base64url}, 평문 = 금액(만원) 10진 문자열
import { base64UrlToBytes, bytesToBase64Url } from "../encoding/base64url.ts";
import { MAX_AMOUNT_MANWON } from "../domain/profile.ts";

export const IV_BYTES = 12;
const KEY_BYTES = 32;
// 암호문 최소 길이: 평문 1바이트("0") + GCM 태그 16바이트 = 17바이트 → base64url 23자
// (PBT가 찾은 회귀: 처음에 24자 이상으로 두어 0~9만원 금액을 복호화하지 못했다)
const CIPHERTEXT_PATTERN = /^v(\d{1,4})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{23,})$/;

export class AmountCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountCipherError";
  }
}

export interface Keyring {
  current: number;
  keys: ReadonlyMap<number, CryptoKey>;
}

/** 새 ArrayBuffer로 복사 (WebCrypto BufferSource 타입·공유 버퍼 문제 방지) */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * 버전별 키(base64url 32바이트)를 가져와 내보낼 수 없는 CryptoKey로 보관한다.
 * 키 원문은 이 함수 밖으로 나가지 않는다.
 */
export async function createKeyring(rawKeys: Readonly<Record<number, string>>, current: number): Promise<Keyring> {
  const keys = new Map<number, CryptoKey>();
  for (const [version, raw] of Object.entries(rawKeys)) {
    let bytes: Uint8Array;
    try {
      bytes = base64UrlToBytes(raw);
    } catch {
      throw new AmountCipherError(`키 v${version}가 base64url 형식이 아닙니다`);
    }
    if (bytes.length !== KEY_BYTES) throw new AmountCipherError(`키 v${version}의 길이가 32바이트가 아닙니다`);
    keys.set(
      Number(version),
      await crypto.subtle.importKey("raw", toBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]),
    );
  }
  if (!keys.has(current)) throw new AmountCipherError(`현재 키 v${current}가 없습니다`);
  return { current, keys };
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT_MANWON;
}

export async function encryptAmount(value: number, keyring: Keyring): Promise<string> {
  if (!isValidAmount(value)) throw new AmountCipherError("금액 범위를 벗어났습니다");
  const key = keyring.keys.get(keyring.current)!;
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    key,
    toBuffer(new TextEncoder().encode(String(value))),
  );
  return `v${keyring.current}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipher))}`;
}

export function cipherVersionOf(text: string): number | null {
  const match = CIPHERTEXT_PATTERN.exec(text);
  return match ? Number(match[1]) : null;
}

export async function decryptAmount(text: string, keyring: Keyring): Promise<number> {
  const match = CIPHERTEXT_PATTERN.exec(text);
  if (!match) throw new AmountCipherError("암호문 형식이 올바르지 않습니다");
  const version = Number(match[1]);
  const key = keyring.keys.get(version);
  if (!key) throw new AmountCipherError(`키 v${version}가 없습니다`);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBuffer(base64UrlToBytes(match[2]!)) },
      key,
      toBuffer(base64UrlToBytes(match[3]!)),
    );
  } catch {
    throw new AmountCipherError(`v${version} 암호문을 복호화할 수 없습니다 (위조 또는 다른 키)`);
  }
  const text10 = new TextDecoder().decode(plain);
  const value = /^\d{1,7}$/.test(text10) ? Number(text10) : NaN;
  if (!isValidAmount(value)) throw new AmountCipherError("복호화한 금액이 올바르지 않습니다");
  return value;
}
