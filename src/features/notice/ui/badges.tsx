// 공용 배지 — D-day, NEW, 판정 (BR-U5-21·30~38). 색만으로 구분하지 않고 글자를 항상 쓴다
import type { IsoDate } from "@shared/domain/dates.ts";
import type { Verdict } from "@shared/eligibility/types.ts";
import { ddayLabel } from "../model/display";

const pill = "inline-flex items-center rounded-lg px-2 py-0.5 text-caption font-bold";

export function DdayBadge({ applyStart, applyEnd, today }: { applyStart: IsoDate | null; applyEnd: IsoDate | null; today: IsoDate }) {
  const { text, urgent } = ddayLabel(applyStart, applyEnd, today);
  return <span className={`${pill} ${urgent ? "bg-danger-soft text-danger" : "bg-fill text-muted"}`}>{text}</span>;
}

export function NewBadge() {
  return (
    <span className={`${pill} bg-primary text-surface`}>
      NEW<span className="sr-only"> 새 공고</span>
    </span>
  );
}

const VERDICT_BADGE: Readonly<Record<Verdict, { text: string; className: string }>> = {
  eligible: { text: "자격 충족", className: "bg-primary-soft text-primary" },
  unknown: { text: "확인 필요", className: "bg-fill text-ink" },
  ineligible: { text: "신청 어려움", className: "bg-danger-soft text-danger" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const b = VERDICT_BADGE[verdict];
  return <span className={`${pill} ${b.className}`}>{b.text}</span>;
}
