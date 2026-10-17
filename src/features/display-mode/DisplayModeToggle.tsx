"use client";

// 상단 막대의 글씨 크기 토글 [작은 글씨 | 큰 글씨] — 처음 실행·마법사를 포함한 모든 화면에서 바로 바꾼다 (US-19, BR-U4-82)
// 큰 글씨 = 쉬운 모드. 설정 화면의 "화면" 선택과 같은 값을 쓴다
import { useDisplayMode } from "./display-mode";

const OPTIONS = [
  { value: "normal", label: "작은 글씨" },
  { value: "easy", label: "큰 글씨" },
] as const;

export function DisplayModeToggle() {
  const { mode, setMode } = useDisplayMode();
  return (
    <div role="radiogroup" aria-label="글씨 크기" className="flex shrink-0 rounded-full bg-fill p-1">
      {OPTIONS.map((o) => {
        const on = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(o.value)}
            className={[
              "min-h-touch whitespace-nowrap rounded-full px-3 text-caption",
              on ? "bg-surface font-bold text-primary shadow-card" : "font-normal text-muted",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
