// 업데이트 안내 (변경 2, domain-entities §7.4, BR-U4-C20~C27·C36). 기기에만 기록한다 (mz.updates).
// 순수 로직: 읽기·쓰기는 storage.ts
import type { HouseholdProfile } from "@shared/domain/profile.ts";

export type UpdateItem = "savings" | "regions";
export const UPDATE_ITEMS: readonly UpdateItem[] = ["savings", "regions"];

export interface StoredUpdates {
  version: 1;
  /** 이 기기가 본 마지막 안내 번호 (0 = 아직 안 봄) */
  noticeSeen: number;
  /** 아직 입력하지 않은 새 항목 — 비면 띠가 사라진다 */
  pending: UpdateItem[];
}

export interface WhatsNew {
  notice: number;
  lines: readonly string[];
  items: readonly UpdateItem[];
}

/** 변경 2 = 안내 1 (BR-U4-C20·C23). 다음 변경에서 번호를 올리고 문구를 바꾼다 */
export const WHATS_NEW: WhatsNew = {
  notice: 1,
  lines: [
    "부부 중 한 분만 청약통장이 있어도 같은 공고를 보여 드려요.",
    "3기 신도시 말고도 서울·경기·인천에서 원하는 지역을 고를 수 있어요.",
    "두 가지만 확인해 주시면 공고를 더 정확히 골라 드려요.",
  ],
  items: ["savings", "regions"],
};

/**
 * 버전 1에서 옮긴 프로필의 새 항목 (BR-U4-C21). 옮긴 결과로 판단한다:
 * 통장이 "있음"이 아니었으면(옮기면 모름) 다시 묻고, 배우자가 있으면 명의 "나"가 맞는지 확인한다.
 */
export function pendingFromV1(migrated: HouseholdProfile): UpdateItem[] {
  const savings = migrated.savings.has !== true || migrated.spouse !== null;
  return savings ? ["savings", "regions"] : ["regions"];
}

/**
 * 처음 기록 (domain-entities §7.4). storedSchemaVersion = 기기에 저장된 원래 JSON의 schemaVersion.
 * 프로필 없음·버전 2는 안내를 본 것으로, 버전 1은 아직 안 본 것으로.
 */
export function initialUpdates(stored: { profile: HouseholdProfile; storedSchemaVersion: number } | null, notice = WHATS_NEW.notice): StoredUpdates {
  if (stored && stored.storedSchemaVersion < 2) return { version: 1, noticeSeen: 0, pending: pendingFromV1(stored.profile) };
  return { version: 1, noticeSeen: notice, pending: [] };
}

/** 입력한 항목을 뺀다 — 줄기만 한다 (P-U4-C4) */
export function resolveItems(updates: StoredUpdates, items: readonly UpdateItem[]): StoredUpdates {
  return { ...updates, pending: updates.pending.filter((i) => !items.includes(i)) };
}

/** 창을 띄운 순간 기록 (BR-U4-C22) */
export function markNoticeSeen(updates: StoredUpdates, notice = WHATS_NEW.notice): StoredUpdates {
  return { ...updates, noticeSeen: Math.max(updates.noticeSeen, notice) };
}

export function shouldShowDialog(updates: StoredUpdates | null, hasProfile: boolean, notice = WHATS_NEW.notice): boolean {
  return hasProfile && updates !== null && updates.noticeSeen < notice;
}

export function parseUpdates(value: unknown): StoredUpdates | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.noticeSeen !== "number" || !Number.isInteger(v.noticeSeen) || v.noticeSeen < 0) return null;
  if (!Array.isArray(v.pending) || !v.pending.every((i) => UPDATE_ITEMS.includes(i as UpdateItem))) return null;
  const pending = UPDATE_ITEMS.filter((i) => (v.pending as unknown[]).includes(i));
  return { version: 1, noticeSeen: v.noticeSeen, pending };
}
