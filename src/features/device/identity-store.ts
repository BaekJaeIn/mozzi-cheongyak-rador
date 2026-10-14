// 기기 ID·토큰 보관 (L2, BR-U1-01). localStorage 'mz.device'
import { type DeviceCredentials } from "@shared/security/auth-headers.ts";
import { generateDeviceId, generateToken, isValidDeviceId, isValidToken } from "@shared/security/token.ts";

export const DEVICE_STORAGE_KEY = "mz.device";

/** localStorage와 같은 최소 기능 (테스트에서 메모리 구현으로 대체) */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createIdentity(): DeviceCredentials {
  return { deviceId: generateDeviceId(), token: generateToken() };
}

/** 저장된 값이 없거나 손상됐으면 null (손상된 값은 지운다). */
export function loadIdentity(storage: KeyValueStorage): DeviceCredentials | null {
  const raw = storage.getItem(DEVICE_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceCredentials>;
    if (isValidDeviceId(parsed.deviceId) && isValidToken(parsed.token)) {
      return { deviceId: parsed.deviceId, token: parsed.token };
    }
  } catch {
    // 아래에서 지운다
  }
  storage.removeItem(DEVICE_STORAGE_KEY);
  return null;
}

export function saveIdentity(storage: KeyValueStorage, identity: DeviceCredentials): void {
  storage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(storage: KeyValueStorage): void {
  storage.removeItem(DEVICE_STORAGE_KEY);
}

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}
