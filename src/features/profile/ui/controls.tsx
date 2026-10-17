"use client";

// 마법사 입력 부품 (frontend-components §4·§6)
// - 보기·버튼 높이 ≥ --spacing-touch, 글씨는 크기 토큰만 → 쉬운 모드에서 함께 커진다
// - 선택 표시는 색 + 체크 아이콘 + 굵기 (색만으로 구분하지 않음)
// - 보기는 큰 목록 버튼, 생년월일만 드롭다운(휴대폰 기본 선택 휠)
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ageAt } from "@shared/domain/profile.ts";
import { exceedsMax, formatManwon, parseAmountInput } from "../model/amount";
import { daysInMonth, toBirthDate } from "../model/steps";

const optionClass = (selected: boolean) =>
  [
    "flex min-h-touch w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-body",
    selected ? "border-primary bg-primary-soft font-bold text-ink" : "border-transparent bg-surface text-ink shadow-card",
  ].join(" ");

function Check({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={["flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-caption", on ? "border-primary bg-primary text-surface" : "border-field"].join(" ")}>
      {on ? "✓" : ""}
    </span>
  );
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
  help?: string;
}

/** 하나 고르기 (radiogroup) */
export function ChoiceList<T>({
  label,
  options,
  value,
  onChange,
  columns = 1,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3 | 4;
}) {
  const grid = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[columns];
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${grid}`}>
      {options.map((o) => {
        const selected = Object.is(o.value, value);
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={selected} onClick={() => onChange(o.value)} className={optionClass(selected)}>
            {columns === 1 && <Check on={selected} />}
            <span className="flex flex-col">
              <span>{o.label}</span>
              {o.help && <span className="text-caption font-normal text-muted">{o.help}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 여러 개 고르기 (체크 카드) */
export function MultiChoice<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-2">
      {options.map((o) => {
        const selected = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => onChange(selected ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={optionClass(selected)}
          >
            <Check on={selected} />
            <span className="flex flex-col">
              <span>{o.label}</span>
              {o.help && <span className="text-caption font-normal text-muted">{o.help}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 생년월일: 연·월·일 드롭다운 (BR-U4-20~23). 셋 다 골라야 값이 정해진다 */
export function BirthDatePicker({
  value,
  years,
  today,
  onChange,
}: {
  value: string | undefined;
  years: { from: number; to: number; initial: number };
  today: string;
  onChange: (value: string | undefined) => void;
}) {
  const initial = value ? value.split("-").map(Number) : [];
  const [parts, setParts] = useState<{ y?: number; m?: number; d?: number }>({ y: initial[0], m: initial[1], d: initial[2] });
  const yearList = Array.from({ length: years.to - years.from + 1 }, (_, i) => years.to - i);
  const { y, m, d } = parts;

  const update = (next: { y?: number; m?: number; d?: number }) => {
    const merged = { ...parts, ...next };
    // 연·월을 바꿔 날이 없어지면 그 달 마지막 날로 (BR-U4-21)
    if (merged.y && merged.m && merged.d) merged.d = Math.min(merged.d, daysInMonth(merged.y, merged.m));
    setParts(merged);
    if (merged.y && merged.m && merged.d) {
      const date = toBirthDate(merged.y, merged.m, merged.d);
      onChange(date > today ? undefined : date); // 미래 날짜는 고를 수 없음 (BR-U4-23)
    } else {
      onChange(undefined);
    }
  };
  const future = !!(y && m && d) && toBirthDate(y, m, d) > today;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: daysInMonth(y ?? years.initial, m ?? 1) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[3fr_2fr_2fr] gap-2">
        <BirthSelect label="태어난 해" placeholder="연도" value={y} options={yearList} unit="년" onChange={(v) => update({ y: v })} />
        <BirthSelect label="태어난 달" placeholder="월" value={m} options={months} unit="월" onChange={(v) => update({ m: v })} />
        <BirthSelect label="태어난 날" placeholder="일" value={d} options={days} unit="일" onChange={(v) => update({ d: v })} />
      </div>
      <p aria-live="polite" className="rounded-2xl bg-primary-soft p-4 text-center text-title font-bold">
        {value ? `${y}년 ${m}월 ${d}일 · 만 ${ageAt(value, today)}세` : future ? "오늘보다 뒤의 날짜는 고를 수 없어요" : "연·월·일을 모두 골라 주세요"}
      </p>
    </div>
  );
}

/** 생년월일 한 칸: 기본 select → 휴대폰에서는 OS 선택 휠이 열린다 */
function BirthSelect({
  label,
  placeholder,
  value,
  options,
  unit,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | undefined;
  options: readonly number[];
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          "min-h-touch w-full rounded-2xl border bg-surface px-3 text-body text-ink",
          value ? "border-2 border-primary font-bold" : "border-field",
        ].join(" ")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {unit}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 금액 (만원) 키패드 입력 + 한글 금액 (BR-U4-40·41·44) */
export function AmountInput({
  label,
  help,
  value,
  monthly,
  onChange,
}: {
  label: string;
  help: string;
  value: number | undefined;
  monthly?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-body text-muted">
        {help}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          aria-label={label}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(parseAmountInput(e.target.value) ?? undefined)}
          className="min-h-touch w-full rounded-2xl border border-field bg-surface px-4 text-right text-title focus:border-2 focus:border-primary"
        />
        <span className="shrink-0 text-title">만원</span>
      </div>
      <p aria-live="polite" className="rounded-2xl bg-primary-soft p-4 text-center text-heading font-bold">
        {value === undefined ? "금액을 넣어 주세요" : `${monthly ? "월 " : ""}${formatManwon(value)}`}
      </p>
      {value !== undefined && exceedsMax(value) && (
        <p role="alert" className="text-body font-bold text-danger">
          ⚠ 금액이 너무 커요. 만원 단위로 넣었는지 확인해 주세요.
        </p>
      )}
      <p className="text-caption text-muted">🔒 이 정보는 자격 확인에만 쓰이고, 암호화해서 저장해요.</p>
    </div>
  );
}

/** 횟수 같은 정수 입력 (0~max) */
export function CountInput({
  label,
  unit,
  max,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  max: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const n = parseAmountInput(e.target.value);
          onChange(n === null ? undefined : Math.min(n, max));
        }}
        className="min-h-touch w-full rounded-2xl border border-field bg-surface px-4 text-right text-title focus:border-2 focus:border-primary"
      />
      <span className="shrink-0 text-title">{unit}</span>
    </div>
  );
}

/** 확인 창 (단위 실수 확인, 모두 지우기) — 처음 초점은 안전한 쪽 버튼 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-xl rounded-card bg-surface p-6 shadow-card">
        <h2 id={titleId} className="text-title font-bold">
          {title}
        </h2>
        <div className="mt-3 text-body">{message}</div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={["min-h-touch rounded-2xl px-4 text-body font-bold text-surface", danger ? "bg-danger" : "bg-primary"].join(" ")}
          >
            {confirmLabel}
          </button>
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-touch rounded-2xl bg-fill px-4 text-body font-bold active:bg-line">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const primaryButton = "min-h-touch w-full rounded-2xl bg-primary px-4 text-body font-bold text-surface active:bg-primary-strong disabled:opacity-40";
export const secondaryButton = "min-h-touch w-full rounded-2xl border border-line bg-surface px-4 text-body font-bold text-ink active:bg-fill disabled:opacity-50";
/** 흰 카드 — 테두리 대신 옅은 그림자 */
export const card = "rounded-card bg-surface shadow-card";
export const linkButton = "min-h-touch px-2 text-body text-primary underline";
