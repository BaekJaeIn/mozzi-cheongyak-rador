// 테스트용 가짜 Supabase 클라이언트. 호출 기록을 남기고 미리 정한 응답을 돌려준다.
import type { DbClient } from "../client";

export interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
  /** select(…, { count: "exact" }) 결과 */
  count?: number | null;
}

export interface FakeCall {
  kind: "rpc" | "from";
  name: string;
  args?: unknown;
  chain: { method: string; args: unknown[] }[];
}

export function createFakeDb(responder: (call: FakeCall) => FakeResponse) {
  const calls: FakeCall[] = [];

  const builder = (call: FakeCall) => {
    const proxy: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "or", "update", "insert", "delete", "order", "maybeSingle", "single", "in", "lt", "range", "limit"]) {
      proxy[method] = (...args: unknown[]) => {
        call.chain.push({ method, args });
        return proxy;
      };
    }
    // await 가능하게 (PostgREST 빌더처럼 thenable)
    proxy.then = (resolve: (v: FakeResponse) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => responder(call))
        .then(resolve, reject);
    return proxy;
  };

  const db = {
    rpc(name: string, args?: unknown) {
      const call: FakeCall = { kind: "rpc", name, args, chain: [] };
      calls.push(call);
      return builder(call);
    },
    from(name: string) {
      const call: FakeCall = { kind: "from", name, chain: [] };
      calls.push(call);
      return builder(call);
    },
  } as unknown as DbClient;

  return { db, calls };
}
