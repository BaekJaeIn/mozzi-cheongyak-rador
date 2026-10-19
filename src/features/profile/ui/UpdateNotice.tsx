"use client";

// 업데이트 안내 (변경 2, US-21, BR-U4-C22~C27, frontend-components §7.2)
// - "새로 바뀐 점" 창: 내 정보가 있고 아직 안 본 안내가 있으면 피드를 열 때 한 번. 띄우는 순간 본 것으로 기록
// - 띠: 새 항목을 입력할 때까지 피드 맨 위에 (닫기 없음)
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useBackClose } from "@/features/app-chrome/BackNavigation";
import { shouldShowDialog, WHATS_NEW } from "../model/updates";
import { useProfile } from "../ProfileProvider";

const UPDATE_PATH = "/profile/update";

export function UpdateNotice() {
  const { stored, updates, markNoticeSeen } = useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || updates === null) return;
    decided.current = true;
    if (shouldShowDialog(updates, stored !== null)) {
      // 기기 기록을 읽은 뒤 한 번만 정한다 (외부 저장소)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      markNoticeSeen(); // 닫는 방법과 상관없이 다시 안 뜸 (BR-U4-C22)
    }
  }, [updates, stored, markNoticeSeen]);

  const pending = updates?.pending ?? [];
  const start = () => {
    setOpen(false);
    router.replace(UPDATE_PATH);
  };

  return (
    <>
      {pending.length > 0 && <UpdateBanner onStart={start} />}
      {open && <WhatsNewDialog hasPending={pending.length > 0} onStart={start} onLater={() => setOpen(false)} />}
    </>
  );
}

/** 피드 위 띠 (BR-U4-C26) */
export function UpdateBanner({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border-2 border-primary bg-primary-soft p-4">
      <p className="flex items-start gap-2 text-body">
        <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-surface">
          !
        </span>
        <span>새 항목을 입력하면 공고를 더 정확히 골라 드려요.</span>
      </p>
      <button type="button" onClick={onStart} className="min-h-touch w-full rounded-2xl bg-primary px-4 text-body font-bold text-surface active:bg-primary-strong">
        입력하기
      </button>
    </div>
  );
}

/** "새로 바뀐 점" 창 (BR-U4-C23~C25). 뒤로 버튼·바깥 누르기 = [나중에] */
export function WhatsNewDialog({ hasPending, onStart, onLater }: { hasPending: boolean; onStart: () => void; onLater: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useBackClose(true, onLater);
  useEffect(() => titleRef.current?.focus(), []);
  const lines = hasPending ? WHATS_NEW.lines : WHATS_NEW.lines.slice(0, -1); // 입력할 것이 없으면 ③ 줄 빼기 (BR-U4-C24)
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onLater}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-card bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-title font-bold outline-none">
          새로 바뀐 점
        </h2>
        <ul className="mt-4 flex flex-col gap-3 text-body">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3">
          {hasPending ? (
            <>
              <button type="button" onClick={onStart} className="min-h-touch rounded-2xl bg-primary px-4 text-body font-bold text-surface active:bg-primary-strong">
                지금 입력하기
              </button>
              <button type="button" onClick={onLater} className="min-h-touch rounded-2xl bg-fill px-4 text-body font-bold active:bg-line">
                나중에
              </button>
            </>
          ) : (
            <button type="button" onClick={onLater} className="min-h-touch rounded-2xl bg-primary px-4 text-body font-bold text-surface active:bg-primary-strong">
              확인
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
