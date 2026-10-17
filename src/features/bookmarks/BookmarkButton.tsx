"use client";

// 별 버튼 — 피드 카드·상세 (BR-U5-117). 상태는 aria-pressed, 결과는 BookmarksProvider가 읽어 준다
import type { BookmarkSnapshot } from "./model/store";
import { useBookmarks } from "./BookmarksProvider";

export function BookmarkButton({ id, snapshot, size = "normal" }: { id: string; snapshot: BookmarkSnapshot; size?: "normal" | "large" }) {
  const { has, toggle, loaded } = useBookmarks();
  const on = has(id);
  const label = on ? "관심 공고에서 빼기" : "관심 공고 저장";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={!loaded}
      onClick={() => toggle(id, snapshot)}
      className={[
        "flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-2 rounded-2xl px-3 text-body font-bold",
        size === "large"
          ? ["w-full border", on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink active:bg-fill"].join(" ")
          : on
            ? "text-primary"
            : "text-muted active:bg-fill",
      ].join(" ")}
    >
      <svg width={size === "large" ? 24 : 28} height={size === "large" ? 24 : 28} viewBox="0 0 24 24" aria-hidden fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
      {size === "large" && <span aria-hidden>{on ? "저장됨" : "관심 저장"}</span>}
    </button>
  );
}
