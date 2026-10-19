"use client";

// 입력 마법사 (C25, business-logic-model §2, frontend-components §4)
// mode: setup(처음 입력, 초안 저장) / redo(처음부터 다시 입력, 지금 값으로 채움) / edit(그룹 고치기)
//       / update(새 항목만 묻는 짧은 입력 화면, 변경 2 BR-U4-C30~C35)
import { type IsoDate, toKstDate } from "@shared/domain/dates.ts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorMessage } from "@/features/app-chrome/ErrorMessage";
import { type AmountField, exceedsMax, formatManwon, needsConfirm } from "../model/amount";
import { fromProfile, hasBlankFields, mergeGroupEdit, mergeUpdate, toProfile } from "../model/convert";
import { applyRegionDefault } from "../model/regions";
import { GROUP_LABELS, GROUP_ORDER, type GroupId, canProceed, initialAnswers, isComplete, markUnknown, nextStep, prevStep, progress, pruneHidden, stepById, type StepId, type StepScope, visibleSteps } from "../model/steps";
import type { UpdateItem } from "../model/updates";
import { clearDraft, loadDraft, LocalSaveError, saveDraft } from "../model/storage";
import { ALL_DISTRICT_IDS } from "../model/districts";
import { groupSummary } from "../model/summary";
import type { FlushResult } from "../model/sync";
import { known, type WizardAnswers } from "../model/types";
import { useProfile } from "../ProfileProvider";
import { ConfirmDialog, linkButton, primaryButton, secondaryButton } from "./controls";
import { getPushPort } from "./push-port";
import { NotifyStep } from "./NotifyStep";
import { StepScreen, stepHint, stepTitle } from "./StepScreen";

export type WizardMode = { kind: "setup" } | { kind: "redo" } | { kind: "edit"; group: GroupId } | { kind: "update" };

/** 저장하면 입력한 것으로 볼 새 항목 (BR-U4-C34·C36) */
function resolvedBy(mode: WizardMode, scope: StepScope): readonly UpdateItem[] {
  if (mode.kind === "update" && typeof scope === "object") return scope.pending;
  if (mode.kind === "redo") return ["savings", "regions"];
  if (mode.kind === "edit") return mode.group === "savings" ? ["savings"] : mode.group === "districts" ? ["regions"] : [];
  return [];
}

const AMOUNT_STEPS: Partial<Record<StepId, AmountField>> = {
  income: "monthlyIncome",
  asset: "totalAsset",
  car: "carValue",
  savingsAmount: "depositManwon",
};

const SAVE_MESSAGES: Record<FlushResult, string | null> = {
  synced: "저장했어요.",
  nothing: "저장했어요.",
  offline: "이 휴대폰에는 저장했어요. 인터넷 연결을 확인해 주세요. 다음에 앱을 열 때 다시 보낼게요.",
  rejected: "이 휴대폰에는 저장했지만 서버에 보내지 못했어요. 설정에서 한 번 더 저장해 주세요.",
};

export function ProfileWizard({ mode }: { mode: WizardMode }) {
  const router = useRouter();
  const profile = useProfile();
  const today: IsoDate = useMemo(() => toKstDate(new Date()), []);
  const group = mode.kind === "edit" ? mode.group : undefined;
  // 짧은 입력 화면 범위는 열 때 한 번 정한다 (저장 전까지 바뀌지 않게)
  const [updateScope, setUpdateScope] = useState<StepScope>(undefined);
  const scope: StepScope = mode.kind === "update" ? updateScope : group;

  const [answers, setAnswers] = useState<WizardAnswers | null>(null);
  const [stepId, setStepId] = useState<StepId>("selfBirth");
  const [returnToReview, setReturnToReview] = useState(false);
  const [confirm, setConfirm] = useState<{ field: AmountField; value: number } | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"input" | "saving" | "notify" | "saved">("input");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 시작 값: setup은 초안(없으면 빈 답), redo·edit은 지금 프로필 값 (BR-U4-02·71·73)
  useEffect(() => {
    if (!profile.loaded || answers !== null) return;
    if (mode.kind === "setup") {
      const draft = loadDraft(window.localStorage);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers(draft?.answers ?? initialAnswers(ALL_DISTRICT_IDS));
      setStepId(draft?.stepId ?? "selfBirth");
      return;
    }
    if (!profile.stored) {
      router.replace("/");
      return;
    }
    const current = fromProfile(profile.stored.profile);
    if (mode.kind === "update") {
      const pending = profile.updates?.pending ?? [];
      if (pending.length === 0) {
        router.replace("/"); // 입력할 새 항목이 없으면 홈으로 (BR-U4-C30)
        return;
      }
      const s = { pending, beforeSavingsHas: profile.stored.profile.savings.has };
      const first = visibleSteps(current, s)[0]!.id;
      setUpdateScope(s);
      setAnswers(first === "regions" ? applyRegionDefault(current, true) : current);
      setStepId(first);
      return;
    }
    setAnswers(current);
    setStepId(visibleSteps(current, group)[0]!.id);
  }, [profile.loaded, profile.stored, profile.updates, answers, mode.kind, group, router]);

  // 화면이 바뀌면 질문(제목)에 초점 — 화면 낭독기가 새 질문을 읽는다
  useEffect(() => {
    titleRef.current?.focus();
  }, [stepId, phase]);

  if (answers === null) {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        준비하고 있어요…
      </p>
    );
  }

  /** 짧은 입력 화면의 마지막 화면이면 [다음] 대신 [저장] (BR-U4-C34) */
  const isLastUpdateStep = mode.kind === "update" && nextStep(answers, stepId, scope) === null;

  const persistDraft = (next: WizardAnswers, step: StepId) => {
    if (mode.kind !== "setup") return; // 초안은 처음 입력에만 (BR-U4-72)
    try {
      saveDraft(window.localStorage, next, step, new Date());
    } catch {
      // 초안 저장 실패는 입력을 막지 않는다
    }
  };

  const set = (patch: Partial<WizardAnswers>) => {
    setAnswers((prev) => pruneHidden({ ...prev!, ...patch }));
    setError(null);
  };

  const go = (target: StepId | null) => {
    if (!target) return;
    persistDraft(answers, target);
    // 다른 지역 화면에 처음 올 때 사는 시군구를 미리 고른다 (BR-U4-C11)
    if (target === "regions") setAnswers((prev) => applyRegionDefault(prev!, mode.kind === "update"));
    setStepId(target);
  };

  const onNext = () => {
    const field = AMOUNT_STEPS[stepId];
    if (field) {
      const value = known(answers[field as keyof WizardAnswers] as number | undefined);
      if (value !== null && exceedsMax(value)) return; // 입력 칸 아래에 이미 안내
      if (value !== null && needsConfirm(field, value) && confirmed[field] !== value) {
        setConfirm({ field, value }); // BR-U4-42
        return;
      }
    }
    if (stepId === "regions" && !canProceed("regions", answers)) {
      setError("3기 신도시나 다른 지역을 한 곳 이상 골라 주세요."); // BR-U4-C16
      return;
    }
    if (isLastUpdateStep) {
      void onSave();
      return;
    }
    go(returnToReview && canProceed(stepId, answers) && nextIsOutsideGroup() ? "review" : nextStep(answers, stepId, scope));
  };

  /** [고치기]로 온 그룹의 마지막 화면이면 확인 화면으로 바로 */
  const nextIsOutsideGroup = () => {
    const next = nextStep(answers, stepId, scope);
    return next !== null && stepById(next).group !== stepById(stepId).group;
  };

  const onUnknown = () => {
    const next = markUnknown(stepId, answers);
    setAnswers(pruneHidden(next));
    const target = nextStep(next, stepId, scope);
    if (target) {
      persistDraft(next, target);
      if (target === "regions") setAnswers(applyRegionDefault(pruneHidden(next), mode.kind === "update"));
      setStepId(target);
    } else if (mode.kind === "update") {
      void onSave(pruneHidden(next)); // 짧은 입력 화면의 마지막 화면에서 [잘 모르겠어요]
    }
  };

  const onBack = () => {
    const prev = prevStep(answers, stepId, scope);
    if (prev) go(prev);
    else if (mode.kind === "setup" || mode.kind === "update") router.replace("/");
    else router.replace("/settings");
  };

  const onRestart = () => {
    clearDraft(window.localStorage);
    setAnswers(initialAnswers(ALL_DISTRICT_IDS));
    setStepId("selfBirth");
  };

  const onSave = async (input: WizardAnswers = answers) => {
    setPhase("saving");
    setError(null);
    try {
      const current = profile.stored ? fromProfile(profile.stored.profile) : null;
      const final =
        mode.kind === "edit" && current
          ? mergeGroupEdit(current, input, mode.group)
          : mode.kind === "update" && current && typeof scope === "object"
            ? mergeUpdate(current, input, scope.pending)
            : input;
      const result = await profile.saveProfile(toProfile(final), resolvedBy(mode, scope));
      setMessage(SAVE_MESSAGES[result]);
      if (mode.kind === "setup" && getPushPort() !== null) {
        setPhase("notify"); // 알림 단계 (US-03, U6 연결 시)
        return;
      }
      if (mode.kind === "update" || (mode.kind !== "edit" && (result === "offline" || result === "rejected"))) {
        setPhase("saved"); // 서버에 못 보냈다는 안내를 보여 준 뒤 이동 (BR-U4-63)
        return;
      }
      router.replace(mode.kind === "edit" ? `/settings?saved=${result}` : mode.kind === "redo" ? `/settings?saved=${result}` : "/");
    } catch (e) {
      setPhase("input");
      setError(e instanceof LocalSaveError ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
    }
  };

  if (phase === "notify") {
    return <NotifyStep titleRef={titleRef} savedMessage={message} onDone={() => router.replace("/")} />;
  }
  if (phase === "saved") {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <h1 ref={titleRef} tabIndex={-1} className="text-heading font-bold leading-snug tracking-tight outline-none">
          내 정보를 저장했어요
        </h1>
        <p role="status" className="rounded-card bg-surface p-5 shadow-card text-body">
          {message}
        </p>
        <button type="button" className={primaryButton} onClick={() => router.replace(mode.kind === "redo" ? "/settings" : "/")}>
          {mode.kind === "redo" ? "설정으로 돌아가기" : "맞춤 공고 보러 가기"}
        </button>
      </div>
    );
  }

  const step = stepById(stepId);
  const { index, total } = progress(answers, stepId, scope);
  const groupLabel = mode.kind === "update" ? "새 항목" : step.group === "review" ? "확인" : GROUP_LABELS[step.group];
  const isReview = stepId === "review";
  const hint = stepHint(stepId);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-body font-bold text-primary" aria-label={`${groupLabel}, ${total}개 중 ${index}번째 화면`}>
          {groupLabel} {index}/{total}
        </p>
        {mode.kind === "setup" && index > 1 && (
          <button type="button" onClick={onRestart} className={linkButton}>
            처음부터 다시
          </button>
        )}
        {mode.kind === "update" && (
          <button type="button" onClick={() => router.replace("/")} className={linkButton}>
            나중에 할게요
          </button>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <h1 ref={titleRef} tabIndex={-1} className="text-heading font-bold leading-snug tracking-tight outline-none">
        {stepTitle(stepId, answers)}
      </h1>
      {hint && <p className="-mt-3 text-body text-muted">{hint}</p>}

      {isReview ? (
        <ReviewScreen answers={answers} today={today} group={group} onEdit={(g) => {
          setReturnToReview(true);
          go(visibleSteps(answers).find((s) => s.group === g)!.id);
        }} />
      ) : (
        <StepScreen step={stepId} answers={answers} today={today} set={set} />
      )}

      {error && <ErrorMessage message={error} />}

      <div className="flex flex-col gap-3">
        {isReview ? (
          <button type="button" className={primaryButton} disabled={!isComplete(answers) || phase === "saving"} onClick={() => void onSave()}>
            {phase === "saving" ? "저장하는 중이에요…" : "저장"}
          </button>
        ) : (
          <button type="button" className={primaryButton} disabled={(!canProceed(stepId, answers) && stepId !== "regions") || phase === "saving"} onClick={onNext}>
            {isLastUpdateStep ? (phase === "saving" ? "저장하는 중이에요…" : "저장") : "다음"}
          </button>
        )}
        {step.allowUnknown && (
          <button type="button" className={secondaryButton} onClick={onUnknown}>
            잘 모르겠어요
          </button>
        )}
        <button type="button" className={secondaryButton} onClick={onBack}>
          {mode.kind === "edit" && prevStep(answers, stepId, scope) === null ? "취소" : "이전"}
        </button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="입력하신 금액이 맞나요?"
          message={
            <p>
              <strong className="text-title">
                {confirm.field === "monthlyIncome" ? "월 " : ""}
                {formatManwon(confirm.value)}
              </strong>
              <br />
              금액은 만원 단위예요.
            </p>
          }
          confirmLabel="맞아요"
          cancelLabel="다시 입력"
          onConfirm={() => {
            setConfirmed({ ...confirmed, [confirm.field]: confirm.value });
            setConfirm(null);
            if (isLastUpdateStep) void onSave();
            else go(nextStep(answers, stepId, scope));
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** 확인 화면: 그룹별 요약 + [고치기] (US-08, BR-U4-54) */
function ReviewScreen({
  answers,
  today,
  group,
  onEdit,
}: {
  answers: WizardAnswers;
  today: IsoDate;
  group?: GroupId;
  onEdit: (g: GroupId) => void;
}) {
  if (!isComplete(answers)) {
    return <p className="text-body text-danger">꼭 넣어야 하는 항목이 비어 있어요. [고치기]로 채워 주세요.</p>;
  }
  const p = toProfile(answers);
  const groups = group ? [group] : GROUP_ORDER;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {groups.map((g) => (
          <li key={g} className="rounded-card bg-surface p-5 shadow-card">
            <p className="text-caption text-muted">{GROUP_LABELS[g]}</p>
            <p className="text-body font-bold">{groupSummary(p, g, today)}</p>
            {!group && (
              <button type="button" className={`${linkButton} mt-1`} onClick={() => onEdit(g)}>
                {GROUP_LABELS[g]} 고치기
              </button>
            )}
          </li>
        ))}
      </ul>
      {hasBlankFields(p) && <p className="text-body text-muted">비워 둔 항목은 &apos;확인 필요&apos;로 표시돼요.</p>}
    </div>
  );
}

