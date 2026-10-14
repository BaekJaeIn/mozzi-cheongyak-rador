"use client";

// 앱 시작 시 기기 준비 (frontend-components.md §2). 등록된 기기는 네트워크 없이 바로 표시.
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { getApiClient } from "./api-client";
import { BootError } from "./BootError";

type Status = "checking" | "ready" | "error";

export function DeviceBootstrap({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");

  const prepare = useCallback(async () => {
    setStatus("checking");
    try {
      await getApiClient().ensureDevice();
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "인터넷 연결을 확인해 주세요.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // 외부 저장소(localStorage)와 동기화하는 효과라 마운트 후 실행한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prepare();
  }, [prepare]);

  if (status === "error") return <BootError message={message} onRetry={prepare} />;
  if (status === "checking") {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        준비하고 있어요…
      </p>
    );
  }
  return <>{children}</>;
}
