"use client";

// 상단 막대의 큰 글씨 버튼 — 처음 실행·마법사를 포함한 모든 화면에서 바로 바꾼다 (US-19)
import { useDisplayMode } from "./display-mode";

export function DisplayModeToggle() {
  const { mode, setMode } = useDisplayMode();
  const easy = mode === "easy";
  return (
    <button
      type="button"
      aria-pressed={easy}
      onClick={() => setMode(easy ? "normal" : "easy")}
      className={[
        "flex min-h-touch shrink-0 items-center gap-1 rounded-full px-3 text-caption font-bold",
        easy ? "bg-primary text-surface" : "bg-fill text-ink active:bg-line",
      ].join(" ")}
    >
      <span aria-hidden className="leading-none">
        <span className="text-caption">가</span>
        <span className="text-title">가</span>
      </span>
      큰 글씨
    </button>
  );
}
