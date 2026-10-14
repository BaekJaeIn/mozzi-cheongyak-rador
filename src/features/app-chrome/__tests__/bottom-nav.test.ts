// 예시 기반 테스트 — 하단 메뉴 현재 위치 판단
import { describe, expect, it } from "vitest";
import { isActive } from "../BottomNav";

describe("isActive", () => {
  it("피드는 / 와 공고 상세(/notice/...)에서 활성", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/notice/abc", "/")).toBe(true);
    expect(isActive("/settings", "/")).toBe(false);
  });

  it("관심 공고·설정은 경로 앞부분으로 판단", () => {
    expect(isActive("/bookmarks", "/bookmarks")).toBe(true);
    expect(isActive("/settings/profile", "/settings")).toBe(true);
    expect(isActive("/", "/settings")).toBe(false);
  });
});
