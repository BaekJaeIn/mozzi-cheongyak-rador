// 기기용 API 호출 래퍼 (L1, business-logic-model §1·§3, P-R1)
// - 처음이면 기기 등록, 모든 요청에 인증 헤더 첨부
// - 네트워크 오류·408·5xx는 1초 뒤 1번 재시도
// - 401 DEVICE_UNKNOWN / TOKEN_MISMATCH는 새 기기로 다시 등록하고 원래 요청을 1번 재시도 (BR-U1-09·10)
import { buildAuthHeaders, type DeviceCredentials } from "@shared/security/auth-headers.ts";
import { type ApiErrorBody, apiError, isApiErrorBody } from "@shared/http/errors.ts";
import { MAX_RETRIES, RETRY_DELAY_MS, shouldRetry } from "@shared/http/retry.ts";
import { clearIdentity, createIdentity, type KeyValueStorage, loadIdentity, saveIdentity } from "./identity-store";

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody };

export interface ApiClientDeps {
  storage: KeyValueStorage;
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const REREGISTER_CODES = new Set(["DEVICE_UNKNOWN", "TOKEN_MISMATCH"]);

export class DeviceSetupError extends Error {
  constructor(readonly error: ApiErrorBody) {
    super(error.message);
    this.name = "DeviceSetupError";
  }
}

export function createApiClient(deps: ApiClientDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const listeners = new Set<(identity: DeviceCredentials) => void>();

  /** 네트워크 오류·재시도 가능 상태면 1번 더 보낸다. 끝내 실패하면 null(네트워크 오류). */
  async function send(url: string, init: RequestInit): Promise<Response | null> {
    for (let attempt = 0; ; attempt++) {
      let response: Response | null = null;
      try {
        response = await deps.fetch(url, init);
      } catch {
        response = null;
      }
      const outcome = response ? { kind: "status" as const, status: response.status } : { kind: "network" as const };
      if (attempt >= MAX_RETRIES || !shouldRetry(outcome)) return response;
      await sleep(RETRY_DELAY_MS);
    }
  }

  async function toResult<T>(response: Response | null): Promise<ApiResult<T>> {
    if (!response) return { ok: false, status: 0, error: apiError("NETWORK") };
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return { ok: true, status: response.status, data: body as T };
    return { ok: false, status: response.status, error: isApiErrorBody(body) ? body : apiError("SERVER") };
  }

  async function register(identity: DeviceCredentials): Promise<ApiResult<unknown>> {
    return toResult(
      await send("/api/device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(identity),
      }),
    );
  }

  /** 새 ID·토큰을 만들어 등록한다. 409면 한 번 더 새로 만든다 (BR-U1-03). */
  async function registerNew(): Promise<DeviceCredentials> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const identity = createIdentity();
      const result = await register(identity);
      if (result.ok) {
        saveIdentity(deps.storage, identity);
        return identity;
      }
      if (result.error.code !== "DEVICE_CONFLICT") throw new DeviceSetupError(result.error);
    }
    throw new DeviceSetupError(apiError("DEVICE_CONFLICT"));
  }

  /** 등록된 기기면 네트워크 없이 바로 돌려준다 (NFR-U1-05). */
  async function ensureDevice(): Promise<DeviceCredentials> {
    return loadIdentity(deps.storage) ?? registerNew();
  }

  /**
   * @param options.reregister false면 기기 등록·재등록을 하지 않는다 (U4 모두 지우기: 빈 기기를 새로 만들어 지우지 않게).
   *        저장된 기기가 없으면 요청하지 않고 401 AUTH_MISSING을 돌려준다.
   */
  async function request<T>(path: string, init: RequestInit = {}, options: { reregister?: boolean } = {}): Promise<ApiResult<T>> {
    const reregister = options.reregister ?? true;
    let identity: DeviceCredentials;
    if (!reregister) {
      const stored = loadIdentity(deps.storage);
      if (!stored) return { ok: false, status: 401, error: apiError("AUTH_MISSING") };
      identity = stored;
    } else {
      try {
        identity = await ensureDevice();
      } catch (e) {
        return { ok: false, status: 0, error: e instanceof DeviceSetupError ? e.error : apiError("NETWORK") };
      }
    }

    const call = (id: DeviceCredentials) =>
      send(path, { ...init, headers: { ...(init.headers as Record<string, string>), ...buildAuthHeaders(id) } });

    let result = await toResult<T>(await call(identity));
    if (reregister && !result.ok && result.status === 401 && REREGISTER_CODES.has(result.error.code)) {
      clearIdentity(deps.storage);
      try {
        identity = await registerNew();
      } catch (e) {
        return { ok: false, status: 0, error: e instanceof DeviceSetupError ? e.error : apiError("NETWORK") };
      }
      listeners.forEach((listener) => listener(identity));
      result = await toResult<T>(await call(identity));
    }
    return result;
  }

  return {
    ensureDevice,
    request,
    /** 새 기기로 다시 등록됐을 때 알림 받기 (U4가 프로필 재동기화에 사용, BR-U1-09) */
    onReRegistered(listener: (identity: DeviceCredentials) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let browserClient: ApiClient | null = null;

/** 브라우저 전용 싱글턴 */
export function getApiClient(): ApiClient {
  if (!browserClient) {
    browserClient = createApiClient({ storage: window.localStorage, fetch: window.fetch.bind(window) });
  }
  return browserClient;
}
