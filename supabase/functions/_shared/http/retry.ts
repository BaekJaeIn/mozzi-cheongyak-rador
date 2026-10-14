// API 재시도 판단 (P-R1: 1번만, 1초 뒤)

export const MAX_RETRIES = 1;
export const RETRY_DELAY_MS = 1000;

export type RequestOutcome = { kind: "network" } | { kind: "status"; status: number };

/** 네트워크 오류, 408, 5xx면 다시 시도한다. 그 밖의 응답(2xx~4xx)은 다시 시도하지 않는다. */
export function shouldRetry(outcome: RequestOutcome): boolean {
  if (outcome.kind === "network") return true;
  const { status } = outcome;
  return status === 408 || (status >= 500 && status <= 599);
}
