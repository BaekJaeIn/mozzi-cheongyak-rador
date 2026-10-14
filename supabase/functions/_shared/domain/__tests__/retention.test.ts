// 예시 기반 테스트 — 보관 기간 경계와 공고 상태 (BR-U1-13, 14)
import { describe, expect, it } from "vitest";
import { isDeviceExpired, isNoticeExpired, noticeRetentionBaseDate, noticeStatus } from "../retention.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("isDeviceExpired", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  it("정확히 180일 전 접속은 보관", () => {
    expect(isDeviceExpired(new Date(now.getTime() - 180 * DAY), now)).toBe(false);
  });
  it("180일 + 1ms 전 접속은 삭제 대상", () => {
    expect(isDeviceExpired(new Date(now.getTime() - 180 * DAY - 1), now)).toBe(true);
  });
});

describe("isNoticeExpired", () => {
  const firstSeenAt = new Date("2024-01-01T00:00:00Z");
  it("마감일로부터 정확히 365일째는 보관", () => {
    expect(isNoticeExpired({ applyEnd: "2025-10-14", firstSeenAt }, "2026-10-14")).toBe(false);
  });
  it("366일째는 삭제 대상", () => {
    expect(isNoticeExpired({ applyEnd: "2025-10-13", firstSeenAt }, "2026-10-14")).toBe(true);
  });
  it("마감일이 없으면 모집공고일, 그것도 없으면 첫 수집일(한국 날짜) 기준", () => {
    expect(noticeRetentionBaseDate({ announcedAt: "2025-03-02", firstSeenAt })).toBe("2025-03-02");
    // 2024-12-31T15:00Z = 한국 2025-01-01
    expect(noticeRetentionBaseDate({ firstSeenAt: new Date("2024-12-31T15:00:00Z") })).toBe("2025-01-01");
  });
});

describe("noticeStatus", () => {
  const schedule = { applyStart: "2026-10-10", applyEnd: "2026-10-20" };
  it("접수 시작 전은 upcoming", () => expect(noticeStatus(schedule, "2026-10-09")).toBe("upcoming"));
  it("시작일 당일은 open", () => expect(noticeStatus(schedule, "2026-10-10")).toBe("open"));
  it("마감일 당일은 open", () => expect(noticeStatus(schedule, "2026-10-20")).toBe("open"));
  it("마감 다음 날은 closed", () => expect(noticeStatus(schedule, "2026-10-21")).toBe("closed"));
  it("일정이 없으면 upcoming", () => expect(noticeStatus({}, "2026-10-21")).toBe("upcoming"));
});
