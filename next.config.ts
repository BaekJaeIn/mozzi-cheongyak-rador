import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 서비스워커는 매번 새 버전을 확인한다 (U6 infrastructure-design §1)
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "no-cache, no-store, must-revalidate" },
          { key: "content-type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
