// 사는 곳 목록 (BR-U4-25·26). 시도는 줄임 이름으로 저장하고, 서울·경기·인천만 시군구까지 고른다.
// 2026년 행정구역 기준:
// - 인천: 2026-07-01 중구·동구 → 제물포구·영종구, 서구 → 서해구·검단구 (U3 실제 청약홈 응답 "인천광역시 서해구"로 확인)
// - 광주·전남: 전남광주통합특별시 (U3 실제 LH 응답 CNP_CD_NM으로 확인) — 시도 하나로 고른다

import { CAPITAL_SIGUNGU } from "@shared/domain/regions.ts";

export interface SidoOption {
  /** 저장 값 (U2 normalizeSido와 같은 줄임 이름) */
  value: string;
  label: string;
}

/** 수도권을 앞에 둔다 (3기 신도시 거주 조건이 대부분 수도권 기준) */
export const SIDO_OPTIONS: readonly SidoOption[] = [
  { value: "서울", label: "서울" },
  { value: "경기", label: "경기" },
  { value: "인천", label: "인천" },
  { value: "부산", label: "부산" },
  { value: "대구", label: "대구" },
  { value: "전남광주", label: "광주·전남" },
  { value: "대전", label: "대전" },
  { value: "울산", label: "울산" },
  { value: "세종", label: "세종" },
  { value: "강원", label: "강원" },
  { value: "충북", label: "충북" },
  { value: "충남", label: "충남" },
  { value: "전북", label: "전북" },
  { value: "경북", label: "경북" },
  { value: "경남", label: "경남" },
  { value: "제주", label: "제주" },
];

/** 수도권 시군구 — 판정·수집과 같은 목록 (공용 domain/regions.ts) */
export const SIGUNGU_BY_SIDO: Readonly<Record<string, readonly string[]>> = CAPITAL_SIGUNGU;

/** 시군구까지 고르는 시도인지 */
export function needsSigungu(sido: string | null | undefined): boolean {
  return !!sido && sido in SIGUNGU_BY_SIDO;
}

export function isKnownSido(value: unknown): value is string {
  return typeof value === "string" && SIDO_OPTIONS.some((o) => o.value === value);
}

/** 고른 시도에 맞는 시군구인지 (수도권 밖은 null만) */
export function isValidSigungu(sido: string, sigungu: string | null): boolean {
  const list = SIGUNGU_BY_SIDO[sido];
  return list ? sigungu !== null && list.includes(sigungu) : sigungu === null;
}

export function sidoLabel(value: string): string {
  return SIDO_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
