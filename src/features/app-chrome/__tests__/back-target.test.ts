import { describe, expect, it } from "vitest";
import { backTarget, isListPath } from "../back-target";

const withProfile = { lastList: "/" as const, hasProfile: true };

describe("휴대폰 뒤로 버튼이 갈 곳", () => {
  it("공고 상세 → 들어온 목록", () => {
    expect(backTarget("/notice/abc", withProfile)).toEqual({ kind: "go", href: "/" });
    expect(backTarget("/notice/abc", { ...withProfile, lastList: "/bookmarks" })).toEqual({ kind: "go", href: "/bookmarks" });
  });

  it("관심 공고·설정 → 맞춤 공고", () => {
    expect(backTarget("/bookmarks", withProfile)).toEqual({ kind: "go", href: "/" });
    expect(backTarget("/settings", withProfile)).toEqual({ kind: "go", href: "/" });
  });

  it("내 정보 고치기·다시 입력하기 → 설정", () => {
    expect(backTarget("/profile/edit/housing", withProfile)).toEqual({ kind: "go", href: "/settings" });
    expect(backTarget("/profile/setup", withProfile)).toEqual({ kind: "go", href: "/settings" });
  });

  it("맞춤 공고와 처음 입력(내 정보 없음)은 종료", () => {
    expect(backTarget("/", withProfile)).toEqual({ kind: "exit" });
    expect(backTarget("/", { lastList: "/", hasProfile: false })).toEqual({ kind: "exit" });
    expect(backTarget("/profile/setup", { lastList: "/", hasProfile: false })).toEqual({ kind: "exit" });
  });

  it("목록 화면 판별", () => {
    expect(isListPath("/")).toBe(true);
    expect(isListPath("/bookmarks")).toBe(true);
    expect(isListPath("/settings")).toBe(false);
    expect(isListPath("/notice/x")).toBe(false);
  });
});
