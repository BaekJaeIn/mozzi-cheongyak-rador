"use client";

// 알림 단계 (US-03, BR-U4-16). 실제 구독은 U6 PwaProvider가 push-port로 연결한다 (BR-U6-60·61·81).
import { type RefObject, useState } from "react";
import { getPushPort, type PushSubscribeResult } from "./push-port";
import { primaryButton, secondaryButton } from "./controls";
import { DeniedHelp, InstallGuideButton } from "@/features/pwa/ui/PwaPanels";

const RESULT_TEXT: Record<PushSubscribeResult, string> = {
  subscribed: "알림이 켜졌어요. 새 공고가 있으면 하루 1번 알려 드려요.",
  denied: "알림이 꺼져 있어요. 휴대폰 설정 → 알림에서 이 앱을 허용하면 켤 수 있어요. 다른 기능은 그대로 쓰실 수 있어요.",
  unsupported: "이 휴대폰에서는 알림을 켤 수 없어요. 앱을 열어 새 공고를 확인해 주세요.",
  needs_install: "알림을 받으려면 먼저 홈 화면에 추가해 주세요. 추가한 뒤 홈 화면의 아이콘으로 열고 다시 알림을 켜 주세요.",
  error: "알림을 켜지 못했어요. 설정에서 다시 시도해 주세요.",
};

export function NotifyStep({
  titleRef,
  savedMessage,
  onDone,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  savedMessage: string | null;
  onDone: () => void;
}) {
  const port = getPushPort();
  const [result, setResult] = useState<PushSubscribeResult | null>(port && !port.supported() ? "unsupported" : null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-6 pb-8">
      {savedMessage && (
        <p role="status" className="rounded-xl bg-primary-soft p-4 text-body font-bold">
          {savedMessage}
        </p>
      )}
      <h1 ref={titleRef} tabIndex={-1} className="text-heading font-bold outline-none">
        새 공고 알림을 받으시겠어요?
      </h1>
      <p className="text-body">하루 1번, 새 공고가 있을 때만 알려 드려요.</p>
      {result && result !== "denied" && (
        <p role="status" className="rounded-xl bg-surface p-4 text-body">
          {RESULT_TEXT[result]}
        </p>
      )}
      {result === "denied" && <DeniedHelp />}
      {result === "needs_install" && <InstallGuideButton />}
      <div className="flex flex-col gap-3">
        {!result && port && (
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setResult(await port.subscribe().catch(() => "error" as const));
              setBusy(false);
            }}
          >
            {busy ? "알림을 켜는 중이에요…" : "알림 받기"}
          </button>
        )}
        <button type="button" className={result ? primaryButton : secondaryButton} onClick={onDone}>
          {result ? "맞춤 공고 보러 가기" : "나중에"}
        </button>
      </div>
    </div>
  );
}
