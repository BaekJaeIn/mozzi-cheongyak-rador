// 웹 푸시 암호화·VAPID·구독 검사 예시 테스트 (NFR-U6-32, BR-U6-50~52)
import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../../encoding/base64url.ts";
import { encryptPayload, importEcdhPrivate } from "../encrypt.ts";
import { endpointHash, isAllowedPushEndpoint, validateSubscription } from "../endpoint.ts";
import { createVapidSigner, generateVapidKeys } from "../vapid.ts";

// RFC 8291 부록 A (Section 5 예시) — 공식 시험 값
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("RFC 8291 aes128gcm 암호화", () => {
  it("부록 A의 공식 시험 값과 바이트 단위로 같다", async () => {
    const asPublic = base64UrlToBytes(RFC.asPublic);
    const privateKey = await importEcdhPrivate(base64UrlToBytes(RFC.asPrivate), asPublic);
    const body = await encryptPayload(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: base64UrlToBytes(RFC.uaPublic), auth: base64UrlToBytes(RFC.authSecret) },
      { ephemeral: { privateKey, publicKey: asPublic }, salt: base64UrlToBytes(RFC.salt) },
    );
    expect(bytesToBase64Url(body)).toBe(RFC.body);
  });

  it("형식이 틀린 키·너무 큰 내용은 거부", async () => {
    const keys = { p256dh: base64UrlToBytes(RFC.uaPublic), auth: base64UrlToBytes(RFC.authSecret) };
    await expect(encryptPayload(new Uint8Array(1), { ...keys, auth: new Uint8Array(8) })).rejects.toThrow("auth");
    await expect(encryptPayload(new Uint8Array(1), { ...keys, p256dh: new Uint8Array(65) })).rejects.toThrow("p256dh");
    await expect(encryptPayload(new Uint8Array(5000), keys)).rejects.toThrow("너무 커요");
  });
});

describe("VAPID (RFC 8292)", () => {
  it("ES256 JWT: 머리·내용이 맞고 공개 키로 서명이 검증된다, 같은 origin은 재사용", async () => {
    const keys = await generateVapidKeys();
    const signer = await createVapidSigner({ ...keys, subject: "https://mozzi-cheongyak-rador.vercel.app" });
    const now = 1_790_000_000;
    const header = await signer.authorization("https://fcm.googleapis.com/fcm/send/abc", now);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(m[2]).toBe(keys.publicKey);
    const [h, p, s] = m[1]!.split(".");
    const dec = (x: string) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(x)));
    expect(dec(h!)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(dec(p!)).toEqual({ aud: "https://fcm.googleapis.com", exp: now + 12 * 3600, sub: "https://mozzi-cheongyak-rador.vercel.app" });

    const pub = await crypto.subtle.importKey("raw", new Uint8Array(base64UrlToBytes(keys.publicKey)), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, new Uint8Array(base64UrlToBytes(s!)), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
    expect(await signer.authorization("https://fcm.googleapis.com/other", now + 60)).toBe(header);
    expect(await signer.authorization("https://web.push.apple.com/x", now)).not.toBe(header);
  });

  it("설정이 틀리면 만들지 않는다", async () => {
    await expect(createVapidSigner({ publicKey: "x", privateKey: "y", subject: "https://a" })).rejects.toThrow("VAPID");
  });
});

describe("구독 주소·형식 검사 (BR-U6-50~52, P-14)", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/abc", true],
    ["https://web.push.apple.com/QGx", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://wns2-par02p.notify.windows.com/w/?token=x", true],
    ["http://fcm.googleapis.com/fcm/send/abc", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://evil.com/fcm.googleapis.com", false],
    ["https://fcm.googleapis.com.evil.com/x", false],
    ["https://push.apple.com/x", false],
    ["https://user@fcm.googleapis.com/x", false],
    ["https://127.0.0.1/x", false],
    ["https://[::1]/x", false],
    [`https://fcm.googleapis.com/${"a".repeat(2100)}`, false],
  ])("%s → %s", (url, ok) => {
    expect(isAllowedPushEndpoint(url)).toBe(ok);
  });

  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: RFC.uaPublic, auth: RFC.authSecret } };

  it("브라우저 toJSON 모양을 받는다", () => {
    expect(validateSubscription(good)).toEqual({ ok: true, value: { endpoint: good.endpoint, keys: good.keys } });
  });

  it.each([
    [{ ...good, extra: 1 }, "body"],
    [{ ...good, endpoint: "https://evil.com/x" }, "endpoint"],
    [{ ...good, keys: { ...good.keys, extra: "x" } }, "keys"],
    [{ ...good, keys: { ...good.keys, p256dh: RFC.authSecret } }, "p256dh"],
    [{ ...good, keys: { ...good.keys, auth: RFC.uaPublic } }, "auth"],
    [{ ...good, keys: { ...good.keys, auth: "!!!" } }, "auth"],
    ["x", "body"],
  ])("틀린 항목 %#", (body, field) => {
    expect(validateSubscription(body)).toEqual({ ok: false, field });
  });

  it("로그용 해시는 8자", async () => {
    expect(await endpointHash(good.endpoint)).toMatch(/^[0-9a-f]{8}$/);
  });
});
