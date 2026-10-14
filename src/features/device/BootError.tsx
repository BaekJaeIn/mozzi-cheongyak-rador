"use client";

import { ErrorMessage } from "@/features/app-chrome/ErrorMessage";

export function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-6">
      <ErrorMessage message={message || "인터넷 연결을 확인해 주세요."} action={{ label: "다시 시도", onClick: onRetry }} />
    </div>
  );
}
