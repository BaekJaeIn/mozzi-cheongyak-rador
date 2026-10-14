// 기준 데이터용 메모리 캐시 (L10, P-P1: 10분 TTL, 진행 중 요청 공유)

export const REFERENCE_TTL_MS = 10 * 60 * 1000;

/** 읽은 시각으로부터 ttl 미만이면 아직 유효하다. */
export function isFresh(loadedAt: number, now: number, ttlMs: number): boolean {
  return now - loadedAt < ttlMs;
}

export interface TtlCache<T> {
  get(): Promise<T>;
  /** 테스트·시드 변경 대응용 */
  clear(): void;
}

export function createTtlCache<T>(
  loader: () => Promise<T>,
  ttlMs: number = REFERENCE_TTL_MS,
  now: () => number = Date.now,
): TtlCache<T> {
  let value: { data: T; loadedAt: number } | null = null;
  let inflight: Promise<T> | null = null;

  return {
    get() {
      if (value && isFresh(value.loadedAt, now(), ttlMs)) return Promise.resolve(value.data);
      if (inflight) return inflight;
      inflight = loader()
        .then((data) => {
          value = { data, loadedAt: now() };
          return data;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    clear() {
      value = null;
    },
  };
}
