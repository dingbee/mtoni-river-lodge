/**
 * Lightweight in-process TTL cache for read-only, tenant-agnostic reads
 * (knowledge search, executive briefings, aggregates).
 *
 * Safe usage rules:
 *  - Never cache data scoped to a specific user/session/booking.
 *  - Only cache stable read-only queries (search results, aggregates).
 *  - Cache lives per Worker instance; entries expire and are bounded.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

function prune(now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  // hard cap: drop oldest if still over
  while (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export async function memoizeTTL<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  prune(now);
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidatePrefix(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}