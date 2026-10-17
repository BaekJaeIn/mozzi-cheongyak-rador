// 휴대폰 뒤로 버튼이 갈 곳 (2026-10-17 사용자 요청)
// - 앱 안 이동은 모두 replace라서 방문 기록이 쌓이지 않는다. 뒤로 버튼은 화면 위계로만 움직인다
// - 공고 상세 → 들어온 목록(맞춤 공고 또는 관심 공고), 관심 공고·설정 → 맞춤 공고, 내 정보 고치기 → 설정
// - 맞춤 공고(첫 화면)에서는 "한 번 더 누르면 종료" 안내 뒤 두 번째에 종료

export type BackTarget = { kind: "go"; href: string } | { kind: "exit" };

export type ListPath = "/" | "/bookmarks";

export function backTarget(pathname: string, opts: { lastList: ListPath; hasProfile: boolean }): BackTarget {
  if (pathname.startsWith("/notice/")) return { kind: "go", href: opts.lastList };
  if (pathname.startsWith("/bookmarks") || pathname.startsWith("/settings")) return { kind: "go", href: "/" };
  if (pathname.startsWith("/profile/edit")) return { kind: "go", href: "/settings" };
  // 처음 입력 중(내 정보 없음)이면 마법사가 첫 화면이다. 다시 입력하기는 설정에서 들어온다
  if (pathname.startsWith("/profile")) return opts.hasProfile ? { kind: "go", href: "/settings" } : { kind: "exit" };
  return { kind: "exit" };
}

/** 두 번째 누름을 종료로 보는 시간 */
export const EXIT_WINDOW_MS = 2000;

export function isListPath(pathname: string): pathname is ListPath {
  return pathname === "/" || pathname === "/bookmarks";
}
