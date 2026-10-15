"use client";

// 일반 / 쉬운 모드 (US-19, BR-U4-80~83). 크기 토큰(--scale)은 html[data-mode]로 바뀐다 (globals.css).
import { useCallback, useEffect, useState } from "react";
import { DISPLAY_KEY, type DisplayMode, loadDisplayMode, saveDisplayMode } from "@/features/profile/model/storage";

/** 첫 화면을 그리기 전에 저장된 모드를 적용한다 (깜빡임 없음, BR-U4-83). layout의 <head>에 넣는다 */
export const DISPLAY_MODE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(DISPLAY_KEY)})==="easy")document.documentElement.dataset.mode="easy"}catch(e){}`;

function applyMode(mode: DisplayMode) {
  document.documentElement.dataset.mode = mode;
}

export function useDisplayMode(): { mode: DisplayMode; setMode(mode: DisplayMode): void } {
  const [mode, setModeState] = useState<DisplayMode>("normal");

  useEffect(() => {
    // 외부 저장소(localStorage)와 맞추는 효과
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(loadDisplayMode(window.localStorage));
  }, []);

  const setMode = useCallback((next: DisplayMode) => {
    applyMode(next); // 고르는 즉시 화면 전체에 (BR-U4-82)
    saveDisplayMode(window.localStorage, next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}
