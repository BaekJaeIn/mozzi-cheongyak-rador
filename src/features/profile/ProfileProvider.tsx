"use client";

// 저장된 프로필·알림 설정과 동기화 상태 (frontend-components §3, business-logic-model §1)
// - 기기(localStorage)가 원본. 화면은 이 context로 읽고 저장한다
// - 동기화(flush)는 기기 준비가 끝난 뒤(SyncOnReady), 인터넷이 다시 연결될 때, 기기가 재등록될 때
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getApiClient } from "@/features/device/api-client";
import { clearFeedCache } from "@/features/feed/model/cache";
import { createSyncApi, deleteDeviceOnServer, type DeleteOutcome } from "./api";
import {
  clearAllPersonal,
  clearDraft,
  commitNotify,
  commitProfile,
  DEFAULT_NOTIFY,
  loadDraft,
  loadStoredNotify,
  loadStoredProfile,
  loadUpdates,
  type NotifySettings,
  saveUpdates,
  storedProfileSchemaVersion,
  type StoredNotify,
  type StoredProfile,
} from "./model/storage";
import { createProfileSync, type FlushResult, type ProfileSync } from "./model/sync";
import { initialUpdates, markNoticeSeen, resolveItems, type StoredUpdates, type UpdateItem } from "./model/updates";

export interface ProfileState {
  /** localStorage를 읽었는지 (읽기 전에는 화면을 정하지 않는다) */
  loaded: boolean;
  stored: StoredProfile | null;
  notify: NotifySettings;
  notifyStored: StoredNotify | null;
  hasDraft: boolean;
  /** 업데이트 안내 기록 (변경 2). 읽은 뒤에는 항상 있다 */
  updates: StoredUpdates | null;
}

export interface ProfileActions {
  /** 기기에 저장하고 서버로 보낸다. 서버 결과를 돌려준다 (BR-U4-62~66) */
  saveProfile(profile: HouseholdProfile, resolves?: readonly UpdateItem[]): Promise<FlushResult>;
  /** "새로 바뀐 점" 창을 띄웠다 (BR-U4-C22) */
  markNoticeSeen(): void;
  saveNotify(settings: NotifySettings): Promise<FlushResult>;
  /** 대기 중인 것을 지금 보낸다 */
  flushNow(): Promise<void>;
  /** 서버에 프로필이 없다고 할 때 — 보낸 것도 모두 다시 보낸다 (U5 BR-U5-64) */
  resendAll(): Promise<void>;
  deleteAll(): Promise<DeleteOutcome>;
  refresh(): void;
}

const ProfileContext = createContext<(ProfileState & ProfileActions) | null>(null);

/**
 * 업데이트 기록 (business-logic-model §8.1): 없으면 처음 기록을 계산한다. 저장은 창을 띄우거나 항목을 입력할 때만 —
 * 계산 결과는 저장된 프로필의 원래 버전으로만 정해지므로 다시 계산해도 같다(P-U4-C4), 모두 지운 뒤에는 처음 설치와 같다
 */
function readUpdates(storage: Storage): StoredUpdates {
  const existing = loadUpdates(storage);
  if (existing) return existing;
  const stored = loadStoredProfile(storage);
  return initialUpdates(stored ? { profile: stored.profile, storedSchemaVersion: storedProfileSchemaVersion(storage) ?? 1 } : null);
}

function readState(): ProfileState {
  const storage = window.localStorage;
  const notifyStored = loadStoredNotify(storage);
  const stored = loadStoredProfile(storage);
  return {
    loaded: true,
    stored,
    updates: readUpdates(storage),
    notify: notifyStored
      ? { hour: notifyStored.hour, enabled: notifyStored.enabled, ...(notifyStored.deadlineEnabled === undefined ? {} : { deadlineEnabled: notifyStored.deadlineEnabled }) } // 변경 3
      : DEFAULT_NOTIFY,
    notifyStored,
    hasDraft: loadDraft(storage) !== null,
  };
}

const INITIAL: ProfileState = { loaded: false, stored: null, notify: DEFAULT_NOTIFY, notifyStored: null, hasDraft: false, updates: null };

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState>(INITIAL);
  const syncRef = useRef<ProfileSync | null>(null);

  const sync = useCallback(() => {
    if (!syncRef.current) {
      syncRef.current = createProfileSync({ storage: window.localStorage, api: createSyncApi(getApiClient()) });
    }
    return syncRef.current;
  }, []);

  const refresh = useCallback(() => setState(readState()), []);

  const flushNow = useCallback(async () => {
    await sync().flush();
    refresh();
  }, [sync, refresh]);

  useEffect(() => {
    // 외부 저장소(localStorage)를 읽는 효과라 마운트 후 실행한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const onOnline = () => void flushNow();
    window.addEventListener("online", onOnline);
    const off = getApiClient().onReRegistered(() => {
      sync().markAllPending(); // BR-U4-67
      void flushNow();
    });
    return () => {
      window.removeEventListener("online", onOnline);
      off();
    };
  }, [refresh, flushNow, sync]);

  const value = useMemo<ProfileState & ProfileActions>(
    () => ({
      ...state,
      async saveProfile(profile, resolves = []) {
        // 저장 전 기록을 먼저 남긴다: v1 프로필을 v2로 덮어쓰면 아직 입력 안 한 새 항목을 다시 계산할 수 없다 (BR-U4-C21·C34·C36)
        const before = readUpdates(window.localStorage);
        commitProfile(window.localStorage, profile, new Date());
        saveUpdates(window.localStorage, resolveItems(before, resolves));
        clearDraft(window.localStorage);
        clearFeedCache(window.localStorage); // 바뀐 정보로 계산한 피드만 보이게 (U5 BR-U5-54)
        refresh();
        const result = (await sync().flush()).profile;
        refresh();
        return result;
      },
      async saveNotify(settings) {
        commitNotify(window.localStorage, settings, new Date());
        refresh();
        const result = (await sync().flush()).notify;
        refresh();
        return result;
      },
      markNoticeSeen() {
        saveUpdates(window.localStorage, markNoticeSeen(readUpdates(window.localStorage)));
        refresh();
      },
      flushNow,
      async resendAll() {
        sync().markAllPending();
        await flushNow();
      },
      async deleteAll() {
        const outcome = await deleteDeviceOnServer(getApiClient());
        if (outcome === "deleted") {
          clearAllPersonal(window.localStorage); // BR-U4-94
          refresh();
        }
        return outcome;
      },
      refresh,
    }),
    [state, refresh, sync, flushNow],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState & ProfileActions {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("ProfileProvider 안에서만 쓸 수 있어요");
  return ctx;
}

/** 기기 준비(DeviceBootstrap)가 끝난 뒤 한 번 대기 중인 것을 보낸다 (BR-U4-64) */
export function SyncOnReady() {
  const { flushNow } = useProfile();
  useEffect(() => {
    void flushNow();
  }, [flushNow]);
  return null;
}
