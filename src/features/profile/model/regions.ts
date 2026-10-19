// 사는 곳 목록 (BR-U4-25·26). 시도는 줄임 이름으로 저장하고, 서울·경기·인천만 시군구까지 고른다.
// 2026년 행정구역 기준:
// - 인천: 2026-07-01 중구·동구 → 제물포구·영종구, 서구 → 서해구·검단구 (U3 실제 청약홈 응답 "인천광역시 서해구"로 확인)
// - 광주·전남: 전남광주통합특별시 (U3 실제 LH 응답 CNP_CD_NM으로 확인) — 시도 하나로 고른다

import { MAX_REGION_PICKS, normalizeRegionPicks, type RegionPick } from "@shared/domain/profile.ts";
import { CAPITAL_SIDO, CAPITAL_SIGUNGU, type CapitalSido, isCapitalSido } from "@shared/domain/regions.ts";
import type { WizardAnswers } from "./types";

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

// ---------- 다른 지역 고르기 (변경 2, BR-U4-C11~C15) ----------

/** 고르는 시도 순서 (공용 목록 순서) */
export const REGION_SIDO: readonly CapitalSido[] = CAPITAL_SIDO;

/**
 * 한 번 누르기 (BR-U4-C13·C14, P-U4-C6). sigungu null = "○○ 전체".
 * 전체가 켜진 시도의 시군구는 누를 수 없다(그대로). 시도의 시군구를 모두 고르면 전체로 바꾼다.
 * 개수 상한을 넘기는 누르기는 무시한다. 결과는 항상 normalizeRegionPicks 순서
 */
export function toggleRegion(value: readonly RegionPick[], sido: CapitalSido, sigungu: string | null): RegionPick[] {
  const whole = value.some((r) => r.sido === sido && r.sigungu === null);
  const others = value.filter((r) => r.sido !== sido);
  let next: RegionPick[];
  if (sigungu === null) {
    next = whole ? others : [...others, { sido, sigungu: null }];
  } else {
    if (whole || !CAPITAL_SIGUNGU[sido].includes(sigungu)) return normalizeRegionPicks(value);
    const mine = value.filter((r) => r.sido === sido);
    const has = mine.some((r) => r.sigungu === sigungu);
    const picked = has ? mine.filter((r) => r.sigungu !== sigungu) : [...mine, { sido, sigungu }];
    const all = CAPITAL_SIGUNGU[sido].every((name) => picked.some((r) => r.sigungu === name));
    next = [...others, ...(all ? [{ sido, sigungu: null }] : picked)];
  }
  const normalized = normalizeRegionPicks(next);
  return normalized.length > MAX_REGION_PICKS ? normalizeRegionPicks(value) : normalized;
}

/** 사는 시군구 미리 고르기 (BR-U4-C11, Q2=A): 수도권이고 시군구가 목록에 있을 때만 */
export function defaultRegions(sido: string | null | undefined, sigungu: string | null | undefined): RegionPick[] {
  if (!isCapitalSido(sido) || typeof sigungu !== "string" || !CAPITAL_SIGUNGU[sido].includes(sigungu)) return [];
  return [{ sido, sigungu }];
}

export function regionLabel(r: RegionPick): string {
  return r.sigungu === null ? `${r.sido} 전체` : `${r.sido} ${r.sigungu}`;
}

/** 요약 한 줄 (BR-U4-C15): 3곳까지는 모두, 넘으면 "첫 곳 외 N곳" */
export function regionsSummary(picks: readonly RegionPick[]): string {
  if (picks.length === 0) return "없음";
  if (picks.length <= 3) return picks.map(regionLabel).join(", ");
  return `${regionLabel(picks[0]!)} 외 ${picks.length - 1}곳`;
}

/** 시도 버튼의 고른 수 (전체 = "전체") */
export function pickedCount(picks: readonly RegionPick[], sido: CapitalSido): number | "전체" {
  if (picks.some((r) => r.sido === sido && r.sigungu === null)) return "전체";
  return picks.filter((r) => r.sido === sido).length;
}

/**
 * 다른 지역 화면에 들어올 때 사는 시군구를 미리 고른다 (BR-U4-C11).
 * 처음 입력: 답이 없을 때(undefined). 짧은 입력 화면(emptyToo): 비어 있을 때도
 */
export function applyRegionDefault(a: WizardAnswers, emptyToo = false): WizardAnswers {
  const empty = a.regions === undefined || (emptyToo && a.regions.length === 0);
  return empty ? { ...a, regions: defaultRegions(a.sido, a.sigungu) } : a;
}
