// 서비스워커 — 알림 표시·클릭 이동·구독 변경만 (U6 frontend-components §6, BR-U6-85·86·94)
// 페이지 응답은 저장(캐시)하지 않는다: 오래된 공고·판정 화면을 보이지 않게.

const DEFAULT_NOTICE = {
  title: "모찌네 청약 알리미",
  body: "새 공고를 확인해 보세요",
  url: "/",
  tag: "fallback",
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// --- safeClickUrl: src/features/pwa/model/click-url.ts와 같은 규칙 (테스트가 두 구현을 비교한다) ---
function safeClickUrl(url, origin) {
  try {
    const u = new URL(String(url), origin);
    if (u.origin !== origin || !u.pathname.startsWith("/") || u.pathname.startsWith("//")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
// --- safeClickUrl 끝 ---

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && typeof data.body === "string") {
      return { title: data.title, body: data.body, url: typeof data.url === "string" ? data.url : "/", tag: typeof data.tag === "string" ? data.tag : "push" };
    }
  } catch {
    // 내용이 깨져도 iOS는 알림을 꼭 보여야 한다 (NFR-U6-23)
  }
  return DEFAULT_NOTICE;
}

self.addEventListener("push", (event) => {
  const p = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/maskable-192.png",
      lang: "ko",
      data: { url: p.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeClickUrl(event.notification.data && event.notification.data.url, self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(target).catch(() => client.postMessage({ type: "navigate", url: target }));
        } else {
          client.postMessage({ type: "navigate", url: target });
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// 브라우저가 구독을 바꿨다 — 서비스워커는 기기 토큰이 없으므로 열린 화면에 다시 저장을 부탁한다 (BR-U6-57)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "resubscribe" });
    })(),
  );
});
