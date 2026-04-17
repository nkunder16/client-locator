interface CacheEntry<T> { data: T; ts: number }
const store = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string, ttlMs: number): T | null {
  const e = store.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() - e.ts > ttlMs) return null;
  return e.data;
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}
