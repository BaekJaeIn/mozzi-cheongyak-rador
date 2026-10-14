// 예시 기반 테스트 — 로그 가리기 (P-S5)
import { describe, expect, it } from "vitest";
import { createLogger, REDACTED, redact } from "../logger.ts";

describe("redact", () => {
  it("민감 키를 가리고 deviceId는 8자리만 남긴다", () => {
    const input = {
      deviceId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      token: "abc",
      nested: { encTotalAsset: "v1.x.y", list: [{ p256dh: "k", ok: 1 }] },
    };
    expect(redact(input)).toEqual({
      deviceId: "6f9619ff",
      token: REDACTED,
      nested: { encTotalAsset: REDACTED, list: [{ p256dh: REDACTED, ok: 1 }] },
    });
  });

  it("원본을 바꾸지 않는다", () => {
    const input = { token: "abc" };
    redact(input);
    expect(input.token).toBe("abc");
  });

  it("순환 참조가 있어도 멈추지 않는다", () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    expect(redact(input)).toEqual({ a: 1, self: "[Circular]" });
  });
});

describe("createLogger", () => {
  it("JSON 한 줄로 쓰고 민감 값은 가린다", () => {
    const lines: string[] = [];
    const log = createLogger({ requestId: "r1" }, (line) => lines.push(line));
    log.info("등록", { token: "secret", status: 201 });
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ level: "info", msg: "등록", requestId: "r1", token: REDACTED, status: 201 });
    expect(lines[0]).not.toContain("secret");
  });
});
