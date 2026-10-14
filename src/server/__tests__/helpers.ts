// 서버 테스트 공용 도구: 메모리 DeviceRepository, 요청 만들기
import type { DeviceAuthRecord, DeviceRepository, RegisterResult } from "@shared/db/repositories.ts";
import { buildAuthHeaders } from "@shared/security/auth-headers.ts";
import { generateDeviceId, generateToken, hashToken } from "@shared/security/token.ts";

export interface MemoryDevices extends DeviceRepository {
  records: Map<string, DeviceAuthRecord>;
  touches: { deviceId: string; now: Date }[];
  nextRegisterResult?: RegisterResult;
}

export function createMemoryDevices(): MemoryDevices {
  const records = new Map<string, DeviceAuthRecord>();
  const touches: { deviceId: string; now: Date }[] = [];
  const repo: MemoryDevices = {
    records,
    touches,
    async register(deviceId, tokenHash) {
      if (repo.nextRegisterResult) return repo.nextRegisterResult;
      const existing = records.get(deviceId);
      if (existing) return existing.tokenHash === tokenHash ? "existing" : "conflict";
      records.set(deviceId, { tokenHash, lastSeenAt: new Date() });
      return "created";
    },
    async findAuth(deviceId) {
      return records.get(deviceId) ?? null;
    },
    async touch(deviceId, now) {
      touches.push({ deviceId, now });
      const record = records.get(deviceId);
      if (record) record.lastSeenAt = now;
    },
    async deleteAll(deviceId) {
      return records.delete(deviceId);
    },
  };
  return repo;
}

/** 저장소에 기기를 하나 넣고 자격 증명을 돌려준다. */
export async function seedDevice(devices: MemoryDevices, lastSeenAt: Date) {
  const credentials = { deviceId: generateDeviceId(), token: generateToken() };
  devices.records.set(credentials.deviceId, { tokenHash: await hashToken(credentials.token), lastSeenAt });
  return credentials;
}

export function request(
  method: string,
  options: { body?: string; headers?: Record<string, string>; credentials?: { deviceId: string; token: string } } = {},
): Request {
  const headers: Record<string, string> = { ...options.headers };
  if (options.credentials) Object.assign(headers, buildAuthHeaders(options.credentials));
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new Request("http://localhost/api/test", { method, headers, body: options.body });
}

export const silentSink = () => undefined;
