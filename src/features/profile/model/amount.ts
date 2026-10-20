// 금액 (만원 단위) — 한글 표기, 단위 실수 확인, 상한 (BR-U4-40~46, U2 BR-U2-72)
import { MAX_AMOUNT_MANWON } from "@shared/domain/profile.ts";

export type AmountField = "monthlyIncome" | "totalAsset" | "carValue" | "depositManwon" | "spouseIncome" | "spouseDepositManwon";

/** 이 값을 넘으면 [다음] 때 "입력하신 금액이 … 맞나요?"를 묻는다 (BR-U4-43, 만원) */
export const CONFIRM_ABOVE: Readonly<Record<AmountField, number>> = {
  monthlyIncome: 2_000,
  totalAsset: 300_000,
  carValue: 10_000,
  depositManwon: 10_000,
  // 변경 3: 신혼 가구 배우자 소득·배우자 통장 (같은 기준)
  spouseIncome: 2_000,
  spouseDepositManwon: 10_000,
};

export { MAX_AMOUNT_MANWON };

const group = (n: number) => n.toLocaleString("ko-KR");

/** 350 → "350만원", 12000 → "1억 2,000만원", 100000 → "10억원", 0 → "0원" (BR-U4-41) */
export function formatManwon(manwon: number): string {
  if (manwon === 0) return "0원";
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${group(eok)}억`);
  if (rest > 0) parts.push(`${group(rest)}만`);
  return `${parts.join(" ")}원`;
}

/** formatManwon의 역 (테스트·검증용). 형식이 아니면 null */
export function parseKoreanManwon(text: string): number | null {
  if (text === "0원") return 0;
  const m = /^(?:([\d,]+)억)?\s?(?:([\d,]+)만)?원$/.exec(text);
  if (!m || (!m[1] && !m[2])) return null;
  const num = (s: string | undefined) => (s ? Number(s.replaceAll(",", "")) : 0);
  return num(m[1]) * 10_000 + num(m[2]);
}

export function needsConfirm(field: AmountField, manwon: number): boolean {
  return manwon > CONFIRM_ABOVE[field];
}

export function exceedsMax(manwon: number): boolean {
  return manwon > MAX_AMOUNT_MANWON;
}

/** 키패드 입력 문자열 → 만원 정수 (숫자 외 문자는 버림, 앞의 0 제거). 비면 null */
export function parseAmountInput(text: string): number | null {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (digits === "") return null;
  // 상한을 크게 넘는 자릿수는 그대로 두고 exceedsMax로 막는다 (정밀도 보호를 위해 15자리까지만)
  return Number(digits.slice(0, 15));
}
