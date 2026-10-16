// 웹 푸시 내용 암호화 — RFC 8291 (Message Encryption for Web Push) + RFC 8188 aes128gcm
// Web Crypto만 쓴다 (Deno·Node·브라우저 공용). 암호 알고리즘은 Web Crypto, 여기서는 표준 절차대로 조합만 한다.
// 시험(RFC 8291 부록 A)을 위해 임시 키·salt를 바깥에서 넣을 수 있다.
import { base64UrlToBytes, bytesToBase64Url } from "../encoding/base64url.ts";

export const RECORD_SIZE = 4096;
const enc = new TextEncoder();

export interface PushKeys {
  /** 브라우저 공개 키 (P-256 압축 안 된 점, 65바이트) — 구독의 p256dh */
  p256dh: Uint8Array;
  /** 브라우저 인증 비밀값 16바이트 — 구독의 auth */
  auth: Uint8Array;
}

export interface EphemeralKey {
  privateKey: CryptoKey;
  /** 65바이트 */
  publicKey: Uint8Array;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Web Crypto는 ArrayBuffer 기반 뷰를 원한다 */
const buf = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** 65바이트 공개 점 → JWK x·y */
export function pointToJwk(point: Uint8Array): { x: string; y: string } {
  if (point.length !== 65 || point[0] !== 0x04) throw new Error("P-256 공개 키 형식이 아니에요");
  return { x: bytesToBase64Url(point.slice(1, 33)), y: bytesToBase64Url(point.slice(33, 65)) };
}

/** 32바이트 개인 값 d + 65바이트 공개 점 → ECDH 개인 키 */
export async function importEcdhPrivate(d: Uint8Array, publicPoint: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: bytesToBase64Url(d), ...pointToJwk(publicPoint), ext: false },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

export async function generateEphemeralKey(): Promise<EphemeralKey> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKey };
}

export interface EncryptOptions {
  /** 시험용 — 없으면 새로 만든다 */
  ephemeral?: EphemeralKey;
  salt?: Uint8Array;
}

/**
 * RFC 8291 §3·§4: 한 레코드(aes128gcm)로 암호화한 본문.
 * 헤더 = salt(16) ‖ rs(4, 4096) ‖ idlen(1)=65 ‖ keyid(서버 임시 공개 키 65)
 */
export async function encryptPayload(plaintext: Uint8Array, keys: PushKeys, options: EncryptOptions = {}): Promise<Uint8Array> {
  if (keys.p256dh.length !== 65 || keys.p256dh[0] !== 0x04) throw new Error("p256dh 형식이 아니에요");
  if (keys.auth.length !== 16) throw new Error("auth 길이가 16바이트가 아니에요");
  // 한 레코드에 들어가야 한다: 내용 + 구분자 1 + 태그 16 ≤ rs
  if (plaintext.length + 1 + 16 > RECORD_SIZE - 86) throw new Error("알림 내용이 너무 커요");

  const ephemeral = options.ephemeral ?? (await generateEphemeralKey());
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const uaPublic = await crypto.subtle.importKey(
    "raw",
    buf(keys.p256dh),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublic }, ephemeral.privateKey, 256));

  // §3.3: IKM = HKDF(auth, ecdh_secret, "WebPush: info" ‖ 0x00 ‖ ua_public ‖ as_public, 32)
  const keyInfo = concat(enc.encode("WebPush: info\0"), keys.p256dh, ephemeral.publicKey);
  const ikm = await hkdf(keys.auth, ecdhSecret, keyInfo, 32);
  // RFC 8188 §2.2·2.3
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const record = concat(plaintext, new Uint8Array([0x02])); // 마지막 레코드 구분자
  const aesKey = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aesKey, buf(record)));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ephemeral.publicKey.length;
  return concat(header, ephemeral.publicKey, ciphertext);
}

/** 구독의 base64url 키 → 바이트 */
export function decodePushKeys(p256dh: string, auth: string): PushKeys {
  return { p256dh: base64UrlToBytes(p256dh), auth: base64UrlToBytes(auth) };
}
