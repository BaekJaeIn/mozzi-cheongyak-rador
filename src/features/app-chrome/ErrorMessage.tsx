"use client";

// 공통 오류 안내. API의 { code, message } 중 message만 보여준다 (BR-U1-20).
export interface ErrorMessageProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

export function ErrorMessage({ message, action }: ErrorMessageProps) {
  return (
    <div role="alert" className="rounded-card bg-danger-soft p-5">
      <p className="text-body text-ink">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 min-h-touch w-full rounded-2xl bg-primary px-4 text-body font-bold text-surface active:bg-primary-strong"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
