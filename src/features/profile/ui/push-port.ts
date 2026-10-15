// 알림 구독 연결 자리 (US-03, BR-U4-16·76). U6 PwaShell이 setPushPort로 등록한다.
// 등록되지 않았으면(U6 전) 마법사의 알림 단계를 건너뛴다.
export type PushSubscribeResult = "subscribed" | "denied" | "unsupported" | "error";

export interface PushPort {
  /** 이 기기 브라우저가 알림을 지원하는지 */
  supported(): boolean;
  /** 이미 구독돼 있는지 */
  isSubscribed(): Promise<boolean>;
  /** 권한 요청 → 구독 → 서버 저장 */
  subscribe(): Promise<PushSubscribeResult>;
}

let port: PushPort | null = null;

export function setPushPort(next: PushPort | null): void {
  port = next;
}

export function getPushPort(): PushPort | null {
  return port;
}
