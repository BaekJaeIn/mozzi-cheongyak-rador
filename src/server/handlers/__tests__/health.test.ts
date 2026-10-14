// 예시 기반 테스트 — 헬스 체크 (L12)
import { describe, expect, it } from "vitest";
import { createHealthHandler } from "../health";
import { silentSink } from "../../__tests__/helpers";

describe("GET /api/health", () => {
  it("DB 조회가 되면 200 { ok: true }", async () => {
    const res = await createHealthHandler(async () => undefined, silentSink)();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("DB 조회가 실패하면 503 { ok: false }, 오류 내용은 응답에 없다", async () => {
    const res = await createHealthHandler(async () => {
      throw new Error("connection refused 10.0.0.1");
    }, silentSink)();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"ok":false}');
  });
});
