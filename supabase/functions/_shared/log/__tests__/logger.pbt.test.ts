// 속성 기반 테스트 — 로그 가리기 불변식·멱등 (PBT-03, PBT-04)
import { test } from "@fast-check/vitest";
import { expect } from "vitest";
import { redact } from "../logger.ts";
import { logPayloadArb, SECRET_MARK } from "../../__tests__/arbitraries/index.ts";

test.prop([logPayloadArb])("가린 결과 어디에도 민감 값이 남지 않는다", (payload) => {
  expect(JSON.stringify(redact(payload))).not.toContain(SECRET_MARK);
});

test.prop([logPayloadArb])("redact(redact(x)) = redact(x)", (payload) => {
  const once = redact(payload);
  expect(redact(once)).toEqual(once);
});
