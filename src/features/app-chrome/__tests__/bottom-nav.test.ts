// 예시 기반 테스트 — 하단 메뉴 현재 위치 판단
import { describe, expect, it } from "vitest";
import { isActive, shouldShowNav } from "../BottomNav";

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

describe("shouldShowNav (BR-U4-03)", () => {
  it("프로필이 있을 때만, 마법사에서는 숨김", () => {
    expect(shouldShowNav("/", true, true)).toBe(true);
    expect(shouldShowNav("/", true, false)).toBe(false);
    expect(shouldShowNav("/", false, true)).toBe(false);
    expect(shouldShowNav("/profile/setup", true, true)).toBe(false);
    expect(shouldShowNav("/profile/edit/basic", true, true)).toBe(false);
    expect(shouldShowNav("/settings", true, true)).toBe(true);
  });
});
