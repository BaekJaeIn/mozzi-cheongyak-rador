"use client";

// 설치·알림 안내 부품 (US-01·03, BR-U6-65~72·80)
import { useEffect, useState } from "react";
import { getApiClient } from "@/features/device/api-client";
import { secondaryButton } from "@/features/profile/ui/controls";
import { deniedHelp, KEEP_USING, loadHintDismissedAt, saveHintDismissed, shouldShowInstallHint } from "../model/install";
import { usePwa } from "../PwaProvider";
import { InstallGuide } from "./InstallGuide";

/** 기기별 알림 다시 켜는 방법 (BR-U6-80) */
export function DeniedHelp() {
  const { platform, installed } = usePwa();
  const help = deniedHelp(platform, installed);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-4">
      <p className="text-body">{help.intro}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-6 text-body">
        {help.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="text-caption text-muted">{KEEP_USING}</p>
    </div>
  );
}

/** [설치 방법 보기] 버튼 + 대화 상자 */
export function InstallGuideButton({ label = "설치 방법 보기", className = secondaryButton }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </>
  );
}

/** 피드 위 안내 띠 — 설치 안 됐을 때만, 닫으면 7일 (BR-U6-72) */
export function InstallHintBanner() {
  const { ready, installed } = usePwa();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // 기기 저장(닫은 시각)을 읽는 효과
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(ready && shouldShowInstallHint(installed, loadHintDismissedAt(window.localStorage), new Date()));
  }, [ready, installed]);
  if (!show) return null;
  return (
    <section aria-labelledby="install-hint" className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-primary-soft p-4">
      <h2 id="install-hint" className="text-body font-bold">
        홈 화면에 추가하면 알림을 받고 더 쉽게 열 수 있어요
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <InstallGuideButton className="min-h-touch rounded-xl bg-primary px-3 text-body font-bold text-surface" />
        <button
          type="button"
          className="min-h-touch rounded-xl border-2 border-line bg-surface px-3 text-body font-bold"
          onClick={() => {
            saveHintDismissed(window.localStorage, new Date());
            setShow(false);
          }}
        >
          닫기
        </button>
      </div>
    </section>
  );
}

/** 설정의 "홈 화면에 설치" 칸 — 항상 (BR-U6-71) */
export function InstallSection() {
  const { ready, installed } = usePwa();
  return (
    <section aria-labelledby="install" className="flex flex-col gap-3">
      <h2 id="install" className="text-title font-bold">
        홈 화면에 설치
      </h2>
      {ready && installed ? (
        <p className="rounded-xl bg-surface p-4 text-body">홈 화면 앱으로 쓰고 계세요.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-4">
          <p className="text-body">홈 화면에 추가하면 알림을 받고, 아이콘을 눌러 바로 열 수 있어요.</p>
          <InstallGuideButton />
        </div>
      )}
    </section>
  );
}

const TEST_RESULT = {
  sent: "시험 알림을 보냈어요. 잠시 뒤 알림이 오는지 확인해 주세요.",
  none: "알림을 보내지 못했어요. 알림을 다시 켜 주세요.",
} as const;

/** 설정의 [시험 알림 보내기] (BR-U6-65~68) */
export function TestPushButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={secondaryButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const r = await getApiClient().request<{ sent: number }>("/api/push/test", { method: "POST" });
          setNote(r.ok ? (r.data.sent > 0 ? TEST_RESULT.sent : TEST_RESULT.none) : r.error.message);
          setBusy(false);
        }}
      >
        {busy ? "보내는 중이에요…" : "시험 알림 보내기"}
      </button>
      <p role="status" className="text-body">
        {note ?? ""}
      </p>
    </div>
  );
}
