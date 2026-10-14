// 공용 fast-check 생성기 (PBT-07). 도메인 제약을 지키는 값만 만든다.
import fc from "fast-check";
import { bytesToBase64Url } from "../../encoding/base64url.ts";
import { TOKEN_BYTES } from "../../security/token.ts";
import type { IsoDate } from "../../domain/dates.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2020-01-01 ~ 2035-12-31 (서비스가 다룰 현실적인 날짜 범위)
const MIN_EPOCH_DAY = Date.UTC(2020, 0, 1) / DAY_MS;
const MAX_EPOCH_DAY = Date.UTC(2035, 11, 31) / DAY_MS;

/** UUID v4 소문자 */
export const deviceIdArb = fc.uuid({ version: 4 }).map((id) => id.toLowerCase());

/** 32바이트 난수를 base64url로 바꾼 토큰 (43자) */
export const tokenArb = fc
  .uint8Array({ minLength: TOKEN_BYTES, maxLength: TOKEN_BYTES })
  .map((bytes) => bytesToBase64Url(bytes));

export const credentialsArb = fc.record({ deviceId: deviceIdArb, token: tokenArb });

/** 한국 날짜 'YYYY-MM-DD' */
export const isoDateArb: fc.Arbitrary<IsoDate> = fc
  .integer({ min: MIN_EPOCH_DAY, max: MAX_EPOCH_DAY })
  .map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10));

/** 서비스 범위 안의 시각 */
export const instantArb = fc.date({
  min: new Date(MIN_EPOCH_DAY * DAY_MS),
  max: new Date(MAX_EPOCH_DAY * DAY_MS),
  noInvalidDate: true,
});

/** 접수 일정: 시작·마감은 없을 수도 있고, 둘 다 있으면 시작 ≤ 마감 */
export const noticeScheduleArb = fc
  .tuple(fc.option(isoDateArb, { nil: null }), fc.option(isoDateArb, { nil: null }))
  .map(([a, b]) => {
    if (a !== null && b !== null && a > b) return { applyStart: b, applyEnd: a };
    return { applyStart: a, applyEnd: b };
  });

export const noticeDatesArb = fc.record({
  applyEnd: fc.option(isoDateArb, { nil: null }),
  announcedAt: fc.option(isoDateArb, { nil: null }),
  firstSeenAt: instantArb,
});

/** 로그에 들어갈 수 있는 민감 키 (대소문자 변형 포함) */
export const sensitiveKeyArb = fc.constantFrom(
  "token",
  "Token",
  "x-device-token",
  "tokenHash",
  "profile",
  "money",
  "monthlyIncome",
  "totalAsset",
  "carValue",
  "p256dh",
  "auth",
  "authorization",
  "encMonthlyIncome",
  "encTotalAsset",
  "encCarValue",
);

/** 일반 키 (민감 키와 겹치지 않음) */
export const plainKeyArb = fc.constantFrom("msg", "route", "status", "ms", "requestId", "count", "source", "items");

/** 비밀 표식: 가려지지 않으면 결과 JSON에 그대로 보인다 */
export const SECRET_MARK = "SECRET-7f3a";

/** 민감 키가 여러 깊이에 섞인 로그 객체 */
export const logPayloadArb: fc.Arbitrary<Record<string, unknown>> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    fc.string({ maxLength: 10 }).filter((s) => !s.includes(SECRET_MARK)),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(tie("value"), { maxLength: 3 }),
    tie("object"),
  ),
  object: fc
    .tuple(
      fc.dictionary(plainKeyArb, tie("value"), { maxKeys: 3 }),
      fc.dictionary(sensitiveKeyArb, fc.constant(`${SECRET_MARK}`), { maxKeys: 3 }),
    )
    .map(([plain, secret]) => ({ ...plain, ...secret })),
})).object as fc.Arbitrary<Record<string, unknown>>;
