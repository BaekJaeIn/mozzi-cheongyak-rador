// 마법사 답 (domain-entities §2). "아직 안 답함"(키 없음)과 "잘 모르겠어요"(UNKNOWN)를 구분한다.
import type { IsoDate } from "@shared/domain/dates.ts";
import type { AreaBand, RegionPick, SavingsKind, TenurePref, WelfareStatus } from "@shared/domain/profile.ts";
import type { HomelessBand, MonthsBand, YearBand } from "./bands";

export const UNKNOWN = "unknown" as const;
export type Unknown = typeof UNKNOWN;
export type Maybe<T> = T | Unknown;

export type HouseholdType = "couple" | "single" | "other";
export type HeadAnswer = "self" | "spouse" | "other";
/** 통장 명의 답 (변경 2, domain-entities §7.2). 혼자 사는 가구는 "self"(있음) | "none"(없음) */
export type SavingsOwnerAnswer = "self" | "spouse" | "both" | "none";

export interface WizardAnswers {
  selfBirth?: IsoDate;
  householdType?: HouseholdType;
  /** other일 때 2~8 */
  householdSize?: number;
  /** other일 때 */
  hasSpouse?: boolean;
  spouseBirth?: Maybe<IsoDate>;
  head?: Maybe<HeadAnswer>;
  sido?: string;
  /** 서울·경기·인천만 값, 그 밖은 null */
  sigungu?: string | null;
  residenceYearsBand?: Maybe<YearBand>;
  homeOwned?: Maybe<boolean>;
  /** 5 = 5채 이상 */
  homeCount?: Maybe<number>;
  homelessYearsBand?: Maybe<HomelessBand>;
  savingsOwner?: Maybe<SavingsOwnerAnswer>;
  savingsKind?: Maybe<SavingsKind>;
  savingsMonthsBand?: Maybe<MonthsBand>;
  paymentCount?: Maybe<number>;
  depositManwon?: Maybe<number>;
  monthlyIncome?: Maybe<number>;
  spouseEarns?: Maybe<boolean>;
  totalAsset?: Maybe<number>;
  carValue?: Maybe<number>;
  welfare?: Maybe<WelfareStatus>;
  districtIds?: string[];
  /** 다른 지역 (변경 2). 시도 전체 = sigungu null */
  regions?: RegionPick[];
  areaBands?: AreaBand[];
  tenure?: TenurePref;
  lowFloor?: boolean;
}

export type AnswerKey = keyof WizardAnswers;

/** UNKNOWN·없음 → null */
export function known<T>(value: Maybe<T> | undefined): T | null {
  return value === undefined || value === UNKNOWN ? null : (value as T);
}
