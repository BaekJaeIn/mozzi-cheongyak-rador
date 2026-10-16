import type { MetadataRoute } from "next";

// 홈 화면 앱 정보 (U6 frontend-components §1, BR-U6-75, NFR-U6-26)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모찌네 청약 알리미",
    short_name: "청약 알리미",
    description: "3기 신도시 분양·임대 공고 중 우리 집에 맞는 것만 골라 알려 드려요",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0b5cad",
    background_color: "#f6f7f9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
