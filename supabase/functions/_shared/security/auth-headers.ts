// 기기 인증 헤더 계약 (K3)
import { isValidDeviceId, isValidToken } from "./token.ts";

export const HEADER_DEVICE_ID = "x-device-id";
export const HEADER_DEVICE_TOKEN = "x-device-token";

export interface DeviceCredentials {
  deviceId: string;
  token: string;
}

export function buildAuthHeaders(credentials: DeviceCredentials): Record<string, string> {
  return {
    [HEADER_DEVICE_ID]: credentials.deviceId,
    [HEADER_DEVICE_TOKEN]: credentials.token,
  };
}

/** 헤더를 읽어 형식이 맞으면 자격 증명을, 없거나 형식이 틀리면 null을 돌려준다. */
export function parseAuthHeaders(headers: { get(name: string): string | null }): DeviceCredentials | null {
  const deviceId = headers.get(HEADER_DEVICE_ID);
  const token = headers.get(HEADER_DEVICE_TOKEN);
  if (!isValidDeviceId(deviceId) || !isValidToken(token)) return null;
  return { deviceId, token };
}
