// 노출 조건 K5 (BR-U2-59) — 피드(U5)와 알림(U6)이 같은 정의를 쓴다
import type { NoticeStatus } from "../domain/retention.ts";
import type { Verdict } from "./types.ts";

export function isVisible(input: { verdict: Verdict; inDistrict: boolean; status: NoticeStatus }): boolean {
  return input.verdict !== "ineligible" && input.inDistrict && input.status !== "closed";
}
