"use client";

// 홈 화면 설치 안내 대화 상자 (US-01, BR-U6-73·74, Q7=A 그림 3장)
// 그림만으로 설명하지 않는다 — 단계마다 글로도 쓴다 (frontend-components §8)
import { useEffect, useId, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/features/profile/ui/controls";
import { usePwa } from "../PwaProvider";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** ① 화면 아래 가운데 공유 버튼 (네모에 위쪽 화살표) */
function ShareStep() {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label="휴대폰 화면 아래쪽 가운데의 공유 버튼" className="h-28 w-full text-ink">
      <rect x="10" y="80" width="180" height="34" rx="6" className="fill-canvas" />
      {[40, 70, 130, 160].map((x) => (
        <circle key={x} cx={x} cy="97" r="4" className="fill-muted" />
      ))}
      <circle cx="100" cy="97" r="22" className="fill-primary-soft stroke-primary" strokeWidth="3" />
      <path d="M92 95v10h16V95" {...stroke} />
      <path d="M100 86v13M95 90l5-5 5 5" {...stroke} />
      <path d="M100 66V40" {...stroke} className="text-primary" stroke="currentColor" />
      <path d="M92 48l8-10 8 10" {...stroke} className="text-primary" stroke="currentColor" />
    </svg>
  );
}

/** ② 메뉴의 "홈 화면에 추가" */
function AddStep() {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label="메뉴에서 홈 화면에 추가 항목" className="h-28 w-full text-ink">
      <rect x="20" y="6" width="160" height="108" rx="10" className="fill-canvas" />
      <rect x="30" y="16" width="140" height="22" rx="4" className="fill-surface" />
      <rect x="30" y="49" width="140" height="26" rx="4" className="fill-primary-soft stroke-primary" strokeWidth="3" />
      <rect x="146" y="54" width="16" height="16" rx="3" {...stroke} />
      <path d="M154 58v8M150 62h8" {...stroke} />
      <text x="40" y="67" fontSize="13" fontWeight="700" className="fill-ink">
        홈 화면에 추가
      </text>
      <rect x="30" y="84" width="140" height="22" rx="4" className="fill-surface" />
    </svg>
  );
}

/** ③ 오른쪽 위 "추가" */
function ConfirmStep() {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label="오른쪽 위의 추가 버튼" className="h-28 w-full text-ink">
      <rect x="10" y="6" width="180" height="108" rx="10" className="fill-canvas" />
      <text x="22" y="32" fontSize="13" className="fill-muted">
        취소
      </text>
      <rect x="136" y="14" width="46" height="28" rx="6" className="fill-primary-soft stroke-primary" strokeWidth="3" />
      <text x="146" y="33" fontSize="14" fontWeight="700" className="fill-primary">
        추가
      </text>
      <rect x="22" y="56" width="40" height="40" rx="10" className="fill-surface stroke-line" strokeWidth="2" />
      <text x="72" y="81" fontSize="13" className="fill-ink">
        청약 알리미
      </text>
    </svg>
  );
}

export function IosInstallSteps() {
  const steps = [
    { art: <ShareStep />, title: "① 화면 아래 가운데의 공유 버튼을 눌러요", help: "네모 위로 화살표가 나온 모양이에요." },
    { art: <AddStep />, title: "② 메뉴를 위로 밀어 ‘홈 화면에 추가’를 눌러요", help: "안 보이면 메뉴를 더 올려 보세요." },
    { art: <ConfirmStep />, title: "③ 오른쪽 위 ‘추가’를 눌러요", help: "홈 화면에 강아지 아이콘이 생겨요. 그 아이콘으로 열어 주세요." },
  ];
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s) => (
        <li key={s.title} className="flex flex-col gap-2 rounded-xl border-2 border-line p-3">
          {s.art}
          <p className="text-body font-bold">{s.title}</p>
          <p className="text-caption text-muted">{s.help}</p>
        </li>
      ))}
    </ol>
  );
}

function AndroidInstall({ onDone }: { onDone: () => void }) {
  const { canPrompt, promptInstall } = usePwa();
  const [note, setNote] = useState<string | null>(null);
  if (canPrompt) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body">아래 버튼을 누르고 휴대폰이 묻는 창에서 ‘설치’를 눌러 주세요.</p>
        <button
          type="button"
          className={primaryButton}
          onClick={async () => {
            const r = await promptInstall();
            if (r === "accepted") onDone();
            else setNote("설치하지 않았어요. 언제든 다시 할 수 있어요.");
          }}
        >
          홈 화면에 설치
        </button>
        {note && (
          <p role="status" className="text-body">
            {note}
          </p>
        )}
      </div>
    );
  }
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-6 text-body">
      <li>브라우저 오른쪽 위의 메뉴(⋮ 또는 ≡)를 눌러요</li>
      <li>‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요</li>
      <li>‘추가’ 또는 ‘설치’를 눌러요</li>
    </ol>
  );
}

export function InstallGuide({ onClose }: { onClose: () => void }) {
  const { platform } = usePwa();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.(); // 연 버튼으로 초점 복귀
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-6">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-title font-bold outline-none">
          홈 화면에 추가하기
        </h2>
        <p className="text-body">홈 화면에 추가하면 알림을 받고, 아이콘을 눌러 바로 열 수 있어요.</p>
        {platform === "ios_other" && (
          <p className="rounded-xl bg-primary-soft p-3 text-body font-bold">먼저 이 주소를 Safari로 열어 주세요. 홈 화면 추가는 Safari에서만 돼요.</p>
        )}
        {platform === "ios_safari" || platform === "ios_other" ? <IosInstallSteps /> : <AndroidInstall onDone={onClose} />}
        <button type="button" className={secondaryButton} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
