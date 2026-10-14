// 속성 기반 테스트 — 보관 판단 단조성, 공고 상태 불변식 (PBT-03)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { addDays, diffDays } from "../dates.ts";
import { isDeviceExpired, isNoticeExpired, noticeRetentionBaseDate, noticeStatus } from "../retention.ts";
import { instantArb, isoDateArb, noticeDatesArb, noticeScheduleArb } from "../../__tests__/arbitraries/index.ts";

test.prop([instantArb, instantArb, instantArb])(
  "isDeviceExpired는 시간에 대해 단조: 한 번 만료되면 이후에도 만료",
  (lastSeen, a, b) => {
    const [now1, now2] = a <= b ? [a, b] : [b, a];
    if (isDeviceExpired(lastSeen, now1)) expect(isDeviceExpired(lastSeen, now2)).toBe(true);
  },
);

test.prop([noticeDatesArb, isoDateArb, isoDateArb])(
  "isNoticeExpired는 날짜에 대해 단조",
  (notice, a, b) => {
    const [d1, d2] = a <= b ? [a, b] : [b, a];
    if (isNoticeExpired(notice, d1)) expect(isNoticeExpired(notice, d2)).toBe(true);
  },
);

test.prop([noticeDatesArb])("기준일 + 365일은 보관, + 366일은 만료", (notice) => {
  const base = noticeRetentionBaseDate(notice);
  expect(isNoticeExpired(notice, addDays(base, 365))).toBe(false);
  expect(isNoticeExpired(notice, addDays(base, 366))).toBe(true);
});

test.prop([noticeScheduleArb, isoDateArb])("공고 상태는 정확히 하나이고, 마감일이 없으면 closed가 아니다", (schedule, today) => {
  const status = noticeStatus(schedule, today);
  expect(["upcoming", "open", "closed"]).toContain(status);
  if (schedule.applyEnd === null) expect(status).not.toBe("closed");
  if (status === "closed") expect(diffDays(schedule.applyEnd!, today)).toBeGreaterThan(0);
});

test.prop([isoDateArb, fc.integer({ min: -4000, max: 4000 })])("addDays와 diffDays는 서로 역연산", (date, n) => {
  expect(diffDays(date, addDays(date, n))).toBe(n);
});
