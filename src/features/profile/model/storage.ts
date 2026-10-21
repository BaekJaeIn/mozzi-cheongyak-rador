// 기기 저장 (domain-entities §3, Q7=A 암호화 없음). localStorage를 KeyValueStorage로 주입받는다.
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import { parseProfile } from "@shared/domain/profile-migrate.ts";
import { DEVICE_STORAGE_KEY, type KeyValueStorage } from "@/features/device/identity-store";
import { DEFAULT_NOTIFY_HOUR, isValidHour } from "./hour";
import { isStepId, type StepId } from "./steps";
import type { WizardAnswers } from "./types";
import { parseUpdates, type StoredUpdates } from "./updates";

export const PROFILE_KEY = "mz.profile";
export const DRAFT_KEY = "mz.profile.draft";
/** 업데이트 안내 기록 (변경 2, domain-entities §7.4) */
export const UPDATES_KEY = "mz.updates";
export const NOTIFY_KEY = "mz.notify";
export const DISPLAY_KEY = "mz.display";
/** U5 관심 공고 — 모두 지우기에서 함께 지운다 (BR-U4-94) */
export const BOOKMARKS_KEY = "mz.bookmarks";
/** 관심 공고 ID 서버 동기화 상태 (변경 3 U6 BR-U6-D1~D3) */
export const BOOKMARKS_SYNC_KEY = "mz.bookmarks.sync";
/** U5 열어 본 공고·피드 저장본 — 모두 지우기에서 함께 지운다 (U5 BR-U5-42·53) */
export const SEEN_KEY = "mz.seen";
export const FEED_CACHE_KEY = "mz.feed";

export type SyncState =
  | { state: "synced"; at: string }
  | { state: "pending"; since: string; attempts: number }
  | { state: "failed"; code: "BAD_REQUEST" };

export interface StoredProfile {
  version: 1;
  profile: HouseholdProfile;
  savedAt: string;
  sync: SyncState;
}

export interface WizardDraft {
  version: 3;
  answers: WizardAnswers;
  stepId: StepId;
  updatedAt: string;
}

export interface NotifySettings {
  hour: number;
  enabled: boolean;
  /** 관심 공고 마감 알림 (변경 3 BR-U6-D40). 없으면 켜짐 — 옛 저장본 */
  deadlineEnabled?: boolean;
}

export interface StoredNotify extends NotifySettings {
  version: 1;
  updatedAt: string;
  sync: SyncState;
}

export type DisplayMode = "normal" | "easy";

export class LocalSaveError extends Error {
  constructor() {
    super("이 휴대폰에 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");
    this.name = "LocalSaveError";
  }
}

function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    throw new LocalSaveError();
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isSyncState(v: unknown): v is SyncState {
  if (!isObject(v)) return false;
  if (v.state === "synced") return typeof v.at === "string";
  if (v.state === "pending") return typeof v.since === "string" && typeof v.attempts === "number";
  return v.state === "failed" && v.code === "BAD_REQUEST";
}

// ---------- 프로필 ----------

/** 없거나 깨졌으면 null (깨진 값은 지우지 않는다 — 다음 저장이 덮어씀) */
export function loadStoredProfile(storage: KeyValueStorage): StoredProfile | null {
  const v = readJson(storage, PROFILE_KEY);
  if (!isObject(v) || v.version !== 1 || typeof v.savedAt !== "string" || !isSyncState(v.sync)) return null;
  const checked = parseProfile(v.profile); // 변경 2 전에 저장한 버전 1도 옮겨 읽는다 (BR-U2-C6)
  return checked.ok ? { version: 1, profile: checked.value, savedAt: v.savedAt, sync: v.sync } : null;
}

/** 기기에 저장된 원래 프로필 JSON의 schemaVersion (업데이트 안내 처음 기록용, BR-U4-C21). 없으면 null */
export function storedProfileSchemaVersion(storage: KeyValueStorage): number | null {
  const v = readJson(storage, PROFILE_KEY);
  if (!isObject(v) || !isObject(v.profile)) return null;
  return typeof v.profile.schemaVersion === "number" ? v.profile.schemaVersion : null;
}

export function saveStoredProfile(storage: KeyValueStorage, value: StoredProfile): void {
  writeJson(storage, PROFILE_KEY, value);
}

/** 새로 저장: 동기화 대기 (BR-U4-62) */
export function commitProfile(storage: KeyValueStorage, profile: HouseholdProfile, now: Date): StoredProfile {
  const at = now.toISOString();
  const stored: StoredProfile = { version: 1, profile, savedAt: at, sync: { state: "pending", since: at, attempts: 0 } };
  saveStoredProfile(storage, stored);
  return stored;
}

// ---------- 초안 ----------

/**
 * 초안 읽기 형식 맞추기 (domain-entities §7.3·§8.5, P-U4-C3·D4). 버전 3은 그대로, 1·2는 옮기고, 그 밖은 null.
 * 버전 1: 통장 "있음" → 명의 "나", 그 밖(없음·모름)은 지워 다시 묻는다. 화면 savingsHas → savingsOwner
 * 버전 2: 가구 종류 노부부 (화면·답 키는 그대로)
 */
export function migrateDraft(v: unknown): WizardDraft | null {
  if (!isObject(v) || !isObject(v.answers) || typeof v.updatedAt !== "string") return null;
  if (v.version === 3) return isStepId(v.stepId) ? { version: 3, answers: v.answers as WizardAnswers, stepId: v.stepId, updatedAt: v.updatedAt } : null;
  let answers = v.answers as Record<string, unknown>;
  let stepId = v.stepId;
  if (v.version === 1) {
    const { savingsHas, ...rest } = answers;
    answers = savingsHas === true ? { ...rest, savingsOwner: "self" } : rest;
    if (stepId === "savingsHas") stepId = "savingsOwner";
  } else if (v.version !== 2) return null;
  return isStepId(stepId) ? { version: 3, answers: { ...answers, householdKind: "senior" } as WizardAnswers, stepId, updatedAt: v.updatedAt } : null;
}

export function loadDraft(storage: KeyValueStorage): WizardDraft | null {
  const draft = migrateDraft(readJson(storage, DRAFT_KEY));
  if (!draft && storage.getItem(DRAFT_KEY) !== null) storage.removeItem(DRAFT_KEY); // 깨진 초안은 지우고 처음부터
  return draft;
}

export function saveDraft(storage: KeyValueStorage, answers: WizardAnswers, stepId: StepId, now: Date): void {
  writeJson(storage, DRAFT_KEY, { version: 3, answers, stepId, updatedAt: now.toISOString() } satisfies WizardDraft);
}

// ---------- 업데이트 안내 (변경 2) ----------

/** 없거나 깨졌으면 null → 부르는 쪽이 처음 기록을 만든다 */
export function loadUpdates(storage: KeyValueStorage): StoredUpdates | null {
  return parseUpdates(readJson(storage, UPDATES_KEY));
}

/** 저장 실패는 무시 — 안내가 한 번 더 뜰 뿐이다 */
export function saveUpdates(storage: KeyValueStorage, value: StoredUpdates): void {
  try {
    writeJson(storage, UPDATES_KEY, value);
  } catch {
    // LocalSaveError: 입력을 막지 않는다
  }
}

export function clearDraft(storage: KeyValueStorage): void {
  storage.removeItem(DRAFT_KEY);
}

// ---------- 알림 설정 ----------

export const DEFAULT_NOTIFY: NotifySettings = { hour: DEFAULT_NOTIFY_HOUR, enabled: true };

/** 없으면 null — 서버 기본값과 같으므로 보낼 것이 없다 */
export function loadStoredNotify(storage: KeyValueStorage): StoredNotify | null {
  const v = readJson(storage, NOTIFY_KEY);
  if (!isObject(v) || v.version !== 1 || !isValidHour(v.hour) || typeof v.enabled !== "boolean") return null;
  if (typeof v.updatedAt !== "string" || !isSyncState(v.sync)) return null;
  const deadline = typeof v.deadlineEnabled === "boolean" ? { deadlineEnabled: v.deadlineEnabled } : {};
  return { version: 1, hour: v.hour, enabled: v.enabled, ...deadline, updatedAt: v.updatedAt, sync: v.sync };
}

export function saveStoredNotify(storage: KeyValueStorage, value: StoredNotify): void {
  writeJson(storage, NOTIFY_KEY, value);
}

export function commitNotify(storage: KeyValueStorage, settings: NotifySettings, now: Date): StoredNotify {
  const at = now.toISOString();
  const stored: StoredNotify = { version: 1, ...settings, updatedAt: at, sync: { state: "pending", since: at, attempts: 0 } };
  saveStoredNotify(storage, stored);
  return stored;
}

// ---------- 화면 모드 ----------

export function loadDisplayMode(storage: KeyValueStorage): DisplayMode {
  try {
    return storage.getItem(DISPLAY_KEY) === "easy" ? "easy" : "normal";
  } catch {
    return "normal";
  }
}

export function saveDisplayMode(storage: KeyValueStorage, mode: DisplayMode): void {
  try {
    storage.setItem(DISPLAY_KEY, mode);
  } catch {
    // 저장이 막혀도 이번 화면에는 적용된다
  }
}

// ---------- 모두 지우기 (BR-U4-94) ----------

/** 프로필·초안·알림 설정·업데이트 기록·관심 공고(동기화 상태 포함)·열어 본 공고·피드 저장본·기기 ID를 지운다. 화면 모드는 남긴다 */
export function clearAllPersonal(storage: KeyValueStorage): void {
  for (const key of [PROFILE_KEY, DRAFT_KEY, NOTIFY_KEY, UPDATES_KEY, BOOKMARKS_KEY, BOOKMARKS_SYNC_KEY, SEEN_KEY, FEED_CACHE_KEY, DEVICE_STORAGE_KEY]) {
    storage.removeItem(key);
  }
}
