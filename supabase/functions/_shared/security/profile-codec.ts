// 평문 프로필 ↔ 서버 저장 형식 (BR-U2-73, U2 domain-entities §6)
import type { JsonObject } from "../db/types.ts";
import { type HouseholdProfile, PROFILE_SCHEMA_VERSION } from "../domain/profile.ts";
import { parseProfile } from "../domain/profile-migrate.ts";
import { decryptAmount, encryptAmount, type Keyring } from "./amount-cipher.ts";

/** device_profiles 행 중 프로필 내용 부분 */
export interface ProfileStorageFields {
  schemaVersion: number;
  data: JsonObject;
  encMonthlyIncome: string | null;
  encTotalAsset: string | null;
  encCarValue: string | null;
}

export class ProfileCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileCodecError";
  }
}

const encryptOrNull = (value: number | null, keyring: Keyring) =>
  value === null ? Promise.resolve(null) : encryptAmount(value, keyring);
const decryptOrNull = (text: string | null, keyring: Keyring) =>
  text === null ? Promise.resolve(null) : decryptAmount(text, keyring);

/** 서버가 읽을 수 있는 저장 버전 (옮겨 읽음, BR-U2-C6·D1) */
const READABLE_VERSIONS: readonly number[] = [1, 2, PROFILE_SCHEMA_VERSION];

/**
 * 금액 세 가지는 암호문 컬럼으로, 나머지(배우자 소득 유무 포함)는 data JSON으로.
 * 신혼 가구 배우자 월소득(변경 3)은 암호문을 data.money.encSpouseMonthlyIncome에 둔다 (칸·RPC를 늘리지 않음)
 */
export async function encodeProfile(profile: HouseholdProfile, keyring: Keyring): Promise<ProfileStorageFields> {
  const { money, schemaVersion, ...rest } = profile;
  const [encMonthlyIncome, encTotalAsset, encCarValue, encSpouse] = await Promise.all([
    encryptOrNull(money.monthlyIncome, keyring),
    encryptOrNull(money.totalAsset, keyring),
    encryptOrNull(money.carValue, keyring),
    encryptOrNull(money.spouseMonthlyIncome ?? null, keyring),
  ]);
  const dataMoney = money.spouseMonthlyIncome === undefined ? { spouseEarns: money.spouseEarns } : { spouseEarns: money.spouseEarns, encSpouseMonthlyIncome: encSpouse };
  const data = { ...rest, money: dataMoney } as unknown as JsonObject;
  return { schemaVersion, data, encMonthlyIncome, encTotalAsset, encCarValue };
}

export async function decodeProfile(stored: ProfileStorageFields, keyring: Keyring): Promise<HouseholdProfile> {
  // 버전 1(변경 2 전)·2(변경 3 전)도 읽어 옮긴다 (BR-U2-C6·D1)
  if (!READABLE_VERSIONS.includes(stored.schemaVersion)) {
    throw new ProfileCodecError(`지원하지 않는 프로필 형식 v${stored.schemaVersion}`);
  }
  const [monthlyIncome, totalAsset, carValue] = await Promise.all([
    decryptOrNull(stored.encMonthlyIncome, keyring),
    decryptOrNull(stored.encTotalAsset, keyring),
    decryptOrNull(stored.encCarValue, keyring),
  ]);
  const data = stored.data as Record<string, unknown>;
  const dataMoney = (data.money ?? {}) as { spouseEarns?: unknown; encSpouseMonthlyIncome?: unknown };
  const money: Record<string, unknown> = { monthlyIncome, totalAsset, carValue, spouseEarns: dataMoney.spouseEarns ?? null };
  if ("encSpouseMonthlyIncome" in dataMoney) {
    const enc = dataMoney.encSpouseMonthlyIncome;
    money.spouseMonthlyIncome = typeof enc === "string" ? await decryptAmount(enc, keyring) : null;
  }
  const candidate = { ...data, schemaVersion: stored.schemaVersion, money };
  const checked = parseProfile(candidate);
  if (!checked.ok) throw new ProfileCodecError(`저장된 프로필 형식 오류: ${checked.errors.join(", ")}`);
  return checked.value;
}
