"use client";

// 설정 (C29, US-09·18·19·20, business-rules §5·§7)
import { toKstDate } from "@shared/domain/dates.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayMode } from "@/features/display-mode/display-mode";
import { HOURS, hourLabel } from "@/features/profile/model/hour";
import { GROUP_LABELS, GROUP_ORDER } from "@/features/profile/model/steps";
import { groupSummary } from "@/features/profile/model/summary";
import type { FlushResult } from "@/features/profile/model/sync";
import { useProfile } from "@/features/profile/ProfileProvider";
import { ConfirmDialog, secondaryButton } from "@/features/profile/ui/controls";
import { getPushPort, type PushSubscribeResult } from "@/features/profile/ui/push-port";
import { DeniedHelp, InstallGuideButton, InstallSection, TestPushButton } from "@/features/pwa/ui/PwaPanels";

const SAVED_TEXT: Partial<Record<FlushResult, string>> = {
  synced: "저장했어요.",
  nothing: "저장했어요.",
  offline: "이 휴대폰에는 저장했어요. 인터넷 연결을 확인해 주세요. 다음에 앱을 열 때 다시 보낼게요.",
  rejected: "이 휴대폰에는 저장했지만 서버에 보내지 못했어요. 한 번 더 저장해 주세요.",
};

export function SettingsView({ saved }: { saved?: string }) {
  const profile = useProfile();
  const router = useRouter();
  const today = useMemo(() => toKstDate(new Date()), []);

  useEffect(() => {
    if (profile.loaded && !profile.stored) router.replace("/"); // 프로필이 없으면 처음 실행 안내로
  }, [profile.loaded, profile.stored, router]);

  if (!profile.loaded || !profile.stored) {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        준비하고 있어요…
      </p>
    );
  }
  const p = profile.stored.profile;
  const savedText = saved ? SAVED_TEXT[saved as FlushResult] : undefined;

  return (
    <div className="flex flex-col gap-8 pb-8">
      <h1 className="text-heading font-bold">설정</h1>
      {savedText && (
        <p role="status" className="rounded-xl bg-primary-soft p-4 text-body font-bold">
          {savedText}
        </p>
      )}
      <SyncBanner />

      <section aria-labelledby="my-info" className="flex flex-col gap-3">
        <h2 id="my-info" className="text-title font-bold">
          내 정보
        </h2>
        <ul className="flex flex-col gap-3">
          {GROUP_ORDER.map((g) => (
            <li key={g} className="flex items-center gap-3 rounded-xl bg-surface p-4">
              <div className="min-w-0 flex-1">
                <p className="text-caption text-muted">{GROUP_LABELS[g]}</p>
                <p className="text-body font-bold break-words">{groupSummary(p, g, today)}</p>
              </div>
              <Link
                href={`/profile/edit/${g}`}
                aria-label={`${GROUP_LABELS[g]} 고치기`}
                className="flex min-h-touch shrink-0 items-center rounded-xl border-2 border-line px-4 text-body font-bold"
              >
                고치기
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/profile/setup?redo=1" className={`${secondaryButton} flex items-center justify-center`}>
          처음부터 다시 입력하기
        </Link>
      </section>

      <NotifySettings />
      <InstallSection />
      <DisplayModeSelector />
      <DeleteAllSection />
    </div>
  );
}

/** 서버에 아직 못 보낸 내 정보·알림 설정 안내 (BR-U4-64·66) */
function SyncBanner() {
  const { stored, notifyStored, flushNow } = useProfile();
  const [busy, setBusy] = useState(false);
  const states = [stored?.sync.state, notifyStored?.sync.state];
  const text = states.includes("failed")
    ? "내 정보를 서버에 저장하지 못했어요. 한 번 더 저장해 주세요."
    : states.includes("pending")
      ? "내 정보를 아직 서버에 보내지 못했어요. 인터넷이 연결되면 다시 보낼게요."
      : null;
  if (!text) return null;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-line bg-surface p-4">
      <p className="text-body">⚠ {text}</p>
      {!states.includes("failed") && (
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await flushNow();
            setBusy(false);
          }}
        >
          {busy ? "보내는 중이에요…" : "지금 다시 보내기"}
        </button>
      )}
    </div>
  );
}

const PUSH_TEXT: Record<PushSubscribeResult, string> = {
  subscribed: "알림이 켜졌어요.",
  denied: "",
  unsupported: "이 휴대폰에서는 알림을 켤 수 없어요.",
  needs_install: "알림을 받으려면 먼저 홈 화면에 추가해 주세요.",
  error: "알림을 켜지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** 알림 켜기/끄기·시각 — 바꾸는 즉시 저장 (US-09, BR-U4-74~76, U6 BR-U6-63) */
function NotifySettings() {
  const { notify, saveNotify } = useProfile();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pushResult, setPushResult] = useState<PushSubscribeResult | null>(null);

  const change = async (next: { hour: number; enabled: boolean }) => {
    const result = await saveNotify(next);
    setToast(result === "offline" ? "바꿨어요. 인터넷이 연결되면 서버에도 보낼게요." : "바꿨어요.");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2000);
    // 켰는데 이 기기 구독이 없으면 알림 허용으로 이어 준다 (U6 연결 시)
    const port = getPushPort();
    if (next.enabled && port && port.supported() && !(await port.isSubscribed())) {
      setPushResult(await port.subscribe().catch(() => "error" as const));
    }
  };

  return (
    <section aria-labelledby="notify" className="flex flex-col gap-3">
      <h2 id="notify" className="text-title font-bold">
        알림
      </h2>
      <button
        type="button"
        role="switch"
        aria-checked={notify.enabled}
        onClick={() => void change({ ...notify, enabled: !notify.enabled })}
        className="flex min-h-touch items-center justify-between rounded-xl bg-surface px-4 py-3 text-body font-bold"
      >
        <span>새 공고 알림 받기</span>
        <span
          aria-hidden
          className={["rounded-full px-4 py-1 text-body", notify.enabled ? "bg-primary text-surface" : "border-2 border-line text-muted"].join(" ")}
        >
          {notify.enabled ? "켜짐" : "꺼짐"}
        </span>
      </button>
      <label className="flex flex-col gap-2 rounded-xl bg-surface p-4">
        <span className="text-body font-bold">알림 받을 시각</span>
        <select
          value={notify.hour}
          disabled={!notify.enabled}
          onChange={(e) => void change({ ...notify, hour: Number(e.target.value) })}
          className="min-h-touch rounded-xl border-2 border-line bg-surface px-4 text-body disabled:opacity-50"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" className="min-h-touch text-body font-bold text-primary">
        {toast ?? (pushResult ? PUSH_TEXT[pushResult] : "")}
      </p>
      {pushResult === "denied" && <DeniedHelp />}
      {pushResult === "needs_install" && <InstallGuideButton />}
      {notify.enabled && <TestPushButton />}
    </section>
  );
}

/** 일반 / 쉬운 모드 (US-19) */
function DisplayModeSelector() {
  const { mode, setMode } = useDisplayMode();
  return (
    <section aria-labelledby="display" className="flex flex-col gap-3">
      <h2 id="display" className="text-title font-bold">
        화면
      </h2>
      <div role="radiogroup" aria-label="화면 모드" className="grid grid-cols-2 gap-2">
        {(
          [
            ["normal", "일반"],
            ["easy", "쉬운 모드"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={[
              "min-h-touch rounded-xl border-2 px-4 text-body",
              mode === value ? "border-primary bg-primary-soft font-bold" : "border-line bg-surface",
            ].join(" ")}
          >
            {mode === value ? "✓ " : ""}
            {label}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted">쉬운 모드는 글씨와 버튼을 더 크게 보여 드려요.</p>
    </section>
  );
}

/** 내 정보 모두 지우기 — 서버 먼저 (US-20, BR-U4-90~96) */
function DeleteAllSection() {
  const { deleteAll } = useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="danger" className="mt-8 flex flex-col gap-3 border-t-2 border-line pt-8">
      <h2 id="danger" className="text-title font-bold">
        내 정보 지우기
      </h2>
      {error && (
        <p role="alert" className="text-body font-bold text-danger">
          ⚠ {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="min-h-touch rounded-xl border-2 border-danger bg-surface px-4 text-body font-bold text-danger"
      >
        {busy ? "지우는 중이에요…" : "내 정보 모두 지우기"}
      </button>
      {open && (
        <ConfirmDialog
          title="내 정보를 모두 지울까요?"
          message={
            <p>
              입력한 정보, 관심 공고, 알림 설정이 모두 지워집니다.
              <br />이 휴대폰의 정보만 지워지고, 다른 가족 휴대폰의 정보는 그대로예요.
            </p>
          }
          confirmLabel="모두 지우기"
          cancelLabel="취소"
          danger
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            setOpen(false);
            setBusy(true);
            setError(null);
            const outcome = await deleteAll();
            setBusy(false);
            if (outcome === "deleted") router.replace("/");
            else setError("인터넷 연결 후 다시 눌러 주세요."); // BR-U4-93
          }}
        />
      )}
    </section>
  );
}

