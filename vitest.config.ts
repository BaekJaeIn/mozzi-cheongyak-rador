import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./supabase/functions/_shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 서버 전용 표식 모듈은 테스트에서 빈 모듈로 대체한다
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/functions/_shared/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // PBT 실패를 재시도로 덮지 않는다 (NFR-U1-23)
    retry: 0,
  },
});
