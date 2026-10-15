import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "aidlc-docs/**",
    "aidlc-rule-details/**",
    // Deno 진입점(Edge Function)은 deno check로 검사한다
    "supabase/functions/collect/**",
    "supabase/functions/analyze/**",
    "supabase/functions/dispatch/**",
    "supabase/functions/_lib/**",
  ]),
]);
