// 성능 목표 확인 (NFR-U2-01: 공고 1건 1ms 이하, NFR-U2-02: 기기 1대 · 공고 2,000건 계산 1초 이하 — DB 시간 제외)
import fc from "fast-check";
import { expect, it } from "vitest";
import { judgeNotice } from "../engine.ts";
import { noticeArb, profileArb } from "../../__tests__/arbitraries/eligibility.ts";
import { REFERENCE_2026 } from "../../__tests__/fixtures.ts";

it("공고 2,000건 판정이 1초 안에 끝나고, 1건 평균 1ms 이하", () => {
  const notices = fc.sample(noticeArb, { numRuns: 2000, seed: 42 });
  const [profile] = fc.sample(profileArb(), { numRuns: 1, seed: 7 });
  const started = performance.now();
  for (const n of notices) judgeNotice(profile!, n, REFERENCE_2026, "2026-10-14");
  const ms = performance.now() - started;
  expect(ms).toBeLessThan(1000);
  expect(ms / notices.length).toBeLessThan(1);
});
