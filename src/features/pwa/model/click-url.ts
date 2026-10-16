// 알림 클릭 이동 주소 — 같은 사이트 경로만 (BR-U6-86, P-18)
// public/sw.js의 safeClickUrl과 같은 규칙이다 (테스트가 두 구현을 비교한다)
export function safeClickUrl(url: unknown, origin: string): string {
  try {
    const u = new URL(String(url), origin);
    if (u.origin !== origin || !u.pathname.startsWith("/") || u.pathname.startsWith("//")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

/** 브라우저 구독의 공개 키와 서버 공개 키가 다르면 다시 구독해야 한다 (VAPID 키 교체) */
export function sameKey(subscriptionKey: ArrayBuffer | null, serverKey: Uint8Array): boolean {
  if (!subscriptionKey) return false;
  const a = new Uint8Array(subscriptionKey);
  return a.length === serverKey.length && a.every((b, i) => b === serverKey[i]);
}
