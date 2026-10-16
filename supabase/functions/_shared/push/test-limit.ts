// 시험 알림 한도 — 최근 1시간에 3번 (BR-U6-66). DB 함수 try_test_push와 같은 규칙
export const TEST_LIMIT = 3;
export const TEST_WINDOW_MS = 60 * 60 * 1000;

/** 지금 보내도 되나: (now − 1시간, now] 안에 보낸 횟수가 3번 미만 */
export function canSendTest(sentAt: readonly Date[], now: Date): boolean {
  const from = now.getTime() - TEST_WINDOW_MS;
  return sentAt.filter((t) => t.getTime() > from && t.getTime() <= now.getTime()).length < TEST_LIMIT;
}
