"use client";

// 공통 오류 안내. API의 { code, message } 중 message만 보여준다 (BR-U1-20).
export interface ErrorMessageProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

export function ErrorMessage({ message, action }: ErrorMessageProps) {
  return (
    <div role="alert" className="rounded-xl border-2 border-danger bg-surface p-4">
      <p className="text-body text-ink">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 min-h-touch w-full rounded-xl bg-primary px-4 text-body font-bold text-surface"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
