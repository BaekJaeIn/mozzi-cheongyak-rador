// 속성 기반 테스트 — 인증 헤더 왕복 (PBT-02)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { buildAuthHeaders, HEADER_DEVICE_ID, parseAuthHeaders } from "../auth-headers.ts";
import { credentialsArb } from "../../__tests__/arbitraries/index.ts";

const toHeaders = (record: Record<string, string>) => new Headers(record);

test.prop([credentialsArb])("parseAuthHeaders(buildAuthHeaders(c)) = c", (credentials) => {
  expect(parseAuthHeaders(toHeaders(buildAuthHeaders(credentials)))).toEqual(credentials);
});

test.prop([credentialsArb, fc.string({ maxLength: 40 })])(
  "기기 ID가 형식에 맞지 않으면 null",
  (credentials, badId) => {
    fc.pre(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(badId));
    const headers = toHeaders({ ...buildAuthHeaders(credentials), [HEADER_DEVICE_ID]: badId });
    expect(parseAuthHeaders(headers)).toBeNull();
  },
);
